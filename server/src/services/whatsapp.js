// Client for the official Meta WhatsApp Business Cloud API (graph.facebook.com).
// All calls happen on the server; the access token never reaches the browser.
import crypto from 'node:crypto';
import { getSettings } from './settings.js';
import { logger, maskPhone } from '../utils/logger.js';
import { safeEqual } from '../utils/crypto.js';

const GRAPH = 'https://graph.facebook.com';

export class WhatsAppError extends Error {
  constructor(message, { status = 502, code, subcode, fbtraceId, hint } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.subcode = subcode;
    this.fbtraceId = fbtraceId;
    this.hint = hint;
    this.expose = true;
    this.name = 'WhatsAppError';
  }
}

export async function getWhatsAppConfig() {
  const s = await getSettings('whatsapp.');
  return {
    accessToken: s['whatsapp.access_token'],
    phoneNumberId: s['whatsapp.phone_number_id'],
    businessAccountId: s['whatsapp.business_account_id'],
    appSecret: s['whatsapp.app_secret'],
    verifyToken: s['whatsapp.verify_token'],
    version: s['whatsapp.graph_version'] || 'v23.0',
  };
}

export async function missingConfig() {
  const c = await getWhatsAppConfig();
  const missing = [];
  if (!c.accessToken) missing.push('WhatsApp Access Token');
  if (!c.phoneNumberId) missing.push('WhatsApp Phone Number ID');
  if (!c.businessAccountId) missing.push('WhatsApp Business Account ID');
  if (!c.appSecret) missing.push('Meta App Secret');
  if (!c.verifyToken) missing.push('Webhook Verify Token');
  return missing;
}

// Human-friendly explanations for the most common Meta error codes.
const HINTS = {
  190: 'The access token is invalid or expired. Create a permanent System User token in Meta Business Settings.',
  10: 'The app has no permission. Give the System User the whatsapp_business_messaging and whatsapp_business_management permissions.',
  200: 'Permission error. Check that the System User has access to this WhatsApp Business Account.',
  100: 'Invalid parameter. Check the Phone Number ID, Business Account ID and the recipient phone number.',
  131030: 'Recipient is not in the allowed list. In test mode you can only send to numbers you added in the Meta dashboard.',
  131047: 'More than 24 hours passed since the candidate last wrote. You must use an approved message template.',
  131026: 'Message could not be delivered. The number may not use WhatsApp, or the candidate has an old WhatsApp version.',
  131051: 'This message type is not supported.',
  132000: 'Template parameters do not match the template. Check the number of variables.',
  132001: 'Template does not exist or is not approved in this language.',
  133010: 'The phone number is not registered on the Cloud API. Register it first (Phone numbers > Register).',
  368: 'The account is temporarily blocked for policy violations.',
  130429: 'Rate limit reached. Wait a moment and try again.',
  131056: 'Too many messages to the same person in a short time. Wait a moment.',
};

