import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { one, many, query } from '../db/pool.js';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest, notFound } from '../utils/errors.js';
import { audit } from '../services/audit.js';
import {
  createSchema, updateSchema, createCandidate, updateCandidate, listCandidates, exportRows,
  publicCandidate, preparePhone, findByPhone, STATUSES,
} from '../services/candidates.js';
import { toXlsx, toCsv, templateXlsx, parseUpload } from '../services/spreadsheet.js';
import { saveFile, deleteCandidateFiles } from '../services/storage.js';
import { matchCandidateToVacancies } from '../services/matching.js';
import { checkinCandidates, sendOutreach } from '../services/outreach.js';
import { windowOpen } from '../services/whatsapp.js';
import { getSetting } from '../services/settings.js';
import { z } from 'zod';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 } });
const editor = requireRole('recruiter');

router.get('/', async (req, res) => {
  res.json(await listCandidates(req.query));
});

router.get('/statuses', (_req, res) => res.json(STATUSES));

router.get('/check-phone', async (req, res) => {
  let phone;
  try { phone = await preparePhone(req.query.phone); } catch { return res.json({ valid: false }); }
  const existing = await findByPhone(phone);
  res.json({ valid: true, phone, exists: !!existing, existingId: existing?.id || null, existingName: existing?.full_name || null });
});

router.get('/export', async (req, res) => {
  const rows = await exportRows(req.query);
  const stamp = new Date().toISOString().slice(0, 10);
  await audit(req.user.id, 'export_candidates', 'candidate', null, `${rows.length} rows, ${req.query.format || 'xlsx'}`);
  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="candidates-${stamp}.csv"`);
    return res.send(toCsv(rows));
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="candidates-${stamp}.xlsx"`);
  res.send(Buffer.from(await toXlsx(rows)));
});

router.get('/import-template', async (_req, res) => {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="candidate-import-template.xlsx"');
  res.send(Buffer.from(await templateXlsx()));
});

// Import from Excel (.xlsx) or CSV. Duplicates (same phone) are skipped and reported.
router.post('/import', editor, upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('Kies een Excel- of CSV-bestand');
  if (!/\.(xlsx|csv)$/i.test(req.file.originalname)) throw badRequest('Alleen .xlsx- en .csv-bestanden kunnen worden geïmporteerd');
  let rows;
  try {
    rows = await parseUpload(req.file.buffer, req.file.originalname);
  } catch {
    throw badRequest('Het bestand kon niet worden gelezen. Gebruik het voorbeeldbestand.');
  }
  const result = { created: 0, duplicates: [], errors: [] };
  for (const [i, raw] of rows.entries()) {
    const line = i + 2;
    if (!STATUSES.includes(raw.status)) delete raw.status;
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
      result.errors.push({ line, error: parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ') });
      continue;
    }
    try {
      await createCandidate(parsed.data, { userId: req.user.id, source: 'import' });
      result.created += 1;
    } catch (err) {
      if (err.status === 409) result.duplicates.push({ line, phone: raw.phone, existingId: err.details?.existingId });
      else result.errors.push({ line, error: err.message });
    }
  }
  await audit(req.user.id, 'import_candidates', 'candidate', null, `${result.created} created`);
  res.json(result);
});

// "Are you still looking for work?" – preview and send to all candidates who are not placed.
router.get('/checkin-preview', editor, async (_req, res) => {
  const list = await checkinCandidates();
  const inWindow = list.filter((c) => windowOpen(c.last_inbound_at)).length;
  res.json({
    total: list.length,
    in_window: inWindow,
    outside_window: list.length - inWindow,
    template_set: !!(await getSetting('bot.checkin_template_name')),
  });
});

router.post('/checkin', editor, validate(z.object({ confirm: z.literal(true, { message: 'Bevestig dat je het bericht wilt versturen' }) })), async (req, res) => {
  const list = await checkinCandidates();
  const result = await sendOutreach({ candidates: list, kind: 'checkin', userId: req.user.id });
  await audit(req.user.id, 'send_checkin', 'candidate', null, `${result.sent} verstuurd`);
  res.json(result);
});

