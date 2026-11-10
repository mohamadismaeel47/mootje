// Bulk messages from the recruiter: a vacancy offer, or "are you still looking for work?".
// Inside the 24-hour window a normal text is sent; outside it an approved template is required.
import { one, many, query } from '../db/pool.js';
import { getOrCreateConversation, sendMessage, sendTemplateMessage } from './messenger.js';
import { windowOpen } from './whatsapp.js';
import { getSetting } from './settings.js';
import { SUPPORTED_LANGUAGES, t } from './bot/texts.js';
import { logger } from '../utils/logger.js';

const firstName = (c) => (c.full_name ? c.full_name.split(' ')[0] : '');
const langOf = (c) => (SUPPORTED_LANGUAGES.includes(c.preferred_language) ? c.preferred_language : 'en');

export function vacancyDetails(v, lang) {
  const parts = [];
  if (v.location) parts.push(`📍 ${v.location}`);
  if (v.salary) parts.push(`💶 ${v.salary}`);
  if (v.working_hours) parts.push(`🕒 ${v.working_hours}`);
  if (v.description) {
    const short = v.description.replace(/\s+/g, ' ').trim();
    parts.push(short.length > 300 ? `${short.slice(0, 297)}…` : short);
  }
  return parts.length ? `\n${parts.join('\n')}` : (lang === 'nl' ? '' : '');
}

// Candidates that may receive a check-in: not placed, not "not interested", no deletion request,
// and not asked in the last 7 days.
export async function checkinCandidates() {
  return many(`
    SELECT cand.*, c.id AS conversation_id, c.last_inbound_at, c.simulated
    FROM candidates cand LEFT JOIN conversations c ON c.candidate_id = cand.id
    WHERE cand.status NOT IN ('placed','not_interested')
      AND cand.deletion_requested_at IS NULL
      AND (c.id IS NULL OR NOT c.simulated)
      AND NOT EXISTS (SELECT 1 FROM outreach o WHERE o.candidate_id = cand.id AND o.kind = 'checkin'
                      AND o.status <> 'failed' AND o.created_at > now() - interval '7 days')
    ORDER BY cand.created_at`);
}

async function sendOne({ candidate, kind, vacancy, userId }) {
  const conv = await getOrCreateConversation(candidate.id);
  const lang = langOf(candidate);
  const name = firstName(candidate);
  const textKey = kind === 'vacancy' ? 'vacancy_offer' : 'checkin';
  const text = t(lang, textKey, { name: name ? ` ${name}` : '', title: vacancy?.title || '', details: vacancy ? vacancyDetails(vacancy, lang) : '' });
  let method = 'text';
  try {
    if (conv.simulated || windowOpen(conv.last_inbound_at)) {
      await sendMessage(conv, text, { sender: 'user', userId });
    } else {
      const tName = await getSetting(kind === 'vacancy' ? 'bot.vacancy_template_name' : 'bot.checkin_template_name');
      if (!tName) {
        return { candidate_id: candidate.id, name: candidate.full_name, ok: false, reason: 'needs_template' };
      }
      const tLang = await getSetting(kind === 'vacancy' ? 'bot.vacancy_template_language' : 'bot.checkin_template_language');
      const params = kind === 'vacancy' ? [name || 'there', vacancy.title, vacancy.location || '-'] : [name || 'there'];
      await sendTemplateMessage(conv, { name: tName, language: tLang, params, previewText: `[Template ${tName}] ${text}` }, { sender: 'user', userId });
      method = 'template';
    }
  } catch (err) {
    logger.warn('Outreach message failed', { kind, error: err.message });
    await query(`INSERT INTO outreach(kind, vacancy_id, candidate_id, user_id, method, status, error) VALUES ($1,$2,$3,$4,$5,'failed',$6)`,
      [kind, vacancy?.id || null, candidate.id, userId, method, err.message.slice(0, 500)]);
    return { candidate_id: candidate.id, name: candidate.full_name, ok: false, reason: 'error', error: err.message };
  }
  const out = await one(`INSERT INTO outreach(kind, vacancy_id, candidate_id, user_id, method) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [kind, vacancy?.id || null, candidate.id, userId, method]);
  // The assistant handles the YES/NO answer, then returns to where the conversation was.
  const fresh = await one('SELECT bot_step, bot_state FROM conversations WHERE id = $1', [conv.id]);
  const prevStep = fresh.bot_step && !['vacancy_offer', 'checkin'].includes(fresh.bot_step) ? fresh.bot_step : (fresh.bot_state?.resume_step || null);
  const state = { ...(fresh.bot_state || {}), resume_step: prevStep, outreach_id: out.id, offer_vacancy_id: vacancy?.id || null, attempts: 0 };
  await query(`UPDATE conversations SET bot_step = $2, bot_state = $3, mode = 'auto', status = 'waiting' WHERE id = $1`,
    [conv.id, kind === 'vacancy' ? 'vacancy_offer' : 'checkin', JSON.stringify(state)]);
  return { candidate_id: candidate.id, name: candidate.full_name, ok: true, method };
}

export async function sendOutreach({ candidates, kind, vacancy, userId }) {
  const results = [];
  for (const candidate of candidates) {
    results.push(await sendOne({ candidate, kind, vacancy, userId }));
  }
  return {
    sent: results.filter((r) => r.ok).length,
    needs_template: results.filter((r) => r.reason === 'needs_template').length,
    failed: results.filter((r) => r.reason === 'error').length,
    results,
  };
}
