import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import QRCode from 'qrcode';
import { z } from 'zod';
import { config } from '../config.js';
import { one, query } from '../db/pool.js';
import { validate } from '../middleware/validate.js';
import { issueSession, clearSession, requireAuth } from '../middleware/auth.js';
import { HttpError } from '../utils/errors.js';
import { safeEqual, encrypt, decrypt } from '../utils/crypto.js';
import { generateSecret, verifyTotp, otpauthUrl } from '../utils/totp.js';
import { audit } from '../services/audit.js';

const router = Router();

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Te veel inlogpogingen. Wacht 15 minuten.' },
});

export const passwordSchema = z.string()
  .min(10, 'Wachtwoord moet minstens 10 tekens hebben')
  .max(200)
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'Wachtwoord moet letters en cijfers bevatten');

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, totp_enabled: !!u.totp_enabled });

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
    throw new HttpError(403, 'Ongeldige setup-token');
  }
  const { count } = await one('SELECT count(*) FROM users');
  if (count > 0) throw new HttpError(409, 'Het eerste account is al gemaakt');
  const hash = await bcrypt.hash(req.body.password, 12);
  const user = await one(
    `INSERT INTO users(name, email, password_hash, role) VALUES ($1,$2,$3,'admin') RETURNING *`,
    [req.body.name, req.body.email, hash],
  );
  await audit(user.id, 'setup_admin', 'user', user.id);
  issueSession(res, user);
  res.status(201).json({ user: publicUser(user) });
});

async function registerFailure(user, reason) {
  if (!user) return;
  const failed = user.failed_logins + 1;
  const lock = failed >= MAX_FAILED;
  await query(
    `UPDATE users SET failed_logins = $2, locked_until = CASE WHEN $3 THEN now() + ($4 || ' minutes')::interval ELSE locked_until END WHERE id = $1`,
    [user.id, lock ? 0 : failed, lock, String(LOCK_MINUTES)],
  );
  await audit(user.id, lock ? 'account_locked' : 'login_failed', 'user', user.id, reason);
}

// Login in one or two steps: password, then (if 2FA is on) the 6-digit code from the authenticator app.
router.post('/login', loginLimiter, validate(z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
  code: z.string().trim().max(10).optional(),
})), async (req, res) => {
  const user = await one('SELECT * FROM users WHERE email = $1', [req.body.email]);
  if (user?.locked_until && new Date(user.locked_until) > new Date()) {
    const minutes = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000);
    throw new HttpError(423, `Dit account is tijdelijk geblokkeerd na te veel foute pogingen. Probeer het over ${minutes} minuten opnieuw.`);
  }
  // Always run bcrypt to avoid revealing which emails exist through timing.
  const ok = await bcrypt.compare(req.body.password, user?.password_hash || '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinval');
  if (!user || !ok || !user.active) {
    await registerFailure(user && user.active ? user : null, 'wrong password');
    throw new HttpError(401, 'Verkeerd e-mailadres of wachtwoord');
  }
  if (user.totp_enabled) {
    if (!req.body.code) return res.json({ needs2fa: true });
    if (!verifyTotp(decrypt(user.totp_secret_encrypted), req.body.code)) {
      await registerFailure(user, 'wrong 2fa code');
      throw new HttpError(401, 'De code klopt niet. Kijk in je authenticator-app en probeer het opnieuw.');
    }
  }
  await query('UPDATE users SET last_login_at = now(), failed_logins = 0, locked_until = NULL WHERE id = $1', [user.id]);
  await audit(user.id, 'login', 'user', user.id, `${req.ip || ''} ${String(req.get('user-agent') || '').slice(0, 80)}`.trim());
  issueSession(res, user);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Ends every session of this user on every device (also this one).
router.post('/logout-everywhere', requireAuth, async (req, res) => {
  await query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [req.user.id]);
  await audit(req.user.id, 'logout_everywhere', 'user', req.user.id);
  clearSession(res);
  res.json({ ok: true });
});

router.post('/change-password', requireAuth, validate(z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
})), async (req, res) => {
  const user = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(req.body.currentPassword, user.password_hash))) {
    throw new HttpError(400, 'Huidig wachtwoord is onjuist');
  }
  // New token version: all other sessions end. This device gets a fresh session.
  const updated = await one(
    'UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2 RETURNING *',
    [await bcrypt.hash(req.body.newPassword, 12), req.user.id],
  );
  await audit(req.user.id, 'change_password', 'user', req.user.id);
  issueSession(res, updated);
  res.json({ ok: true });
});

// --- Two-factor authentication (authenticator app) ---

// Step 1: create a secret and show it as QR code. It is only active after step 2.
router.post('/2fa/setup', requireAuth, async (req, res) => {
  if (req.user.totp_enabled) throw new HttpError(400, 'Tweestapsverificatie staat al aan');
  const secret = generateSecret();
  await query('UPDATE users SET totp_secret_encrypted = $1 WHERE id = $2', [encrypt(secret), req.user.id]);
  const url = otpauthUrl(secret, req.user.email);
  res.json({ secret, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) });
});

// Step 2: confirm with a code from the app.
router.post('/2fa/enable', requireAuth, validate(z.object({ code: z.string().trim().min(6).max(10) })), async (req, res) => {
  const u = await one('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!u.totp_secret_encrypted) throw new HttpError(400, 'Start eerst het instellen van tweestapsverificatie');
  if (!verifyTotp(decrypt(u.totp_secret_encrypted), req.body.code)) throw new HttpError(400, 'De code klopt niet. Probeer de nieuwste code uit de app.');
  const updated = await one('UPDATE users SET totp_enabled = true, token_version = token_version + 1 WHERE id = $1 RETURNING *', [u.id]);
  await audit(u.id, '2fa_enabled', 'user', u.id);
  issueSession(res, updated);
  res.json({ ok: true });
});

router.post('/2fa/disable', requireAuth, validate(z.object({ password: z.string().min(1), code: z.string().trim().min(6).max(10) })), async (req, res) => {
  const u = await one('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!u.totp_enabled) throw new HttpError(400, 'Tweestapsverificatie staat niet aan');
  if (!(await bcrypt.compare(req.body.password, u.password_hash))) throw new HttpError(400, 'Wachtwoord is onjuist');
  if (!verifyTotp(decrypt(u.totp_secret_encrypted), req.body.code)) throw new HttpError(400, 'De code klopt niet');
  const updated = await one('UPDATE users SET totp_enabled = false, totp_secret_encrypted = NULL, token_version = token_version + 1 WHERE id = $1 RETURNING *', [u.id]);
  await audit(u.id, '2fa_disabled', 'user', u.id);
  issueSession(res, updated);
  res.json({ ok: true });
});

export default router;
