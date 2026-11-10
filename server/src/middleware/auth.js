import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { one } from '../db/pool.js';
import { HttpError, forbidden } from '../utils/errors.js';

export const COOKIE = 'crm_session';

export function issueSession(res, user) {
  // `tv` (token version) lets us end all sessions of a user at once, e.g. after a password change.
  const token = jwt.sign({ sub: user.id, role: user.role, tv: user.token_version ?? 0 }, config.jwtSecret, { expiresIn: `${config.sessionHours}h` });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: res.req?.secure || false, // secure cookie whenever the site runs on https
    maxAge: config.sessionHours * 3600 * 1000,
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

// Loads the logged-in user from the session cookie. Users that were disabled lose access immediately.
export async function requireAuth(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next(new HttpError(401, 'Log eerst in'));
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return next(new HttpError(401, 'Je sessie is verlopen. Log opnieuw in.'));
  }
  const user = await one('SELECT id, email, name, role, active, token_version, totp_enabled FROM users WHERE id = $1', [payload.sub]);
  if (!user || !user.active) return next(new HttpError(401, 'Log eerst in'));
  if ((payload.tv ?? 0) !== user.token_version) return next(new HttpError(401, 'Je bent uitgelogd. Log opnieuw in.'));
  const { token_version, ...safe } = user;
  req.user = safe;
  next();
}

// Role hierarchy: admin > recruiter > viewer.
const rank = { viewer: 1, recruiter: 2, admin: 3 };
export const requireRole = (role) => (req, _res, next) => {
  if (!req.user || rank[req.user.role] < rank[role]) return next(forbidden());
  next();
};

// Simple CSRF protection: state-changing API calls must come from our own frontend,
// which always sends this header. Browsers do not allow other sites to set custom headers
// without a CORS preflight, which this server never approves.
export function requireClientHeader(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-crm-client') !== '1') return next(new HttpError(403, 'Ontbrekende client-header'));
  next();
}