async function graph(path, { method = 'GET', body, config, raw = false } = {}) {
  const c = config || (await getWhatsAppConfig());
  if (!c.accessToken) throw new WhatsAppError('WhatsApp is not configured: the access token is missing.', { status: 400 });
  const url = path.startsWith('http') ? path : `${GRAPH}/${c.version}/${path}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${c.accessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    logger.error('WhatsApp API network error', { path: path.split('?')[0], error: err.message });
    throw new WhatsAppError(`Could not reach Meta (${err.name === 'TimeoutError' ? 'timeout' : err.message}).`, { status: 502 });
  }
  if (raw && res.ok) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error || {};
    const hint = HINTS[e.code] || HINTS[e.error_subcode];
    logger.warn('WhatsApp API error', { path: path.split('?')[0], http: res.status, code: e.code, subcode: e.error_subcode, fbtrace_id: e.fbtrace_id });
    throw new WhatsAppError(`${e.message || `Meta returned HTTP ${res.status}`}${e.error_data?.details ? ` (${e.error_data.details})` : ''}`, {
      status: res.status >= 500 ? 502 : 400, code: e.code, subcode: e.error_subcode, fbtraceId: e.fbtrace_id, hint,
    });
  }
  return data;
}

async function sendPayload(to, payload) {
  const c = await getWhatsAppConfig();
  if (!c.phoneNumberId) throw new WhatsAppError('WhatsApp is not configured: the Phone Number ID is missing.', { status: 400 });
  const data = await graph(`${c.phoneNumberId}/messages`, {
    method: 'POST',
    config: c,
    body: { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload },
  });
  logger.info('WhatsApp message sent', { to: maskPhone(to), type: payload.type });
  return { id: data.messages?.[0]?.id, data };
}

export function sendText(to, text) {
  return sendPayload(to, { type: 'text', text: { preview_url: false, body: text.slice(0, 4096) } });
}

// Template messages are required to start a conversation or to write after the 24-hour window.
export function sendTemplate(to, name, languageCode = 'en', bodyParams = []) {
  const template = { name, language: { code: languageCode } };
  if (bodyParams.length) {
    template.components = [{ type: 'body', parameters: bodyParams.map((t) => ({ type: 'text', text: String(t) })) }];
  }
  return sendPayload(to, { type: 'template', template });
}

export async function markAsRead(messageId) {
  const c = await getWhatsAppConfig();
  if (!c.accessToken || !c.phoneNumberId) return;
  try {
    await graph(`${c.phoneNumberId}/messages`, { method: 'POST', config: c, body: { messaging_product: 'whatsapp', status: 'read', message_id: messageId } });
  } catch { /* not important */ }
}

// Download media (CV documents/photos) that a candidate sent.
export async function downloadMedia(mediaId) {
  const meta = await graph(encodeURIComponent(mediaId));
  const res = await graph(meta.url, { raw: true });
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mimeType: meta.mime_type, size: meta.file_size };
}

export async function listTemplates() {
  const c = await getWhatsAppConfig();
  if (!c.businessAccountId) throw new WhatsAppError('The WhatsApp Business Account ID is missing.', { status: 400 });
  const data = await graph(`${c.businessAccountId}/message_templates?fields=name,status,language,category,components&limit=200`, { config: c });
  return (data.data || []).map((t) => ({
    name: t.name,
    status: t.status,
    language: t.language,
    category: t.category,
    body: t.components?.find((x) => x.type === 'BODY')?.text || '',
    variables: ((t.components?.find((x) => x.type === 'BODY')?.text || '').match(/\{\{\d+\}\}/g) || []).length,
  }));
}

// Step-by-step connection check, used by the "Test connection" button.
// Every check calls the real Meta API; nothing is faked.
export async function testConnection() {
  const c = await getWhatsAppConfig();
  const steps = [];
  const push = (name, ok, detail, hint) => steps.push({ name, ok, detail, hint });

  const missing = await missingConfig();
  push('Settings complete', missing.length === 0, missing.length ? `Missing: ${missing.join(', ')}` : 'All required values are filled in');
  if (!c.accessToken) return { ok: false, steps };

  try {
    const me = await graph('me?fields=id,name', { config: c });
    push('Access token valid', true, `Token belongs to: ${me.name || me.id}`);
  } catch (e) {
    push('Access token valid', false, e.message, e.hint);
    return { ok: false, steps };
  }

  if (c.phoneNumberId) {
    try {
      const p = await graph(`${c.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,platform_type,name_status`, { config: c });
      // Extra field for Coexistence numbers. Asked separately: if Meta does not know the field, the main check still works.
      try {
        const extra = await graph(`${c.phoneNumberId}?fields=is_on_biz_app`, { config: c });
        p.is_on_biz_app = extra.is_on_biz_app;
      } catch { /* field not available for this number/API version */ }
      push('Phone number found', true, `${p.display_phone_number} (${p.verified_name || 'no name'}) – quality: ${p.quality_rating || 'unknown'}`);
      const registered = p.platform_type === 'CLOUD_API';
      push('Number registered on Cloud API', registered,
        registered ? 'platform_type = CLOUD_API' : `platform_type = ${p.platform_type || 'unknown'}`,
        registered ? undefined : 'The number is not registered for the Cloud API yet. Do NOT register a number that is in use on the WhatsApp app unless you use Coexistence onboarding (see README).');
      if (p.is_on_biz_app !== undefined) {
        push('Coexistence (also on WhatsApp Business app)', true, p.is_on_biz_app ? 'Yes – this number is also used in the WhatsApp Business app (Coexistence)' : 'No – this number is only on the Cloud API');
      }
      if (p.name_status) {
        const usable = ['APPROVED', 'AVAILABLE_WITHOUT_REVIEW'].includes(p.name_status);
        push('Display name status', usable, usable ? `${p.name_status} – the display name can be used` : p.name_status,
          usable ? undefined : 'Check the display name in WhatsApp Manager > Phone numbers.');
      }
    } catch (e) {
      push('Phone number found', false, e.message, e.hint);
    }
  }

  if (c.businessAccountId) {
    try {
      const subs = await graph(`${c.businessAccountId}/subscribed_apps`, { config: c });
      const ok = (subs.data || []).length > 0;
      push('App subscribed to WhatsApp Business Account', ok,
        ok ? `Subscribed apps: ${subs.data.map((a) => a.whatsapp_business_api_data?.name || a.whatsapp_business_api_data?.id || 'app').join(', ')}` : 'No app is subscribed – incoming messages will NOT arrive.',
        ok ? undefined : 'Use the "Subscribe app" button, or POST /{WABA_ID}/subscribed_apps in Meta.');
    } catch (e) {
      push('App subscribed to WhatsApp Business Account', false, e.message, e.hint);
    }
  }

  push('App secret present', !!c.appSecret, c.appSecret ? 'Incoming webhooks will be signature-checked' : 'Without the App Secret incoming webhooks are rejected');
  return { ok: steps.every((s) => s.ok), steps };
}

export async function subscribeApp() {
  const c = await getWhatsAppConfig();
  if (!c.businessAccountId) throw new WhatsAppError('The WhatsApp Business Account ID is missing.', { status: 400 });
  return graph(`${c.businessAccountId}/subscribed_apps`, { method: 'POST', config: c });
}

// Validates the X-Hub-Signature-256 header that Meta adds to every webhook POST.
export function verifySignature(rawBody, header, appSecret) {
  if (!appSecret || !header || !header.startsWith('sha256=')) return false;
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  return safeEqual(expected, header);
}

// 24-hour customer service window: free-form messages are only allowed
// within 24 hours after the candidate's last message.
export function windowOpen(lastInboundAt) {
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() < 24 * 3600 * 1000;
}
