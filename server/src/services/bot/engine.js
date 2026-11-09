// The WhatsApp registration assistant.
// It asks the questions one by one, saves every answer immediately in the candidate profile,
// explains questions when the candidate does not understand them, and skips questions that are already answered.
import { one, query } from '../../db/pool.js';
import { getSetting, getBool } from '../settings.js';
import { updateCandidate } from '../candidates.js';
import { notify } from '../audit.js';
import { sendMessage, sendTemplateMessage } from '../messenger.js';
import { windowOpen } from '../whatsapp.js';
import { QUESTIONS, SUPPORTED_LANGUAGES, t, questionText, questionExplain } from './texts.js';
import {
  PARSERS, isAnswered, isHelpRequest, parseYesNo, detectLanguage, parseLanguageSwitch, isJobInterest,
} from './parsers.js';
import { logger } from '../../utils/logger.js';

const MAX_ATTEMPTS = 3;
const EARLY_STATUSES = ['new', 'contacted', 'information_requested'];

// Messages of the same conversation are handled strictly one after another.
const locks = new Map();
export function withConversationLock(conversationId, fn) {
  const prev = locks.get(conversationId) || Promise.resolve();
  const next = prev.then(fn, fn);
  const settled = next.catch(() => {});
  locks.set(conversationId, settled);
  settled.then(() => { if (locks.get(conversationId) === settled) locks.delete(conversationId); });
  return next;
}

async function load(conversationId) {
  const conv = await one('SELECT * FROM conversations WHERE id = $1', [conversationId]);
  const cand = await one('SELECT * FROM candidates WHERE id = $1', [conv.candidate_id]);
  return { conv, cand };
}

async function saveState(convId, { step, state, status }) {
  await query(
    `UPDATE conversations SET bot_step = COALESCE($2, bot_step), bot_state = COALESCE($3, bot_state), status = COALESCE($4, status) WHERE id = $1`,
    [convId, step ?? null, state ? JSON.stringify(state) : null, status ?? null],
  );
}

async function setCandidateStatus(cand, status) {
  if (cand.status !== status) await updateCandidate(cand.id, { status });
}

function firstName(cand) {
  return cand.full_name ? ` ${cand.full_name.split(' ')[0]}` : '';
}

function nextQuestion(cand, skipped = []) {
  const index = QUESTIONS.findIndex((q) => !isAnswered(q.key, cand) && !skipped.includes(q.key));
  return index === -1 ? null : { question: QUESTIONS[index], index };
}

function promptFor(lang, q, index) {
  return `${t(lang, 'question_prefix', { n: index + 1, total: QUESTIONS.length })} ${questionText(lang, q)}`;
}

// Ask the next open question, or finish the registration.
async function askNext(ctx, { intro } = {}) {
  const { conv, lang, send } = ctx;
  const cand = await one('SELECT * FROM candidates WHERE id = $1', [conv.candidate_id]);
  const next = nextQuestion(cand, ctx.state.skipped || []);
  if (next) {
    if (EARLY_STATUSES.includes(cand.status) && cand.status !== 'information_requested') await setCandidateStatus(cand, 'information_requested');
    await saveState(conv.id, { step: `q:${next.question.key}`, state: { ...ctx.state, attempts: 0 }, status: 'in_progress' });
    await send(intro ? `${intro}\n\n${promptFor(lang, next.question, next.index)}` : promptFor(lang, next.question, next.index));
    return;
  }
  const hasFile = await one('SELECT id FROM candidate_files WHERE candidate_id = $1 LIMIT 1', [cand.id]);
  if (!hasFile && (await getBool('bot.offer_cv')) && !ctx.state.cv_offered) {
    await saveState(conv.id, { step: 'cv', state: { ...ctx.state, cv_offered: true, attempts: 0 }, status: 'in_progress' });
    await send(intro ? `${intro}\n\n${t(lang, 'cv_offer')}` : t(lang, 'cv_offer'));
    return;
  }
  await complete(ctx, cand, intro);
}

