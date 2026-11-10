import { config } from '../config.js';
import { many, query } from '../db/pool.js';
import { encrypt, decrypt, mask } from '../utils/crypto.js';

// All configurable settings. `env` values (from .env) always take priority over the database.
export const DEFINITIONS = {
  'whatsapp.access_token':        { secret: true, env: () => config.whatsappEnv.accessToken, label: 'WhatsApp Access Token' },
  'whatsapp.phone_number_id':     { env: () => config.whatsappEnv.phoneNumberId, label: 'WhatsApp Phone Number ID' },
  'whatsapp.business_account_id': { env: () => config.whatsappEnv.businessAccountId, label: 'WhatsApp Business Account ID' },
  'whatsapp.app_secret':          { secret: true, env: () => config.whatsappEnv.appSecret, label: 'Meta App Secret' },
  'whatsapp.verify_token':        { secret: true, env: () => config.whatsappEnv.verifyToken, label: 'Webhook Verify Token' },
  'whatsapp.graph_version':       { env: () => config.whatsappEnv.graphVersion, default: 'v23.0', label: 'Graph API-versie' },

  'bot.enabled':                  { default: 'true', label: 'Automatisch antwoorden' },
  'bot.question_mode':            { default: 'one', label: 'Hoe de vragen gesteld worden' },
  'bot.recruiter_name':           { default: 'Mohamad', label: 'Naam van de recruiter (in het eerste bericht)' },
  'bot.ask_consent':              { default: 'true', label: 'Om privacytoestemming vragen' },
  'bot.offer_cv':                 { default: 'true', label: 'Aan het einde om een cv vragen' },
  'bot.intro_template_name':      { default: '', label: 'Template voor het eerste bericht' },
  'bot.intro_template_language':  { default: 'en', label: 'Taalcode van de template' },
  'bot.followup_template_name':   { default: '', label: 'Template voor herinneringen (na 24 uur)' },
  'bot.followup_template_language': { default: 'en', label: 'Taalcode van de herinneringstemplate' },

  'bot.vacancy_template_name':    { default: '', label: 'Template voor vacatures (na 24 uur)' },
  'bot.vacancy_template_language': { default: 'en', label: 'Taalcode van de vacaturetemplate' },
  'bot.checkin_template_name':    { default: '', label: 'Template "zoek je nog werk?" (na 24 uur)' },
  'bot.checkin_template_language': { default: 'en', label: 'Taalcode van de "zoek je nog werk?"-template' },

  'general.default_country_code': { default: '31', label: 'Standaard landcode voor telefoonnummers' },
  'general.company_name':         { default: '', label: 'Bedrijfsnaam' },
  'privacy.retention_months':     { default: '24', label: 'Gegevens bewaren (maanden)' },

  'smtp.host':  { env: () => config.smtpEnv.host, label: 'SMTP-server' },
  'smtp.port':  { env: () => config.smtpEnv.port, default: '587', label: 'SMTP-poort' },
  'smtp.user':  { env: () => config.smtpEnv.user, label: 'SMTP-gebruiker' },
  'smtp.pass':  { secret: true, env: () => config.smtpEnv.pass, label: 'SMTP-wachtwoord' },
  'smtp.from':  { env: () => config.smtpEnv.from, label: 'Afzender' },
};

let cache = null;
let cacheAt = 0;

async function load() {
  if (cache && Date.now() - cacheAt < 30_000) return cache;
  const rows = await many('SELECT key, value, encrypted FROM settings');
  const map = {};
  for (const r of rows) {
    try {
      map[r.key] = r.encrypted ? decrypt(r.value) : r.value;
    } catch {
      map[r.key] = ''; // wrong ENCRYPTION_KEY -> treat as empty instead of crashing
    }
  }
  cache = map;
  cacheAt = Date.now();
  return map;
}

export function clearSettingsCache() { cache = null; }

export async function getSetting(key) {
  const def = DEFINITIONS[key];
  if (!def) throw new Error(`Unknown setting ${key}`);
  const fromEnv = def.env?.();
  if (fromEnv) return fromEnv;
  const map = await load();
  const v = map[key];
  return v !== undefined && v !== null && v !== '' ? v : def.default ?? '';
}

export async function getSettings(prefix) {
  const out = {};
  for (const key of Object.keys(DEFINITIONS)) {
    if (!prefix || key.startsWith(prefix)) out[key] = await getSetting(key);
  }
  return out;
}

export async function getBool(key) {
  return (await getSetting(key)) === 'true';
}

// Safe view for the frontend: secrets are never returned, only whether they are set + last 4 chars.
export async function getPublicSettings() {
  const map = await load();
  const out = {};
  for (const [key, def] of Object.entries(DEFINITIONS)) {
    const envValue = def.env?.();
    const value = envValue || map[key] || '';
    out[key] = {
      label: def.label,
      secret: !!def.secret,
      source: envValue ? 'env' : map[key] ? 'database' : 'default',
      isSet: !!value,
      value: def.secret ? (value ? mask(value) : '') : value || def.default || '',
    };
  }
  return out;
}

export async function saveSettings(values, userId) {
  for (const [key, raw] of Object.entries(values)) {
    const def = DEFINITIONS[key];
    if (!def) continue;
    const value = raw === null || raw === undefined ? '' : String(raw).trim();
    if (def.secret && value === '') continue; // empty secret field = keep the current value
    await query(
      `INSERT INTO settings(key, value, encrypted, updated_by, updated_at) VALUES ($1,$2,$3,$4, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, encrypted = EXCLUDED.encrypted,
       updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [key, def.secret ? encrypt(value) : value, !!def.secret, userId || null],
    );
  }
  clearSettingsCache();
}

export async function clearSecret(key, userId) {
  if (!DEFINITIONS[key]?.secret) return;
  await query('DELETE FROM settings WHERE key = $1', [key]);
  clearSettingsCache();
  return userId;
}
