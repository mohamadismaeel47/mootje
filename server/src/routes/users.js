import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { many, one } from '../db/pool.js';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest, notFound } from '../utils/errors.js';
import { audit } from '../services/audit.js';
import { passwordSchema } from './auth.js';

const router = Router();
router.use(requireRole('admin'));

const role = z.enum(['admin', 'recruiter', 'viewer']);

router.get('/', async (_req, res) => {
  res.json(await many('SELECT id, name, email, role, active, last_login_at, created_at, totp_enabled, locked_until FROM users ORDER BY id'));
});

router.post('/', validate(z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: passwordSchema,
  role,
})), async (req, res) => {
  const user = await one(
    'INSERT INTO users(name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role, active, created_at',
    [req.body.name, req.body.email, await bcrypt.hash(req.body.password, 12), req.body.role],
  );
  await audit(req.user.id, 'create_user', 'user', user.id, user.role);
  res.status(201).json(user);
});

router.patch('/:id', validate(z.object({
  name: z.string().trim().min(2).max(100).optional(),
  role: role.optional(),
  active: z.boolean().optional(),
  password: passwordSchema.optional(),
  reset_2fa: z.boolean().optional(),
  unlock: z.boolean().optional(),
})), async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id && (req.body.active === false || (req.body.role && req.body.role !== 'admin'))) {
    throw badRequest('Je kunt jezelf niet uitschakelen of je eigen beheerdersrol afnemen');
  }
  const existing = await one('SELECT * FROM users WHERE id = $1', [id]);
  if (!existing) throw notFound();
  const hash = req.body.password ? await bcrypt.hash(req.body.password, 12) : existing.password_hash;
  // Changing password, role, access or 2FA ends the user's current sessions.
  const endSessions = !!req.body.password || req.body.active === false || req.body.reset_2fa
    || (req.body.role && req.body.role !== existing.role);
  const user = await one(
    `UPDATE users SET name = $1, role = $2, active = $3, password_hash = $4,
       token_version = token_version + $6,
       totp_enabled = CASE WHEN $7 THEN false ELSE totp_enabled END,
       totp_secret_encrypted = CASE WHEN $7 THEN NULL ELSE totp_secret_encrypted END,
       failed_logins = CASE WHEN $8 THEN 0 ELSE failed_logins END,
       locked_until = CASE WHEN $8 THEN NULL ELSE locked_until END
     WHERE id = $5
     RETURNING id, name, email, role, active, last_login_at, created_at, totp_enabled, locked_until`,
    [req.body.name ?? existing.name, req.body.role ?? existing.role, req.body.active ?? existing.active, hash, id,
      endSessions ? 1 : 0, !!req.body.reset_2fa, !!req.body.unlock],
  );
  await audit(req.user.id, 'update_user', 'user', id);
  res.json(user);
});

export default router;
