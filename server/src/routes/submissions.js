import { Router } from 'express';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { one, many, query } from '../db/pool.js';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest, notFound } from '../utils/errors.js';
import { audit } from '../services/audit.js';
import { computeMatch } from '../services/matching.js';
import { updateCandidate } from '../services/candidates.js';
import { sendMail } from '../services/mailer.js';
import { filePath } from '../services/storage.js';
import { formatPhone } from '../utils/phone.js';

const router = Router();
const editor = requireRole('recruiter');

const LIST_SQL = `
  SELECT s.*, c.full_name, c.phone, v.title AS vacancy_title, a.name AS agency_name, a.email AS agency_email, u.name AS approved_by_name
  FROM submissions s
  JOIN candidates c ON c.id = s.candidate_id
  LEFT JOIN vacancies v ON v.id = s.vacancy_id
  LEFT JOIN agencies a ON a.id = s.agency_id
  LEFT JOIN users u ON u.id = s.approved_by`;

router.get('/', async (req, res) => {
  const where = [];
  const values = [];
  if (req.query.status) { values.push(String(req.query.status)); where.push(`s.status = $${values.length}`); }
  if (req.query.agency_id) { values.push(Number(req.query.agency_id)); where.push(`s.agency_id = $${values.length}`); }
  res.json(await many(`${LIST_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY s.updated_at DESC LIMIT 500`, values));
});