async function complete(ctx, cand, intro) {
  const { conv, lang, send } = ctx;
  await saveState(conv.id, { step: 'completed', state: { ...ctx.state, attempts: 0 }, status: 'completed' });
  if (EARLY_STATUSES.includes(cand.status)) await setCandidateStatus(cand, 'information_complete');
  const text = t(lang, 'completed', { name: firstName(cand) });
  await send(intro ? `${intro}\n\n${text}` : text);
  await notify('registration_complete', `Registration complete: ${cand.full_name || `+${cand.phone}`}`,
    'All registration questions were answered via WhatsApp.', `/candidates/${cand.id}`);
}

async function flagAttention(conv, cand, reason) {
  await query(`UPDATE conversations SET status = 'needs_attention' WHERE id = $1`, [conv.id]);
  await notify('needs_attention', `Check conversation: ${cand.full_name || `+${cand.phone}`}`, reason, `/inbox/${conv.id}`);
}

// Main entry point: one incoming message from a candidate.
// `message` = { type: 'text'|'document'|'image'|..., text, fileId }
export async function handleIncoming(conversationId, message) {
  const { conv, cand } = await load(conversationId);
  if (conv.mode !== 'auto') return { handled: false, reason: 'manual_mode' };
  if (!(await getBool('bot.enabled'))) return { handled: false, reason: 'bot_disabled' };

  const state = { attempts: 0, ...(conv.bot_state || {}) };
  const text = String(message.text || '').trim();
  const upper = text.toUpperCase();

  // Language: explicit switch, or detect automatically from the first messages.
  let lang = SUPPORTED_LANGUAGES.includes(cand.preferred_language) ? cand.preferred_language : 'en';
  const switchTo = parseLanguageSwitch(text);
  if (!state.lang_locked) {
    const detected = detectLanguage(text);
    if (detected && detected !== lang) lang = detected;
  }
  if (switchTo) { lang = switchTo; state.lang_locked = true; }
  if (lang !== cand.preferred_language) await updateCandidate(cand.id, { preferred_language: lang });

  const ctx = {
    conv, cand, lang, state,
    send: (body) => sendMessage(conv, body, { sender: 'bot' }),
  };

  // Commands that work at any moment.
  if (['DELETE', 'VERWIJDER', 'VERWIJDEREN', 'DELETE MY DATA'].includes(upper)) {
    await query('UPDATE candidates SET deletion_requested_at = now() WHERE id = $1', [cand.id]);
    await query(`UPDATE conversations SET mode = 'manual', status = 'needs_attention' WHERE id = $1`, [conv.id]);
    await notify('deletion_request', `Data deletion request: ${cand.full_name || `+${cand.phone}`}`,
      'The candidate asked to delete their data (GDPR). Open the profile and use "Delete candidate".', `/candidates/${cand.id}`);
    await ctx.send(t(lang, 'deletion_ack'));
    return { handled: true, action: 'deletion_request' };
  }
  if (['STOP', 'STOPPEN', 'UNSUBSCRIBE'].includes(upper)) {
    await saveState(conv.id, { state: { ...state, stopped: true }, status: 'closed' });
    await ctx.send(t(lang, 'stop_ack'));
    return { handled: true, action: 'stopped' };
  }
  if (state.stopped) {
    if (upper !== 'START') return { handled: false, reason: 'stopped' };
    state.stopped = false;
    await saveState(conv.id, { state, status: 'in_progress' });
    await ctx.send(t(lang, 'start_ack'));
    if (conv.bot_step && conv.bot_step.startsWith('q:')) return askNextAndReturn(ctx);
  }
  if (switchTo && text.split(/\s+/).length <= 4) {
    await ctx.send(t(lang, 'language_set'));
    if (conv.bot_step && conv.bot_step.startsWith('q:')) return askNextAndReturn(ctx);
    return { handled: true, action: 'language' };
  }

  // Files (CV) are already saved by the webhook handler.
  if (message.type === 'document' || message.type === 'image') {
    await ctx.send(t(lang, 'cv_received'));
    if (conv.bot_step === 'cv') { await complete(ctx, await one('SELECT * FROM candidates WHERE id = $1', [cand.id])); return { handled: true, action: 'cv_completed' }; }
    if (conv.bot_step && conv.bot_step.startsWith('q:')) return askNextAndReturn(ctx);
    return { handled: true, action: 'cv' };
  }
  if (!text) {
    if (conv.bot_step === 'completed') return { handled: false, reason: 'completed' };
    await ctx.send(t(lang, 'text_only'));
    return { handled: true, action: 'text_only' };
  }

  const step = conv.bot_step;

  // Conversation started by the candidate: send the opening question.
  if (!step || step === 'closed_no_consent' || step === 'not_interested') {
    if (step === 'not_interested' || step === 'closed_no_consent') {
      // They come back later: start again.
      if (cand.status === 'not_interested') await setCandidateStatus(cand, 'contacted');
    }
    if (isJobInterest(text) || (step && parseYesNo(text) === true)) return startQuestions(ctx);
    await saveState(conv.id, { step: 'intro', state: { ...state, intro_sent: true, attempts: 0 }, status: 'in_progress' });
    if (cand.status === 'new') await setCandidateStatus(cand, 'contacted');
    const recruiter = await getSetting('bot.recruiter_name');
    await ctx.send(t(lang, 'intro', { recruiter }));
    return { handled: true, action: 'intro' };
  }

  if (step === 'intro') {
    if (isHelpRequest(text)) { await ctx.send(t(lang, 'intro_explain')); return { handled: true, action: 'explain' }; }
    const yn = parseYesNo(text);
    if (yn === true || (yn === null && isJobInterest(text))) return startQuestions(ctx);
    if (yn === false) {
      await saveState(conv.id, { step: 'not_interested', status: 'closed' });
      await setCandidateStatus(cand, 'not_interested');
      await ctx.send(t(lang, 'not_interested'));
      return { handled: true, action: 'not_interested' };
    }
    return unclear(ctx, t(lang, 'intro_explain'));
  }

  if (step === 'consent') {
    if (isHelpRequest(text)) { await ctx.send(t(lang, 'consent_explain')); return { handled: true, action: 'explain' }; }
    const yn = parseYesNo(text);
    if (yn === true) {
      await query(`UPDATE candidates SET consent_given = true, consent_at = now(), consent_source = 'whatsapp', updated_at = now() WHERE id = $1`, [cand.id]);
      await askNext(ctx);
      return { handled: true, action: 'consent_given' };
    }
    if (yn === false) {
      await saveState(conv.id, { step: 'closed_no_consent', status: 'closed' });
      await ctx.send(t(lang, 'consent_declined'));
      await notify('no_consent', `No consent: +${cand.phone}`, 'The candidate did not agree to the privacy statement. No answers will be collected.', `/inbox/${conv.id}`);
      return { handled: true, action: 'consent_declined' };
    }
    return unclear(ctx, t(lang, 'consent_explain'));
  }

  if (step.startsWith('q:')) {
    const key = step.slice(2);
    const question = QUESTIONS.find((q) => q.key === key);
    if (!question) return askNextAndReturn(ctx);
    if (isHelpRequest(text)) {
      await ctx.send(`${questionExplain(lang, question)}\n\n${questionText(lang, question)}`);
      return { handled: true, action: 'explain' };
    }
    const result = PARSERS[key](text);
    if (result.ok) {
      await updateCandidate(cand.id, result.values);
      state.attempts = 0;
      await askNext(ctx);
      return { handled: true, action: 'saved', saved: result.values };
    }
    state.attempts = (state.attempts || 0) + 1;
    if (state.attempts >= MAX_ATTEMPTS) {
      // Do not get stuck: keep the raw answer in the notes for the recruiter, and move on.
      const note = `[WhatsApp] Unclear answer to "${questionText('en', question)}": ${text.slice(0, 300)}`;
      await query(`UPDATE candidates SET notes = CONCAT_WS(E'\\n', notes, $2::text), updated_at = now() WHERE id = $1`, [cand.id, note]);
      await flagAttention(conv, cand, `The candidate could not answer "${questionText('en', question)}" after ${MAX_ATTEMPTS} tries. The answer was saved in the notes.`);
      await skipQuestion(ctx, key);
      return { handled: true, action: 'skipped' };
    }
    await saveState(conv.id, { state });
    const clarify = result.clarify === 'which_certificates'
      ? (lang === 'nl' ? 'Welke certificaten heb je? Bijvoorbeeld: heftruck, EPT of reachtruck.' : 'Which certificates do you have? For example: forklift, EPT or reach truck.')
      : `${t(lang, 'not_understood')} ${questionExplain(lang, question)}\n\n${questionText(lang, question)}`;
    await ctx.send(clarify);
    return { handled: true, action: 'unclear' };
  }

  if (step === 'cv') {
    if (parseYesNo(text) === true && !/\b(no|nee)\b/i.test(text)) {
      await ctx.send(t(lang, 'cv_waiting'));
      return { handled: true, action: 'cv_waiting' };
    }
    await complete(ctx, await one('SELECT * FROM candidates WHERE id = $1', [cand.id]));
    return { handled: true, action: 'completed' };
  }

  if (step === 'completed') {
    // After registration a human takes over. Send one short confirmation, then stay quiet.
    if (!state.after_complete_sent) {
      await saveState(conv.id, { state: { ...state, after_complete_sent: true } });
      await ctx.send(t(lang, 'after_complete'));
    }
    return { handled: false, reason: 'completed' };
  }

  logger.warn('Unknown bot step', { step });
  return { handled: false, reason: 'unknown_step' };
}

