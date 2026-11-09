import { z } from 'zod';
import { one, many, query } from '../db/pool.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { normalizePhone, isValidPhone } from '../utils/phone.js';
import { getSetting } from './settings.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';

export const STATUSES = [
  'new', 'contacted', 'information_requested', 'information_complete', 'available',
  'sent_to_agency', 'interview', 'placed', 'rejected', 'not_interested',
];
export const ENGLISH_LEVELS = ['none', 'basic', 'good', 'fluent'];

const optText = (max = 500) => z.string().trim().max(max).nullable().optional()
  .transform((v) => (v === '' ? null : v));
const optBool = z.boolean().nullable().optional();
const optDate = z.string().trim().nullable().optional()
  .transform((v) => (v ? v : v === '' ? null : v))
  .refine((v) => v === null || v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use the format YYYY-MM-DD');

// Every field that can be edited. Used for both create and update.
export const candidateFields = {
  full_name: optText(150),
  phone: z.string().trim().min(6).max(30),
  email: z.string().trim().max(200).nullable().optional()
    .transform((v) => (v ? v.toLowerCase() : v === '' ? null : v))
    .refine((v) => !v || z.string().email().safeParse(v).success, 'Invalid email address'),
  nationality: optText(100),
  current_country: optText(100),
  current_city: optText(100),
  has_bsn: optBool,
  bsn: z.string().trim().nullable().optional()
    .transform((v) => (v ? v.replace(/\D/g, '') : v))
    .refine((v) => !v || /^\d{8,9}$/.test(v), 'A BSN has 8 or 9 digits'),
  date_of_birth: optDate,
  age: z.coerce.number().int().min(14).max(100).nullable().optional(),
  languages: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  english_level: z.enum(ENGLISH_LEVELS).nullable().optional(),
  driving_licence: optBool,
  own_car: optBool,
  forklift: optBool,
  ept: optBool,
  reach_truck: optBool,
  has_experience: optBool,
  work_experience: optText(3000),
  previous_jobs: optText(3000),
  desired_job: optText(500),
  availability: optText(300),
  available_from: optDate,
  notes: optText(10000),
  status: z.enum(STATUSES).optional(),
  preferred_language: z.string().trim().max(5).optional(),
  consent_given: z.boolean().optional(),
};

export const createSchema = z.object(candidateFields);
export const updateSchema = z.object(candidateFields).partial();

const COLUMNS = Object.keys(candidateFields).filter((k) => k !== 'bsn');
const LEVELS_SQL = "ARRAY['none','basic','good','fluent']";

export async function preparePhone(raw) {
  const cc = await getSetting('general.default_country_code');
  const phone = normalizePhone(raw, cc);
  if (!isValidPhone(phone)) throw badRequest('Phone number is not valid. Use the international format, for example +31612345678');
  return phone;
}

export function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) age -= 1;
  return age >= 14 && age <= 100 ? age : null;
}

// Strip the encrypted BSN. Callers get a masked hint only; the full number has its own audited admin endpoint.
export function publicCandidate(c) {
  if (!c) return c;
  const { bsn_encrypted, ...rest } = c;
  let bsnHint = null;
  if (bsn_encrypted) {
    try { bsnHint = `•••••${decrypt(bsn_encrypted).slice(-3)}`; } catch { bsnHint = 'stored'; }
  }
  return { ...rest, bsn_stored: !!bsn_encrypted, bsn_hint: bsnHint };
}

export async function findByPhone(phone) {
  return one('SELECT * FROM candidates WHERE phone = $1', [phone]);
}

export async function createCandidate(data, { userId, source = 'manual' } = {}) {
  const phone = await preparePhone(data.phone);
  const existing = await findByPhone(phone);
  if (existing) throw conflict('A candidate with this phone number already exists', { existingId: existing.id });
  const row = { ...data, phone };
  if (row.date_of_birth && !row.age) row.age = ageFromDob(row.date_of_birth);
  const cols = COLUMNS.filter((k) => row[k] !== undefined);
  const values = cols.map((k) => row[k]);
  cols.push('source'); values.push(source);
  if (data.bsn) { cols.push('bsn_encrypted'); values.push(encrypt(data.bsn)); }
  if (data.consent_given) { cols.push('consent_at', 'consent_source'); values.push(new Date(), source); }
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const created = await one(
    `INSERT INTO candidates(${cols.join(',')}) VALUES (${placeholders.join(',')}) RETURNING *`,
    values,
  );
  await query('INSERT INTO candidate_status_history(candidate_id, from_status, to_status, user_id) VALUES ($1,NULL,$2,$3)', [
    created.id, created.status, userId || null,
  ]);
  return created;
}