// Step 1: propose a candidate for a vacancy/agency. Nothing is sent yet.
router.post('/', editor, validate(z.object({
  candidate_id: z.coerce.number().int().positive(),
  vacancy_id: z.coerce.number().int().positive().nullable().optional(),
  agency_id: z.coerce.number().int().positive().nullable().optional(),
  notes: z.string().trim().max(3000).nullable().optional(),
})), async (req, res) => {
  const candidate = await one('SELECT * FROM candidates WHERE id = $1', [req.body.candidate_id]);
  if (!candidate) throw notFound('Kandidaat niet gevonden');
  let agencyId = req.body.agency_id || null;
  let score = null;
  if (req.body.vacancy_id) {
    const vacancy = await one('SELECT * FROM vacancies WHERE id = $1', [req.body.vacancy_id]);
    if (!vacancy) throw notFound('Vacature niet gevonden');
    agencyId = agencyId || vacancy.agency_id;
    score = computeMatch(candidate, vacancy).score;
  }
  if (!agencyId) throw badRequest('Kies een bureau (of een vacature die aan een bureau is gekoppeld)');
  const s = await one(
    `INSERT INTO submissions(candidate_id, vacancy_id, agency_id, match_score, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [candidate.id, req.body.vacancy_id || null, agencyId, score, req.body.notes || null],
  );
  await audit(req.user.id, 'propose', 'submission', s.id);
  res.status(201).json(s);
});

// Step 2: the recruiter approves and sends. Optionally emails the agency with the CV attached.
router.post('/:id/send', editor, validate(z.object({
  confirm: z.literal(true, { message: 'Bevestig dat je deze kandidaat wilt versturen' }),
  send_email: z.boolean().default(false),
  cv_file_id: z.coerce.number().int().positive().nullable().optional(),
  message: z.string().trim().max(5000).optional(),
})), async (req, res) => {
  const s = await one(`${LIST_SQL} WHERE s.id = $1`, [Number(req.params.id)]);
  if (!s) throw notFound('Voorstel niet gevonden');
  const candidate = await one('SELECT * FROM candidates WHERE id = $1', [s.candidate_id]);
  let cv = null;
  if (req.body.cv_file_id) {
    cv = await one('SELECT * FROM candidate_files WHERE id = $1 AND candidate_id = $2', [req.body.cv_file_id, s.candidate_id]);
    if (!cv) throw badRequest('Dit cv hoort niet bij deze kandidaat');
  }
  let emailed = false;
  if (req.body.send_email) {
    if (!s.agency_email) throw badRequest('Dit bureau heeft geen e-mailadres');
    if (!candidate.consent_given) throw badRequest('De kandidaat heeft geen privacytoestemming gegeven. Vraag eerst toestemming voordat je gegevens deelt.');
    const lines = [
      req.body.message || `Beste ${s.agency_name || 'collega'},\n\nHieronder vind je een kandidaat${s.vacancy_title ? ` voor "${s.vacancy_title}"` : ''}.`,
      '',
      `Naam: ${candidate.full_name || '-'}`,
      `Telefoon: ${formatPhone(candidate.phone)}`,
      candidate.email ? `E-mail: ${candidate.email}` : null,
      candidate.age ? `Leeftijd: ${candidate.age}` : null,
      candidate.nationality ? `Nationaliteit: ${candidate.nationality}` : null,
      `Woonplaats: ${[candidate.current_city, candidate.current_country].filter(Boolean).join(', ') || '-'}`,
      `Engels: ${{ none: 'geen', basic: 'een beetje', good: 'goed', fluent: 'vloeiend' }[candidate.english_level] || '-'}`,
      `Rijbewijs: ${candidate.driving_licence ? 'ja' : 'nee'} / Eigen auto: ${candidate.own_car ? 'ja' : 'nee'}`,
      `Certificaten: ${[candidate.forklift && 'heftruck', candidate.ept && 'EPT', candidate.reach_truck && 'reachtruck'].filter(Boolean).join(', ') || 'geen'}`,
      candidate.work_experience ? `Ervaring: ${candidate.work_experience}` : null,
      candidate.availability ? `Beschikbaar: ${candidate.availability}` : null,
    ].filter((l) => l !== null);
    const attachments = cv ? [{ filename: cv.original_name, content: await fs.readFile(filePath(cv.stored_name)), contentType: cv.mime_type }] : [];
    await sendMail({ to: s.agency_email, subject: `Kandidaat: ${candidate.full_name || 'nieuwe kandidaat'}${s.vacancy_title ? ` - ${s.vacancy_title}` : ''}`, text: lines.join('\n'), attachments });
    emailed = true;
  }
  const updated = await one(
    `UPDATE submissions SET status = 'sent', approved_by = $1, sent_at = now(), cv_file_id = $2, updated_at = now() WHERE id = $3 RETURNING *`,
    [req.user.id, cv?.id || null, s.id],
  );
  if (['new', 'contacted', 'information_requested', 'information_complete', 'available'].includes(candidate.status)) {
    await updateCandidate(candidate.id, { status: 'sent_to_agency' }, { userId: req.user.id });
  }
  await audit(req.user.id, 'send_to_agency', 'submission', s.id, emailed ? 'emailed' : 'marked as sent');
  res.json({ ...updated, emailed });
});

const STATUS_TO_CANDIDATE = { interview: 'interview', placed: 'placed' };

router.patch('/:id', editor, validate(z.object({
  status: z.enum(['proposed', 'sent', 'interview', 'placed', 'rejected', 'withdrawn']).optional(),
  interview_at: z.string().datetime({ offset: true, local: true }).nullable().optional(),
  notes: z.string().trim().max(3000).nullable().optional(),
})), async (req, res) => {
  const current = await one('SELECT * FROM submissions WHERE id = $1', [Number(req.params.id)]);
  if (!current) throw notFound();
  const s = await one(
    `UPDATE submissions SET status = $1, interview_at = $2, notes = $3, updated_at = now() WHERE id = $4 RETURNING *`,
    [req.body.status ?? current.status,
      req.body.interview_at !== undefined ? req.body.interview_at : current.interview_at,
      req.body.notes !== undefined ? req.body.notes : current.notes, current.id],
  );
  const cs = STATUS_TO_CANDIDATE[req.body.status];
  if (cs) await updateCandidate(s.candidate_id, { status: cs }, { userId: req.user.id });
  await audit(req.user.id, 'update', 'submission', s.id, req.body.status);
  res.json(s);
});

router.delete('/:id', editor, async (req, res) => {
  const s = await one('SELECT * FROM submissions WHERE id = $1', [Number(req.params.id)]);
  if (!s) throw notFound();
  if (s.status !== 'proposed' && req.user.role !== 'admin') throw badRequest('Alleen voorstellen die nog niet zijn verstuurd, kunnen worden verwijderd');
  await query('DELETE FROM submissions WHERE id = $1', [s.id]);
  res.json({ ok: true });
});

export default router;
