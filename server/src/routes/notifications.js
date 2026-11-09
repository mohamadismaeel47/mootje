import { Router } from 'express';
import { many, one, query } from '../db/pool.js';

const router = Router();

router.get('/', async (_req, res) => {
  const items = await many('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50');
  const { count } = await one('SELECT count(*) FROM notifications WHERE read_at IS NULL');
  res.json({ items, unread: count });
});

router.post('/read-all', async (_req, res) => {
  await query('UPDATE notifications SET read_at = now() WHERE read_at IS NULL');
  res.json({ ok: true });
});

router.post('/:id/read', async (req, res) => {
  await query('UPDATE notifications SET read_at = now() WHERE id = $1', [Number(req.params.id)]);
  res.json({ ok: true });
});

export default router;