async function askNextAndReturn(ctx) {
  await askNext(ctx);
  return { handled: true, action: 'next' };
}

async function startQuestions(ctx) {
  const { conv, lang } = ctx;
  if (ctx.cand.status === 'new' || ctx.cand.status === 'not_interested') await setCandidateStatus(ctx.cand, 'contacted');
  const great = t(lang, 'great');
  if ((await getBool('bot.ask_consent')) && !ctx.cand.consent_given) {
    await saveState(conv.id, { step: 'consent', state: { ...ctx.state, attempts: 0 }, status: 'in_progress' });
    await ctx.send(`${great}\n\n${t(lang, 'consent')}`);
    return { handled: true, action: 'consent_asked' };
  }
  await askNext(ctx, { intro: great });
  return { handled: true, action: 'questions_started' };
}

async function unclear(ctx, explanation) {
  const { conv, lang, state } = ctx;
  state.attempts = (state.attempts || 0) + 1;
  await saveState(conv.id, { state });
  if (state.attempts >= MAX_ATTEMPTS) await flagAttention(conv, ctx.cand, 'The candidate gave several unclear answers.');
  await ctx.send(`${t(lang, 'not_understood')} ${explanation}`);
  return { handled: true, action: 'unclear' };
}

// Mark a question as "asked but unanswered" so the flow continues, and ask the next one.
async function skipQuestion(ctx, key) {
  const { conv } = ctx;
  const cand = await one('SELECT * FROM candidates WHERE id = $1', [conv.candidate_id]);
  const skipped = new Set(ctx.state.skipped || []);
  skipped.add(key);
  const index = QUESTIONS.findIndex((q) => !isAnswered(q.key, cand) && !skipped.has(q.key));
  ctx.state = { ...ctx.state, skipped: [...skipped], attempts: 0 };
  if (index === -1) {
    await saveState(conv.id, { state: ctx.state });
    return complete(ctx, cand);
  }
  const q = QUESTIONS[index];
  await saveState(conv.id, { step: `q:${q.key}`, state: ctx.state, status: 'needs_attention' });
  await ctx.send(promptFor(ctx.lang, q, index));
}

