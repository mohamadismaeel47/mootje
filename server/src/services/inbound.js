// Processes webhook payloads from Meta: incoming messages, delivery statuses and
// (for Coexistence numbers) messages that you send yourself from the WhatsApp Business app.
import { one, query } from '../db/pool.js';
import { createCandidate, findByPhone } from './candidates.js';
import { getOrCreateConversation, recordInbound, applyStatus } from './messenger.js';
import { downloadMedia, getWhatsAppConfig, markAsRead } from './whatsapp.js';
import { saveFile, isAllowedType } from './storage.js';
import { handleIncoming, withConversationLock } from './bot/engine.js';
import { notify } from './audit.js';
import { logger, maskPhone } from '../utils/logger.js';

export async function logEvent(kind, ok, detail) {
  try {
    await query('INSERT INTO webhook_events(kind, ok, detail) VALUES ($1,$2,$3)', [kind, ok, detail ? String(detail).slice(0, 500) : null]);
    await query("DELETE FROM webhook_events WHERE created_at < now() - interval '30 days'");
  } catch { /* logging must never break processing */ }
}

function messageText(msg) {
  switch (msg.type) {
    case 'text': return msg.text?.body || '';
    case 'button': return msg.button?.text || msg.button?.payload || '';
    case 'interactive': return msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
    case 'document': return msg.document?.caption || msg.document?.filename || '';
    case 'image': return msg.image?.caption || '';
    case 'reaction': return msg.reaction?.emoji || '';
    default: return '';
  }
}

async function findOrCreateCandidate(waId, { simulated = false, profileName } = {}) {
  let cand = await findByPhone(waId);
  let created = false;
  if (!cand) {
    try {
      cand = await createCandidate({
        phone: `+${waId}`,
        notes: simulated ? 'Test candidate created by the WhatsApp simulator.' : null,
      }, { source: 'whatsapp' });
      created = true;
    } catch (err) {
      if (err.status !== 409) throw err;
      cand = await findByPhone(waId); // created in parallel by another webhook
    }
  }
  const conv = await getOrCreateConversation(cand.id, { simulated });
  if (profileName && !conv.bot_state?.profile_name) {
    await query(`UPDATE conversations SET bot_state = bot_state || jsonb_build_object('profile_name', $2::text) WHERE id = $1`, [conv.id, profileName.slice(0, 100)]);
  }
  if (created) {
    await notify('new_candidate', `New WhatsApp contact${profileName ? `: ${profileName}` : ''}`, `+${waId} sent a first message.`, `/inbox/${conv.id}`);
  }
  return { cand, conv: await one('SELECT * FROM conversations WHERE id = $1', [conv.id]) };
}

// One incoming message. Used by both the real webhook and the simulator.
export async function processIncomingMessage(msg, { profileName, simulated = false } = {}) {
  const { cand, conv } = await findOrCreateCandidate(msg.from, { simulated, profileName });
  return withConversationLock(conv.id, async () => {
    let fileId = null;
    let fileError = null;
    const media = msg.document || msg.image;
    if ((msg.type === 'document' || msg.type === 'image') && media?.id && !simulated) {
      try {
        const m = await downloadMedia(media.id);
        const mime = media.mime_type || m.mimeType;
        if (isAllowedType(mime)) {
          const file = await saveFile({
            candidateId: cand.id, buffer: m.buffer, mimeType: mime, source: 'whatsapp',
            originalName: media.filename || `whatsapp-${msg.type}-${Date.now()}${mime === 'application/pdf' ? '.pdf' : mime.startsWith('image/') ? '.jpg' : ''}`,
          });
          fileId = file.id;
          await notify('cv_received', `File received from ${cand.full_name || `+${cand.phone}`}`, file.original_name, `/candidates/${cand.id}`);
        } else fileError = `File type ${mime} is not allowed`;
      } catch (err) {
        fileError = err.message;
        logger.warn('Could not download WhatsApp media', { error: err.message });
      }
    }
    const text = messageText(msg);
    const body = msg.type === 'text' || msg.type === 'button' || msg.type === 'interactive' ? text
      : `[${msg.type}]${text ? ` ${text}` : ''}${fileError ? ` (not saved: ${fileError})` : ''}`;
    const at = msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date();
    const saved = await recordInbound(conv, { waMessageId: msg.id, type: msg.type, body, fileId, at });
    if (!saved) return { duplicate: true };

    const fresh = await one('SELECT * FROM conversations WHERE id = $1', [conv.id]);
    if (fresh.mode === 'auto' && !simulated && msg.id) markAsRead(msg.id);
    let result;
    try {
      result = await handleIncoming(conv.id, {
        type: fileId ? msg.type : (msg.type === 'document' || msg.type === 'image') ? 'text' : msg.type,
        text: fileId ? '' : (['text', 'button', 'interactive'].includes(msg.type) ? text : ''),
      });
    } catch (err) {
      logger.error('Bot failed to handle message', { conversation: conv.id, error: err.message });
      await query(`UPDATE conversations SET status = 'needs_attention' WHERE id = $1`, [conv.id]);
      result = { handled: false, error: err.message };
    }
    return { conversationId: conv.id, candidateId: cand.id, ...result };
  });
}

