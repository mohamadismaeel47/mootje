import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { one, many, query } from '../db/pool.js';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest, notFound } from '../utils/errors.js';
import { sendMessage, sendTemplateMessage, getOrCreateConversation } from '../services/messenger.js';
import { listTemplates, windowOpen } from '../services/whatsapp.js';
import { startConversation, sendFollowUp, resume } from '../services/bot/engine.js';
import { processIncomingMessage } from '../services/inbound.js';
import { deleteCandidateFiles } from '../services/storage.js';
import { audit } from '../services/audit.js';

const router = Router();
const editor = requireRole('recruiter');

const withWindow = (c) => ({
  ...c,
  window_open: c.simulated || windowOpen(c.last_inbound_at),
  window_expires_at: c.last_inbound_at ? new Date(new Date(c.last_inbound_at).getTime() + 24 * 3600 * 1000) : null,
});

router.get('/', async (req, res) => {
  const where = [];
  const values = [];
  if (req.query.q) {
    values.push(`%${req.query.q}%`);
    const digits = String(req.query.q).replace(/\D/g, '');
    let cond = `(cand.full_name ILIKE $${values.length} OR c.bot_state->>'profile_name' ILIKE $${values.length} OR c.last_message_preview ILIKE $${values.length}`;
    if (digits.length >= 3) { values.push(`%${digits}%`); cond += ` OR cand.phone LIKE $${values.length}`; }
    where.push(`${cond})`);
  }
  if (req.query.filter === 'unread') where.push('c.unread_count > 0');
  if (req.query.filter === 'manual') where.push(`c.mode = 'manual'`);
  if (req.query.filter === 'auto') where.push(`c.mode = 'auto'`);
  if (req.query.filter === 'attention') where.push(`c.status = 'needs_attention'`);
  if (req.query.filter === 'completed') where.push(`c.status = 'completed'`);
  const rows = await many(`
    SELECT c.*, cand.full_name, cand.phone, cand.status AS candidate_status, c.bot_state->>'profile_name' AS profile_name
    FROM conversations c JOIN candidates cand ON cand.id = c.candidate_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY c.last_message_at DESC NULLS LAST LIMIT 300`, values);
  res.json(rows.map(withWindow));
});

router.get('/templates', async (_req, res) => {
  res.json(await listTemplates());
});

// Test conversations: simulate an incoming WhatsApp message without Meta.
// Runs through exactly the same processing and bot logic as real messages.
router.post('/simulate', editor, validate(z.object({
  phone: z.string().regex(/^999\d{9}$/).optional(),
  text: z.string().trim().min(1).max(2000),
  name: z.string().trim().max(100).optional(),
})), async (req, res) => {
  const phone = req.body.phone || `999${String(crypto.randomInt(0, 1e9)).padStart(9, '0')}`;
  const existing = await one('SELECT c.simulated FROM conversations c JOIN candidates cand ON cand.id = c.candidate_id WHERE cand.phone = $1', [phone]);
  if (existing && !existing.simulated) throw badRequest('This number belongs to a real conversation');
  const result = await processIncomingMessage({
    from: phone, id: `sim.${crypto.randomUUID()}`, type: 'text', text: { body: req.body.text }, timestamp: String(Math.floor(Date.now() / 1000)),
  }, { simulated: true, profileName: req.body.name || 'Test candidate' });
  res.json({ phone, ...result });
});

router.post('/start/:candidateId', editor, async (req, res) => {
  const cand = await one('SELECT id FROM candidates WHERE id = $1', [Number(req.params.candidateId)]);
  if (!cand) throw notFound('Candidate not found');
  const conv = await getOrCreateConversation(cand.id);
  await startConversation(conv.id, { userId: req.user.id });
  await audit(req.user.id, 'start_conversation', 'candidate', cand.id);
  res.json({ conversationId: conv.id });
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const conv = await one(`
    SELECT c.*, cand.full_name, cand.phone, cand.status AS candidate_status, cand.preferred_language, cand.consent_given,
           c.bot_state->>'profile_name' AS profile_name
    FROM conversations c JOIN candidates cand ON cand.id = c.candidate_id WHERE c.id = $1`, [id]);
  if (!conv) throw notFound('Conversation not found');
  const messages = await many(`
    SELECT m.id, m.direction, m.type, m.body, m.template_name, m.status, m.error, m.sender, m.created_at, m.file_id,
           u.name AS user_name, f.original_name AS file_name
    FROM messages m LEFT JOIN users u ON u.id = m.user_id LEFT JOIN candidate_files f ON f.id = m.file_id
    WHERE m.conversation_id = $1 ORDER BY m.created_at, m.id LIMIT 1000`, [id]);
  if (conv.unread_count > 0 && req.query.peek !== '1') await query('UPDATE conversations SET unread_count = 0 WHERE id = $1', [id]);
  res.json({ ...withWindow(conv), messages });
});

