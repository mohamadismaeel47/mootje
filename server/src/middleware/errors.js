import multer from 'multer';
import { logger } from '../utils/logger.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Niet gevonden' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Bestand is te groot' : err.message });
  }
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Dit bestaat al', detail: err.constraint });
  }
  if (err.code === '23514' || err.code === '22P02' || err.code === '23502') {
    return res.status(400).json({ error: 'Ongeldige waarde', detail: err.constraint || err.column });
  }
  const status = err.status || 500;
  if (status >= 500 && !err.expose) logger.error('Unhandled error', { path: req.path, error: err.message, stack: err.stack });
  const show = status < 500 || err.expose;
  res.status(status).json({
    error: show ? err.message : 'Er ging iets mis op de server',
    details: err.details,
    hint: err.hint,
    code: typeof err.code === 'string' || typeof err.code === 'number' ? err.code : undefined,
  });
}
