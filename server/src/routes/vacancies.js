import { Router } from 'express';
import { z } from 'zod';
import { one, many, query } from '../db/pool.js';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { notFound } from '../utils/errors.js';
import { audit } from '../services/audit.js';
import { matchVacancyToCandidates, goodMatchCounts } from '../services/matching.js';
import { sendOutreach } from '../services/outreach.js';

const router = Router();
const t = (max) => z.string().trim().max(max).nullable().optional().transform((v) => (v === '' ? null : v));

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  agency_id: z.coerce.number().int().positive().nullable().optional(),
  location: t(200),
  salary: t(100),
  working_hours: t(100),
  req_driving_licence: z.boolean().default(false),
  req_own_car: z.boolean().default(false),
  req_forklift: z.boolean().default(false),
  req_ept: z.boolean().default(false),
  req_reach_truck: z.boolean().default(false),
  req_experience: z.boolean().default(false),
  required_experience: t(1000),
  min_english_level: z.enum(['none', 'basic', 'good', 'fluent']).default('none'),
  required_languages: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  positions: z.coerce.number().int().min(0).max(10000).default(1),
  description: t(10000),
  status: z.enum(['open', 'paused', 'filled', 'closed']).default('open'),
});

const FIELDS = Object.keys(schema.shape);

router.get('/', async (req, res) => {
  const where = [];
  const values = [];
  if (req.query.q) { values.push(`%${req.query.q}%`); where.push(`(v.title ILIKE $${values.length} OR v.location ILIKE $${values.length})`); }
  if (req.query.status) { values.push(String(req.query.status)); where.push(`v.status = $${values.length}`); }
  if (req.query.agency_id) { values.push(Number(req.query.agency_id)); where.push(`v.agency_id = $${values.length}`); }
  const rows = await many(`
    SELECT v.*, a.name AS agency_name,
      (SELECT count(*) FROM submissions s WHERE s.vacancy_id = v.id) AS submission_count
    FROM vacancies v LEFT JOIN agencies a ON a.id = v.agency_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY CASE v.status WHEN 'open' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, v.created_at DESC`, values);
  const counts = await goodMatchCounts(rows);
  res.json(rows.map((v) => ({ ...v, good_matches: counts[v.id] })));
});

router.get('/:id', async (req, res) => {
  const v = await one('SELECT v.*, a.name AS agency_name FROM vacancies v LEFT JOIN agencies a ON a.id = v.agency_id WHERE v.id = $1', [Number(req.params.id)]);
  if (!v) throw notFound('Vacature niet gevonden');
  const submissions = await many(`
    SELECT s.*, c.full_name, c.phone FROM submissions s JOIN candidates c ON c.id = s.candidate_id
    WHERE s.vacancy_id = $1 ORDER BY s.created_at DESC`, [v.id]);
  res.json({ ...v, submissions });
});

router.get('/:id/matches', async (req, res) => {
  const v = await one('SELECT * FROM vacancies WHERE id = $1', [Number(req.params.id)]);
  if (!v) throw notFound('Vacature niet gevonden');
  res.json(await matchVacancyToCandidates(v, { minScore: Number(req.query.min_score) || 0 }));
});

// Send this vacancy via WhatsApp to the selected candidates (they answer YES/NO).
router.post('/:id/send-to-candidates', requireRole('recruiter'), validate(z.object({
  candidate_ids: z.array(z.coerce.number().int().positive()).min(1).max(200),
  confirm: z.literal(true, { message: 'Bevestig dat je de vacature wilt versturen' }),
})), async (req, res) => {
  const v = await one('SELECT * FROM vacancies WHERE id = $1', [Number(req.params.id)]);
  if (!v) throw notFound('Vacature niet gevonden');
  const candidates = await many(`SELECT * FROM candidates WHERE id = ANY($1) AND deletion_requested_at IS NULL`, [req.body.candidate_ids]);
  const result = await sendOutreach({ candidates, kind: 'vacancy', vacancy: v, userId: req.user.id });
  await audit(req.user.id, 'send_vacancy', 'vacancy', v.id, `${result.sent} verstuurd`);
  res.json(result);
});

router.post('/', requireRole('recruiter'), validate(schema), async (req, res) => {
  const values = FIELDS.map((f) => req.body[f] ?? null);
  const v = await one(
    `INSERT INTO vacancies(${FIELDS.join(',')}) VALUES (${FIELDS.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
    values,
  );
  await audit(req.user.id, 'create', 'vacancy', v.id);
  res.status(201).json(v);
});

router.put('/:id', requireRole('recruiter'), validate(schema), async (req, res) => {
  const values = FIELDS.map((f) => req.body[f] ?? null);
  values.push(Number(req.params.id));
  const v = await one(
    `UPDATE vacancies SET ${FIELDS.map((f, i) => `${f} = $${i + 1}`).join(', ')}, updated_at = now()
     WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!v) throw notFound('Vacature niet gevonden');
  res.json(v);
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const { rowCount } = await query('DELETE FROM vacancies WHERE id = $1', [Number(req.params.id)]);
  if (!rowCount) throw notFound();
  await audit(req.user.id, 'delete', 'vacancy', Number(req.params.id));
  res.json({ ok: true });
});

export default router;
