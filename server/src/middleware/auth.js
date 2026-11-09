import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { one } from '../db/pool.js';
import { HttpError, forbidden } from '../utils/errors.js';

export const COOKIE = 'crm_session';

export function issueSession(res, user) {
  const token = jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: `${config.sessionHours}h` });
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
  if (!token) return next(new HttpError(401, 'Please log in'));
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return next(new HttpError(401, 'Your session has expired. Please log in again.'));
  }
  const user = await one('SELECT id, email, name, role, active FROM users WHERE id = $1', [payload.sub]);
  if (!user || !user.active) return next(new HttpError(401, 'Please log in'));
  req.user = user;
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
  if (req.get('x-crm-client') !== '1') return next(new HttpError(403, 'Missing client header'));
  next();
}
