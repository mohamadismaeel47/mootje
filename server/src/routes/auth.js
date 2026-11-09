import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { one, query } from '../db/pool.js';
import { validate } from '../middleware/validate.js';
import { issueSession, clearSession, requireAuth } from '../middleware/auth.js';
import { HttpError } from '../utils/errors.js';
import { safeEqual } from '../utils/crypto.js';
import { audit } from '../services/audit.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 15 minutes.' },
});

export const passwordSchema = z.string()
  .min(10, 'Password must be at least 10 characters')
  .max(200)
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'Password must contain letters and numbers');

router.get('/status', async (_req, res) => {
  const { count } = await one('SELECT count(*) FROM users');
  res.json({ needsSetup: count === 0, setupTokenRequired: !!config.setupToken });
});

// First-run: create the first admin account. Only works while no users exist.
router.post('/setup', loginLimiter, validate(z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: passwordSchema,
  setupToken: z.string().optional(),
})), async (req, res) => {
  if (config.setupToken && !safeEqual(req.body.setupToken || '', config.setupToken)) {
    throw new HttpError(403, 'Invalid setup token');
  }
  const { count } = await one('SELECT count(*) FROM users');
  if (count > 0) throw new HttpError(409, 'Setup has already been completed');
  const hash = await bcrypt.hash(req.body.password, 12);
  const user = await one(
    `INSERT INTO users(name, email, password_hash, role) VALUES ($1,$2,$3,'admin') RETURNING id, name, email, role`,
    [req.body.name, req.body.email, hash],
  );
  await audit(user.id, 'setup_admin', 'user', user.id);
  issueSession(res, user);
  res.status(201).json({ user });
});

router.post('/login', loginLimiter, validate(z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
})), async (req, res) => {
  const user = await one('SELECT * FROM users WHERE email = $1', [req.body.email]);
  // Always run bcrypt to avoid revealing which emails exist through timing.
  const ok = await bcrypt.compare(req.body.password, user?.password_hash || '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinval');
  if (!user || !ok || !user.active) throw new HttpError(401, 'Wrong email or password');
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  await audit(user.id, 'login', 'user', user.id);
  issueSession(res, user);
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

router.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post('/change-password', requireAuth, validate(z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
})), async (req, res) => {
  const user = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(req.body.currentPassword, user.password_hash))) {
    throw new HttpError(400, 'Current password is wrong');
  }
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(req.body.newPassword, 12), req.user.id]);
  await audit(req.user.id, 'change_password', 'user', req.user.id);
  res.json({ ok: true });
});

export default router;
