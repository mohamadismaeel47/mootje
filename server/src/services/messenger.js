// Stores and sends WhatsApp messages. Every message (in and out) is saved in the database.
import { one, query } from '../db/pool.js';
import { sendText, sendTemplate, windowOpen, WhatsAppError } from './whatsapp.js';
import { logger } from '../utils/logger.js';

export class WindowClosedError extends Error {
  constructor() {
    super('Er zijn meer dan 24 uur voorbij sinds de kandidaat voor het laatst schreef. WhatsApp staat nu alleen een goedgekeurde template toe.');
    this.status = 409;
    this.code = 'WINDOW_CLOSED';
  }
}

const preview = (s) => String(s || '').replace(/\s+/g, ' ').slice(0, 120);

export async function getOrCreateConversation(candidateId, { simulated = false } = {}) {
  const existing = await one('SELECT * FROM conversations WHERE candidate_id = $1', [candidateId]);
  if (existing) return existing;
  return one(
    `INSERT INTO conversations(candidate_id, simulated) VALUES ($1,$2)
     ON CONFLICT (candidate_id) DO UPDATE SET candidate_id = EXCLUDED.candidate_id RETURNING *`,
    [candidateId, simulated],
  );
}

// Returns the saved message, or null when this WhatsApp message id was already processed (Meta retries webhooks).
export async function recordInbound(conversation, { waMessageId, type = 'text', body, fileId = null, at = new Date() }) {
  const msg = await one(
    `INSERT INTO messages(conversation_id, direction, wa_message_id, type, body, file_id, status, sender, created_at)
     VALUES ($1,'in',$2,$3,$4,$5,'received','candidate',$6)
     ON CONFLICT (wa_message_id) DO NOTHING RETURNING *`,
    [conversation.id, waMessageId || null, type, body ?? null, fileId, at],
  );
  if (!msg) return null;
  await query(
    `UPDATE conversations SET last_inbound_at = GREATEST(COALESCE(last_inbound_at, $2), $2), last_message_at = now(),
       last_message_preview = $3, unread_count = unread_count + 1,
       status = CASE WHEN status IN ('new','waiting') THEN 'in_progress' ELSE status END
     WHERE id = $1`,
    [conversation.id, at, preview(body || `[${type}]`)],
  );
  return msg;
}

async function afterOutbound(conversationId, body) {
  await query(
    'UPDATE conversations SET last_outbound_at = now(), last_message_at = now(), last_message_preview = $2 WHERE id = $1',
    [conversationId, preview(body)],
  );
}

// Sends a free-form text message. Respects the 24-hour customer service window.
export async function sendMessage(conversation, text, { sender = 'bot', userId = null } = {}) {
  const conv = await one('SELECT c.*, cand.phone FROM conversations c JOIN candidates cand ON cand.id = c.candidate_id WHERE c.id = $1', [conversation.id]);
  if (!conv.simulated && !windowOpen(conv.last_inbound_at)) throw new WindowClosedError();
  const msg = await one(
    `INSERT INTO messages(conversation_id, direction, type, body, status, sender, user_id) VALUES ($1,'out','text',$2,$3,$4,$5) RETURNING *`,
    [conv.id, text, conv.simulated ? 'simulated' : 'queued', sender, userId],
  );
  await afterOutbound(conv.id, text);
  if (conv.simulated) return msg;
  try {
    const r = await sendText(conv.phone, text);
    return one(`UPDATE messages SET status = 'sent', wa_message_id = $2 WHERE id = $1 RETURNING *`, [msg.id, r.id]);
  } catch (err) {
    logger.warn('Sending WhatsApp message failed', { conversation: conv.id, code: err.code });
    const failed = await one(`UPDATE messages SET status = 'failed', error = $2 WHERE id = $1 RETURNING *`, [msg.id, `${err.message}${err.hint ? ` – ${err.hint}` : ''}`]);
    if (sender === 'user') throw err;
    return failed;
  }
}

// Template messages may be sent at any time (also outside the 24-hour window).
export async function sendTemplateMessage(conversation, { name, language = 'en', params = [], previewText }, { sender = 'user', userId = null } = {}) {
  const conv = await one('SELECT c.*, cand.phone FROM conversations c JOIN candidates cand ON cand.id = c.candidate_id WHERE c.id = $1', [conversation.id]);
  const body = previewText || `[Template: ${name}${params.length ? ` – ${params.join(', ')}` : ''}]`;
  const msg = await one(
    `INSERT INTO messages(conversation_id, direction, type, body, template_name, status, sender, user_id)
     VALUES ($1,'out','template',$2,$3,$4,$5,$6) RETURNING *`,
    [conv.id, body, name, conv.simulated ? 'simulated' : 'queued', sender, userId],
  );
  await afterOutbound(conv.id, body);
  if (conv.simulated) return msg;
  try {
    const r = await sendTemplate(conv.phone, name, language, params);
    return one(`UPDATE messages SET status = 'sent', wa_message_id = $2 WHERE id = $1 RETURNING *`, [msg.id, r.id]);
  } catch (err) {
    await query(`UPDATE messages SET status = 'failed', error = $2 WHERE id = $1`, [msg.id, `${err.message}${err.hint ? ` – ${err.hint}` : ''}`]);
    throw err;
  }
}

const STATUS_ORDER = { queued: 0, sent: 1, delivered: 2, read: 3 };

// Delivery status updates from Meta (sent → delivered → read, or failed).
export async function applyStatus({ id, status, errors }) {
  const msg = await one('SELECT id, status FROM messages WHERE wa_message_id = $1', [id]);
  if (!msg) return false;
  if (status === 'failed') {
    const e = errors?.[0];
    const detail = e ? `${e.title || 'Mislukt'}${e.code ? ` (code ${e.code})` : ''}${e.error_data?.details ? `: ${e.error_data.details}` : ''}` : 'Aflevering mislukt';
    await query(`UPDATE messages SET status = 'failed', error = $2 WHERE id = $1`, [msg.id, detail]);
    return true;
  }
  if (STATUS_ORDER[status] !== undefined && (STATUS_ORDER[status] > (STATUS_ORDER[msg.status] ?? -1))) {
    await query('UPDATE messages SET status = $2 WHERE id = $1', [msg.id, status]);
  }
  return true;
}

export { WhatsAppError };
