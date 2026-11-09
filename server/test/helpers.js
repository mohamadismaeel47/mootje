// Test helpers. Uses a separate database: TEST_DATABASE_URL (default: local recruitment_crm_test).
import crypto from "node:crypto";
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://crm:crm_dev_pw@localhost:5432/recruitment_crm_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.UPLOAD_DIR = new URL('../storage/test-uploads', import.meta.url).pathname;
for (const k of ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_BUSINESS_ACCOUNT_ID', 'META_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN']) delete process.env[k];

const { pool } = await import('../src/db/pool.js');
const { migrate } = await import('../src/db/migrate.js');
const { createApp } = await import('../src/app.js');
const { clearSettingsCache } = await import('../src/services/settings.js');
const supertest = (await import('supertest')).default;

export { pool };

export async function resetDb() {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
  clearSettingsCache();
}

export function makeAgent() {
  const app = createApp();
  const agent = supertest.agent(app);
  const wrap = (method) => (url) => agent[method](url).set('x-crm-client', '1');
  return {
    raw: agent,
    app,
    get: wrap('get'),
    post: wrap('post'),
    put: wrap('put'),
    patch: wrap('patch'),
    delete: wrap('delete'),
  };
}

export async function loggedInAdmin() {
  const a = makeAgent();
  const r = await a.post('/api/auth/setup').send({ name: 'Admin', email: 'admin@example.com', password: 'Password1234' });
  if (r.status !== 201) throw new Error(`setup failed ${r.status} ${JSON.stringify(r.body)}`);
  return a;
}

// Replaces global fetch so no request reaches Meta. Records all calls.
export function mockGraph(handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ url: String(url), method: opts.method || 'GET', body, headers: opts.headers });
    const out = handler ? await handler(String(url), body) : undefined;
    const data = out ?? { messaging_product: 'whatsapp', messages: [{ id: `wamid.out.${crypto.randomUUID()}` }] };
    const status = data.__status || 200;
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