router.post('/:id/messages', editor, validate(z.object({
  text: z.string().trim().min(1).max(4096),
  keep_auto: z.boolean().default(false),
})), async (req, res) => {
  const conv = await one('SELECT * FROM conversations WHERE id = $1', [Number(req.params.id)]);
  if (!conv) throw notFound();
  // When you write yourself, the bot steps aside so it does not interrupt your conversation.
  if (conv.mode === 'auto' && !req.body.keep_auto) await query(`UPDATE conversations SET mode = 'manual' WHERE id = $1`, [conv.id]);
  const msg = await sendMessage(conv, req.body.text, { sender: 'user', userId: req.user.id });
  res.status(201).json(msg);
});

router.post('/:id/template', editor, validate(z.object({
  name: z.string().trim().min(1).max(512),
  language: z.string().trim().min(2).max(15),
  params: z.array(z.string().max(1000)).max(20).default([]),
  preview: z.string().max(2000).optional(),
})), async (req, res) => {
  const conv = await one('SELECT * FROM conversations WHERE id = $1', [Number(req.params.id)]);
  if (!conv) throw notFound();
  const msg = await sendTemplateMessage(conv, { name: req.body.name, language: req.body.language, params: req.body.params, previewText: req.body.preview }, { sender: 'user', userId: req.user.id });
  if (conv.status === 'new') await query(`UPDATE conversations SET status = 'waiting' WHERE id = $1`, [conv.id]);
  res.status(201).json(msg);
});

router.post('/:id/mode', editor, validate(z.object({ mode: z.enum(['auto', 'manual']) })), async (req, res) => {
  const id = Number(req.params.id);
  if (!(await one('SELECT id FROM conversations WHERE id = $1', [id]))) throw notFound();
  if (req.body.mode === 'auto') {
    const r = await resume(id);
    return res.json({ mode: 'auto', ...r });
  }
  await query(`UPDATE conversations SET mode = 'manual' WHERE id = $1`, [id]);
  res.json({ mode: 'manual' });
});

router.post('/:id/follow-up', editor, async (req, res) => {
  const id = Number(req.params.id);
  if (!(await one('SELECT id FROM conversations WHERE id = $1', [id]))) throw notFound();
  res.json(await sendFollowUp(id, { userId: req.user.id }));
});

router.post('/:id/restart', editor, async (req, res) => {
  const id = Number(req.params.id);
  const conv = await one('SELECT * FROM conversations WHERE id = $1', [id]);
  if (!conv) throw notFound();
  await query(`UPDATE conversations SET bot_step = NULL, bot_state = jsonb_strip_nulls(jsonb_build_object('profile_name', bot_state->>'profile_name')), mode = 'auto', status = 'in_progress' WHERE id = $1`, [id]);
  await startConversation(id, { userId: req.user.id });
  res.json({ ok: true });
});

router.post('/:id/status', editor, validate(z.object({ status: z.enum(['new', 'in_progress', 'waiting', 'completed', 'needs_attention', 'closed']) })), async (req, res) => {
  await query('UPDATE conversations SET status = $2 WHERE id = $1', [Number(req.params.id), req.body.status]);
  res.json({ ok: true });
});

// Remove a simulator conversation and its test candidate.
router.delete('/:id', editor, async (req, res) => {
  const conv = await one('SELECT * FROM conversations WHERE id = $1', [Number(req.params.id)]);
  if (!conv) throw notFound();
  if (!conv.simulated) throw badRequest('Only test conversations can be deleted here. Delete real candidates from their profile.');
  await deleteCandidateFiles(conv.candidate_id);
  await query('DELETE FROM candidates WHERE id = $1', [conv.candidate_id]);
  res.json({ ok: true });
});

export default router;
