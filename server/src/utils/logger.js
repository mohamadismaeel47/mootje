// Small structured logger. Never pass tokens, message texts or full phone numbers to it.
const levels = { debug: 10, info: 20, warn: 30, error: 40 };
const min = levels[process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'error' : 'info')] ?? 20;

function write(level, msg, meta) {
  if (levels[level] < min) return;
  const line = { t: new Date().toISOString(), level, msg, ...(meta ? redact(meta) : {}) };
  (level === 'error' || level === 'warn' ? console.error : console.log)(JSON.stringify(line));
}

const SECRET_KEYS = /token|secret|password|authorization|bsn|pass/i;
export function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_KEYS.test(k)) out[k] = '[redacted]';
    else if (/phone|wa_id|to$|from$/i.test(k) && typeof v === 'string') out[k] = maskPhone(v);
    else if (v && typeof v === 'object') out[k] = redact(v);
    else out[k] = v;
  }
  return out;
}

export function maskPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 6) return '***';
  return `${d.slice(0, 3)}****${d.slice(-3)}`;
}

export const logger = {
  debug: (m, meta) => write('debug', m, meta),
  info: (m, meta) => write('info', m, meta),
  warn: (m, meta) => write('warn', m, meta),
  error: (m, meta) => write('error', m, meta),
};
