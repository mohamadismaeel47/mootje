import { Router } from 'express';
import { z } from 'zod';
import { one, many, query } from '../db/pool.js';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { notFound } from '../utils/errors.js';
import { audit } from '../services/audit.js';

const router = Router();
const t = (max) => z.string().trim().max(max).nullable().optional().transform((v) => (v === '' ? null : v));

const schema = z.object({
  name: z.string().trim().min(1).max(150),
  contact_person: t(150),
  email: z.string().trim().max(200).nullable().optional()
    .transform((v) => (v ? v.toLowerCase() : null))
    .refine((v) => !v || z.string().email().safeParse(v).success, 'Ongeldig e-mailadres'),
  phone: t(40),
  address: t(300),
  notes: t(5000),
});

router.get('/', async (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : null;
  res.json(await many(`
    SELECT a.*,
      (SELECT count(*) FROM vacancies v WHERE v.agency_id = a.id AND v.status = 'open') AS active_vacancies,
      (SELECT count(*) FROM submissions s WHERE s.agency_id = a.id AND s.status <> 'proposed') AS candidates_sent
    FROM agencies a
    WHERE ($1::text IS NULL OR a.name ILIKE $1 OR a.contact_person ILIKE $1 OR a.email ILIKE $1)
    ORDER BY a.name`, [q]));
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const agency = await one('SELECT * FROM agencies WHERE id = $1', [id]);
  if (!agency) throw notFound('Bureau niet gevonden');
  const vacancies = await many('SELECT id, title, location, status, positions FROM vacancies WHERE agency_id = $1 ORDER BY created_at DESC', [id]);
  const submissions = await many(`
    SELECT s.id, s.status, s.sent_at, s.created_at, s.match_score, c.id AS candidate_id, c.full_name, v.title AS vacancy_title
    FROM submissions s JOIN candidates c ON c.id = s.candidate_id LEFT JOIN vacancies v ON v.id = s.vacancy_id
    WHERE s.agency_id = $1 ORDER BY s.created_at DESC`, [id]);
  res.json({ ...agency, vacancies, submissions });
});

router.post('/', requireRole('recruiter'), validate(schema), async (req, res) => {
  const b = req.body;
  const a = await one(
    'INSERT INTO agencies(name, contact_person, email, phone, address, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [b.name, b.contact_person, b.email, b.phone, b.address, b.notes],
  );
  await audit(req.user.id, 'create', 'agency', a.id);
  res.status(201).json(a);
});

router.put('/:id', requireRole('recruiter'), validate(schema), async (req, res) => {
  const b = req.body;
  const a = await one(
    `UPDATE agencies SET name=$1, contact_person=$2, email=$3, phone=$4, address=$5, notes=$6, updated_at=now()
     WHERE id=$7 RETURNING *`,
    [b.name, b.contact_person, b.email, b.phone, b.address, b.notes, Number(req.params.id)],
  );
  if (!a) throw notFound('Bureau niet gevonden');
  res.json(a);
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const { rowCount } = await query('DELETE FROM agencies WHERE id = $1', [Number(req.params.id)]);
  if (!rowCount) throw notFound();
  await audit(req.user.id, 'delete', 'agency', Number(req.params.id));
  res.json({ ok: true });
});

export default router;