router.post('/', editor, validate(createSchema), async (req, res) => {
  const c = await createCandidate(req.body, { userId: req.user.id });
  await audit(req.user.id, 'create', 'candidate', c.id);
  res.status(201).json(publicCandidate(c));
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const c = await one('SELECT * FROM candidates WHERE id = $1', [id]);
  if (!c) throw notFound('Kandidaat niet gevonden');
  const [files, conversation, submissions, history] = await Promise.all([
    many('SELECT id, kind, original_name, mime_type, size_bytes, source, created_at FROM candidate_files WHERE candidate_id = $1 ORDER BY created_at DESC', [id]),
    one('SELECT id, mode, status, bot_step, unread_count, last_inbound_at, last_message_at, simulated FROM conversations WHERE candidate_id = $1', [id]),
    many(`SELECT s.*, v.title AS vacancy_title, a.name AS agency_name FROM submissions s
          LEFT JOIN vacancies v ON v.id = s.vacancy_id LEFT JOIN agencies a ON a.id = s.agency_id
          WHERE s.candidate_id = $1 ORDER BY s.created_at DESC`, [id]),
    many(`SELECT h.*, u.name AS user_name FROM candidate_status_history h LEFT JOIN users u ON u.id = h.user_id
          WHERE h.candidate_id = $1 ORDER BY h.changed_at DESC LIMIT 50`, [id]),
  ]);
  res.json({ ...publicCandidate(c), files, conversation, submissions, history });
});

router.patch('/:id', editor, validate(updateSchema), async (req, res) => {
  const c = await updateCandidate(Number(req.params.id), req.body, { userId: req.user.id });
  res.json(publicCandidate(c));
});

router.get('/:id/matches', async (req, res) => {
  const c = await one('SELECT * FROM candidates WHERE id = $1', [Number(req.params.id)]);
  if (!c) throw notFound();
  res.json(await matchCandidateToVacancies(c));
});

router.post('/:id/files', editor, upload.single('file'), async (req, res) => {
  const id = Number(req.params.id);
  if (!req.file) throw badRequest('Kies een bestand');
  if (!(await one('SELECT id FROM candidates WHERE id = $1', [id]))) throw notFound();
  const f = await saveFile({
    candidateId: id, buffer: req.file.buffer, originalName: req.file.originalname,
    mimeType: req.file.mimetype, userId: req.user.id, kind: ['other', 'voice'].includes(req.body.kind) ? req.body.kind : String(req.file.mimetype || '').startsWith('audio/') ? 'voice' : 'cv',
  });
  await audit(req.user.id, 'upload_file', 'candidate', id, f.original_name);
  const { stored_name, ...safe } = f;
  res.status(201).json(safe);
});

// GDPR: export everything we store about one candidate (right of access).
router.get('/:id/data-export', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const c = await one('SELECT * FROM candidates WHERE id = $1', [id]);
  if (!c) throw notFound();
  const conv = await one('SELECT * FROM conversations WHERE candidate_id = $1', [id]);
  const data = {
    exported_at: new Date().toISOString(),
    candidate: publicCandidate(c),
    files: await many('SELECT original_name, mime_type, size_bytes, source, created_at FROM candidate_files WHERE candidate_id = $1', [id]),
    messages: conv ? await many('SELECT direction, type, body, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at', [conv.id]) : [],
    submissions: await many('SELECT s.status, s.created_at, s.sent_at, a.name AS agency FROM submissions s LEFT JOIN agencies a ON a.id = s.agency_id WHERE candidate_id = $1', [id]),
  };
  await audit(req.user.id, 'gdpr_export', 'candidate', id);
  res.setHeader('Content-Disposition', `attachment; filename="candidate-${id}-data.json"`);
  res.json(data);
});

// GDPR: permanently delete a candidate, their messages and files (right to erasure). Admin only.
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const c = await one('SELECT id FROM candidates WHERE id = $1', [id]);
  if (!c) throw notFound();
  await deleteCandidateFiles(id);
  await query('DELETE FROM candidates WHERE id = $1', [id]); // cascades to messages, files, submissions
  await audit(req.user.id, 'delete', 'candidate', id, 'candidate and all related data deleted');
  res.json({ ok: true });
});

export default router;