// Sends the first message from the CRM side ("Start WhatsApp conversation").
// Outside the 24-hour window WhatsApp requires an approved template.
export async function startConversation(conversationId, { userId } = {}) {
  const { conv, cand } = await load(conversationId);
  const lang = SUPPORTED_LANGUAGES.includes(cand.preferred_language) ? cand.preferred_language : 'en';
  const recruiter = await getSetting('bot.recruiter_name');
  const introText = t(lang, 'intro', { recruiter });
  if (conv.simulated || windowOpen(conv.last_inbound_at)) {
    await sendMessage(conv, introText, { sender: userId ? 'user' : 'bot', userId });
  } else {
    const name = await getSetting('bot.intro_template_name');
    if (!name) {
      const err = new Error('To send the first message you need an approved WhatsApp template. Create one in Meta (for example with the intro text) and enter its name in Settings > Bot.');
      err.status = 400;
      throw err;
    }
    const language = await getSetting('bot.intro_template_language');
    await sendTemplateMessage(conv, { name, language, previewText: `[Template ${name}] ${introText}` }, { sender: 'user', userId });
  }
  await saveState(conv.id, { step: 'intro', state: { attempts: 0, intro_sent: true }, status: 'waiting' });
  if (cand.status === 'new') await updateCandidate(cand.id, { status: 'contacted' }, { userId });
}