export async function updateCandidate(id, data, { userId } = {}) {
  const current = await one('SELECT * FROM candidates WHERE id = $1', [id]);
  if (!current) throw notFound('Candidate not found');
  const row = { ...data };
  if (row.phone !== undefined) {
    row.phone = await preparePhone(row.phone);
    if (row.phone !== current.phone) {
      const other = await findByPhone(row.phone);
      if (other) throw conflict('Another candidate already uses this phone number', { existingId: other.id });
    }
  }
  if (row.date_of_birth && row.age === undefined) row.age = ageFromDob(row.date_of_birth);
  const sets = [];
  const values = [];
  for (const k of COLUMNS) {
    if (row[k] === undefined) continue;
    values.push(row[k]);
    sets.push(`${k} = $${values.length}`);
  }
  if (data.bsn !== undefined) {
    values.push(data.bsn ? encrypt(data.bsn) : null);
    sets.push(`bsn_encrypted = $${values.length}`);
  }
  if (data.consent_given === true && !current.consent_given) sets.push('consent_at = now()', "consent_source = COALESCE(consent_source, 'manual')");
  if (data.consent_given === false) sets.push('consent_at = NULL');
  const statusChanged = data.status && data.status !== current.status;
  if (statusChanged) sets.push('status_changed_at = now()');
  if (!sets.length) return current;
  sets.push('updated_at = now()');
  values.push(id);
  const updated = await one(`UPDATE candidates SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values);
  if (statusChanged) {
    await query('INSERT INTO candidate_status_history(candidate_id, from_status, to_status, user_id) VALUES ($1,$2,$3,$4)', [
      id, current.status, data.status, userId || null,
    ]);
  }
  return updated;
}

// Shared filter builder for the list and the export.
export function buildFilters(q) {
  const where = [];
  const values = [];
  const add = (sql, v) => { values.push(v); where.push(sql.replace('?', `$${values.length}`)); };
  if (q.q) {
    values.push(`%${String(q.q).trim()}%`);
    const t = `$${values.length}`;
    let cond = `(full_name ILIKE ${t} OR email ILIKE ${t} OR current_city ILIKE ${t} OR nationality ILIKE ${t} OR desired_job ILIKE ${t}`;
    const digits = String(q.q).replace(/\D/g, '');
    if (digits.length >= 3) { values.push(`%${digits}%`); cond += ` OR phone LIKE $${values.length}`; }
    where.push(`${cond})`);
  }
  if (q.status) {
    const list = String(q.status).split(',').filter((s) => STATUSES.includes(s));
    if (list.length) add('status = ANY(?)', list);
  }
  for (const flag of ['driving_licence', 'own_car', 'forklift', 'ept', 'reach_truck', 'has_bsn', 'has_experience']) {
    if (q[flag] === 'true') where.push(`${flag} = true`);
    if (q[flag] === 'false') where.push(`${flag} IS NOT TRUE`);
  }
  if (q.english_level && ENGLISH_LEVELS.includes(q.english_level)) {
    add(`array_position(${LEVELS_SQL}, english_level) >= array_position(${LEVELS_SQL}, ?::text)`, q.english_level);
  }
  if (q.source) add('source = ?', String(q.source));
  if (q.city) add('current_city ILIKE ?', `%${q.city}%`);
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', values };
}

const SORTS = {
  newest: 'created_at DESC', oldest: 'created_at ASC', name: 'full_name ASC NULLS LAST', updated: 'updated_at DESC',
};

export async function listCandidates(q) {
  const { where, values } = buildFilters(q);
  const limit = Math.min(Math.max(Number(q.limit) || 25, 1), 200);
  const page = Math.max(Number(q.page) || 1, 1);
  const order = SORTS[q.sort] || SORTS.newest;
  const total = (await one(`SELECT count(*) FROM candidates ${where}`, values)).count;
  const rows = await many(
    `SELECT c.*, (SELECT count(*) FROM candidate_files f WHERE f.candidate_id = c.id) AS file_count
     FROM candidates c ${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    values,
  );
  return { total, page, limit, items: rows.map(publicCandidate) };
}

export async function exportRows(q) {
  const { where, values } = buildFilters(q);
  return many(`SELECT * FROM candidates ${where} ORDER BY created_at DESC`, values);
}
