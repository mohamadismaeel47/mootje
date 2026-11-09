import { Router } from 'express';
import fs from 'node:fs';
import { one, query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { notFound } from '../utils/errors.js';
import { filePath, deleteStoredFile } from '../services/storage.js';
import { audit } from '../services/audit.js';

const router = Router();

// Open (inline) or download a CV. Requires login; never served from a public folder.
router.get('/:id', async (req, res) => {
  const f = await one('SELECT * FROM candidate_files WHERE id = $1', [Number(req.params.id)]);
  if (!f) throw notFound('File not found');
  const p = filePath(f.stored_name);
  if (!fs.existsSync(p)) throw notFound('The file is missing from storage');
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.setHeader('Content-Type', f.mime_type);
  res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(f.original_name)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  fs.createReadStream(p).pipe(res);
});

router.delete('/:id', requireRole('recruiter'), async (req, res) => {
  const f = await one('SELECT * FROM candidate_files WHERE id = $1', [Number(req.params.id)]);
  if (!f) throw notFound();
  await deleteStoredFile(f.stored_name);
  await query('DELETE FROM candidate_files WHERE id = $1', [f.id]);
  await audit(req.user.id, 'delete_file', 'candidate', f.candidate_id, f.original_name);
  res.json({ ok: true });
});

export default router;