// Coexistence: a message you typed in the WhatsApp Business app on your phone.
// We save it as an outgoing message and switch the conversation to manual mode, so the bot does not interrupt you.
async function processEcho(echo) {
  const cand = await findByPhone(echo.to);
  if (!cand) return;
  const conv = await getOrCreateConversation(cand.id);
  const body = echo.text?.body || `[${echo.type}]`;
  const inserted = await one(
    `INSERT INTO messages(conversation_id, direction, wa_message_id, type, body, status, sender, created_at)
     VALUES ($1,'out',$2,$3,$4,'sent','user',$5) ON CONFLICT (wa_message_id) DO NOTHING RETURNING id`,
    [conv.id, echo.id || null, echo.type || 'text', body, echo.timestamp ? new Date(Number(echo.timestamp) * 1000) : new Date()],
  );
  if (inserted) {
    await query(`UPDATE conversations SET mode = 'manual', last_outbound_at = now(), last_message_at = now(), last_message_preview = $2 WHERE id = $1`, [conv.id, body.slice(0, 120)]);
  }
}

export async function processWebhookPayload(payload) {
  if (payload?.object !== 'whatsapp_business_account') {
    await logEvent('ignored', true, `object=${payload?.object}`);
    return;
  }
  const { phoneNumberId } = await getWhatsAppConfig();
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const target = value.metadata?.phone_number_id;
      if (phoneNumberId && target && target !== phoneNumberId) {
        await logEvent('ignored', true, `Message for another phone number id (${target})`);
        continue;
      }
      if (change.field === 'smb_message_echoes') {
        for (const echo of value.message_echoes || []) {
          try { await processEcho(echo); await logEvent('echo', true, 'Message sent from WhatsApp Business app'); } catch (err) { await logEvent('echo', false, err.message); }
        }
        continue;
      }
      if (change.field && change.field !== 'messages') {
        await logEvent('ignored', true, `field=${change.field}`);
        continue;
      }
      for (const msg of value.messages || []) {
        try {
          const profileName = value.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name;
          const r = await processIncomingMessage(msg, { profileName });
          await logEvent('message', true, `${msg.type} from ${maskPhone(msg.from)}${r.duplicate ? ' (duplicate, skipped)' : ''}${r.action ? ` → bot: ${r.action}` : r.reason ? ` → ${r.reason}` : ''}`);
        } catch (err) {
          logger.error('Processing incoming message failed', { error: err.message });
          await logEvent('message', false, err.message);
        }
      }
      for (const st of value.statuses || []) {
        try {
          const found = await applyStatus(st);
          await logEvent('status', true, `${st.status}${found ? '' : ' (unknown message)'}${st.errors?.[0] ? `: ${st.errors[0].title} (${st.errors[0].code})` : ''}`);
        } catch (err) {
          await logEvent('status', false, err.message);
        }
      }
    }
  }
}