// Re-sends the open question for candidates who stopped responding.
export async function sendFollowUp(conversationId, { userId } = {}) {
  const { conv, cand } = await load(conversationId);
  const lang = SUPPORTED_LANGUAGES.includes(cand.preferred_language) ? cand.preferred_language : 'en';
  if (conv.simulated || windowOpen(conv.last_inbound_at)) {
    let pending = '';
    if (conv.bot_step?.startsWith('q:')) {
      const q = QUESTIONS.find((x) => x.key === conv.bot_step.slice(2));
      if (q) pending = `\n\n${questionText(lang, q)}`;
    } else if (conv.bot_step === 'intro') pending = `\n\n${t(lang, 'intro', { recruiter: await getSetting('bot.recruiter_name') })}`;
    else if (conv.bot_step === 'consent') pending = `\n\n${t(lang, 'consent')}`;
    else if (conv.bot_step === 'cv') pending = `\n\n${t(lang, 'cv_offer')}`;
    return sendMessage(conv, `${t(lang, 'followup', { name: firstName(cand) })}${pending}`, { sender: 'user', userId });
  }
  const name = await getSetting('bot.followup_template_name');
  if (!name) {
    const err = new Error('The 24-hour window is closed. Set a follow-up template in Settings > Bot (it must be approved by Meta), or pick a template manually.');
    err.status = 409;
    throw err;
  }
  const language = await getSetting('bot.followup_template_language');
  const tmpl = { name, language, params: [], previewText: `[Template ${name}] follow-up` };
  return sendTemplateMessage(conv, tmpl, { sender: 'user', userId });
}

// Recruiter hands the conversation back to the bot.
export async function resume(conversationId) {
  await query(`UPDATE conversations SET mode = 'auto', status = CASE WHEN status = 'needs_attention' THEN 'in_progress' ELSE status END WHERE id = $1`, [conversationId]);
  const { conv, cand } = await load(conversationId);
  if (!conv.simulated && !windowOpen(conv.last_inbound_at)) return { sent: false, reason: 'window_closed' };
  if (!conv.bot_step || !conv.bot_step.startsWith('q:')) return { sent: false, reason: 'nothing_to_ask' };
  const lang = SUPPORTED_LANGUAGES.includes(cand.preferred_language) ? cand.preferred_language : 'en';
  const ctx = { conv, cand, lang, state: { attempts: 0, ...(conv.bot_state || {}) }, send: (body) => sendMessage(conv, body, { sender: 'bot' }) };
  await withConversationLock(conv.id, () => askNext(ctx));
  return { sent: true };
}
