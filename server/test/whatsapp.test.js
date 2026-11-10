import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { resetDb, loggedInAdmin, makeAgent, mockGraph, pool, sleep } from './helpers.js';

const SECRET = 'test-app-secret';
const VERIFY = 'my-verify-token';
const PHONE_ID = '111222333';
let admin;
let graph;

before(async () => {
  await resetDb();
  admin = await loggedInAdmin();
  await admin.put('/api/settings').send({ values: {
    'whatsapp.access_token': 'EAAtesttoken', 'whatsapp.phone_number_id': PHONE_ID, 'whatsapp.business_account_id': '999',
    'whatsapp.app_secret': SECRET, 'whatsapp.verify_token': VERIFY, 'bot.question_mode': 'one',
  } });
});
after(async () => { graph?.restore(); await pool.end(); });
beforeEach(() => { graph?.restore(); graph = mockGraph(); });

const sign = (body) => `sha256=${crypto.createHmac('sha256', SECRET).update(body).digest('hex')}`;
let n = 0;
function payload(from, text, extra = {}) {
  n += 1;
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: '999', changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp',
      metadata: { display_phone_number: '31600000000', phone_number_id: PHONE_ID },
      contacts: [{ profile: { name: 'Piotr' }, wa_id: from }],
      messages: [{ from, id: `wamid.in.${n}.${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text }, ...extra }],
    } }] }],
  };
}

async function deliver(body) {
  const raw = JSON.stringify(body);
  const r = await makeAgent().raw.post('/api/webhooks/whatsapp').set('content-type', 'application/json').set('x-hub-signature-256', sign(raw)).send(raw);
  assert.equal(r.status, 200);
  await sleep(150); // processing happens after the 200 response
}

const sentTexts = () => graph.calls.filter((c) => c.url.endsWith(`/${PHONE_ID}/messages`) && c.body?.type === 'text').map((c) => c.body.text.body);
const lastSent = () => sentTexts().at(-1);

test('webhook GET verification', async () => {
  const a = makeAgent();
  const ok = await a.raw.get(`/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=CHALLENGE123`);
  assert.equal(ok.status, 200);
  assert.equal(ok.text, 'CHALLENGE123');
  const bad = await a.raw.get('/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x');
  assert.equal(bad.status, 403);
});

test('webhook POST rejects missing or invalid signatures', async () => {
  const raw = JSON.stringify(payload('48600000001', 'hi'));
  const a = makeAgent();
  assert.equal((await a.raw.post('/api/webhooks/whatsapp').set('content-type', 'application/json').send(raw)).status, 401);
  assert.equal((await a.raw.post('/api/webhooks/whatsapp').set('content-type', 'application/json').set('x-hub-signature-256', 'sha256=deadbeef').send(raw)).status, 401);
  await sleep(50);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM candidates');
  assert.equal(rows[0].n, 0);
});

test('full registration conversation through the real webhook', async () => {
  const from = '48600111222';
  await deliver(payload(from, 'Hello'));
  assert.equal(lastSent(), 'Hi! My name is Mohamad. Is it correct that you are looking for a job?');
  const call = graph.calls.find((c) => c.body?.type === 'text');
  assert.equal(call.headers.Authorization, 'Bearer EAAtesttoken');
  assert.match(call.url, /graph\.facebook\.com\/v23\.0\//);
  assert.equal(call.body.to, from);

  await deliver(payload(from, 'yes'));
  assert.match(lastSent(), /^Great!.*Do you agree\? \(YES \/ NO\)$/s);
  await deliver(payload(from, 'yes'));
  assert.match(lastSent(), /Question 1 of 12: What is your full name\?/);

  const steps = [
    ['piotr nowak', /Question 2 of 12: How old/],
    ['what do you mean?', /Please write your age as a number/], // explanation, same question again
    ['old', /Sorry, I did not understand/],
    ['29', /Question 3 of 12: What is your nationality/],
    ['Polish', /Question 4 of 12/],
    ['Breda, Netherlands', /Question 5 of 12: Do you have a valid BSN/],
    ['what is bsn', /Burgerservicenummer/],
    ['yes', /Question 6 of 12: Do you speak English/],
    ['a little', /Question 7 of 12/],
    ['yes', /Question 8 of 12: Do you have your own car/],
    ['no', /Question 9 of 12/],
    ['yes, 3 years order picking in a warehouse', /Question 10 of 12/],
    ['yes', /Which certificates do you have/],
    ['forklift and ept', /Question 11 of 12: When can you start/],
    ['immediately', /Question 12 of 12/],
    ['Forklift driver', /Do you have a CV\?/],
    ['no', /Your registration is complete/],
  ];
  for (const [answer, expected] of steps) {
    await deliver(payload(from, answer));
    assert.match(lastSent(), expected, `after answer "${answer}" got: ${lastSent()}`);
  }

  const c = (await pool.query('SELECT * FROM candidates WHERE phone = $1', [from])).rows[0];
  assert.equal(c.full_name, 'Piotr Nowak');
  assert.equal(c.age, 29);
  assert.equal(c.nationality, 'Polish');
  assert.equal(c.current_city, 'Breda');
  assert.equal(c.current_country, 'Netherlands');
  assert.equal(c.has_bsn, true);
  assert.equal(c.english_level, 'basic');
  assert.equal(c.driving_licence, true);
  assert.equal(c.own_car, false);
  assert.equal(c.has_experience, true);
  assert.equal(c.forklift, true);
  assert.equal(c.ept, true);
  assert.equal(c.reach_truck, false);
  assert.ok(c.available_from);
  assert.equal(c.desired_job, 'Forklift driver');
  assert.equal(c.consent_given, true);
  assert.equal(c.status, 'information_complete');
  assert.equal(c.source, 'whatsapp');

  const notes = (await admin.get('/api/notifications')).body.items.map((x) => x.type);
  assert.ok(notes.includes('registration_complete'));

  const conv = (await admin.get('/api/conversations')).body.find((x) => x.phone === from);
  assert.equal(conv.status, 'completed');
  assert.equal(conv.window_open, true);
  const detail = (await admin.get(`/api/conversations/${conv.id}`)).body;
  assert.ok(detail.messages.length >= 40);
  assert.equal(detail.profile_name, 'Piotr');
});

test('Dutch conversation, skipping questions already answered', async () => {
  const from = '31687000111';
  await admin.post('/api/candidates').send({ phone: `+${from}`, full_name: 'Sanne de Vries', age: 30, nationality: 'Nederlands', consent_given: true });
  await deliver(payload(from, 'Hoi, ik zoek werk'));
  // job interest in the first message: skips the intro question, consent already given, name/age/nationality known
  assert.match(lastSent(), /^Top!.*Vraag 4 van 12: Waar woon je/s);
});

test('duplicate webhook deliveries are processed once', async () => {
  const from = '48600999888';
  const p = payload(from, 'hello');
  await deliver(p);
  await deliver(p);
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
    JOIN candidates cand ON cand.id = c.candidate_id WHERE cand.phone = $1 AND m.direction = 'in'`, [from]);
  assert.equal(rows[0].n, 1);
});

test('manual takeover: bot stays quiet, recruiter can send, delivery statuses are applied', async () => {
  const from = '48600555444';
  await deliver(payload(from, 'hi'));
  const conv = (await admin.get('/api/conversations?q=600555')).body[0];
  await admin.post(`/api/conversations/${conv.id}/mode`).send({ mode: 'manual' });
  const before = graph.calls.length;
  await deliver(payload(from, 'yes'));
  assert.equal(graph.calls.length, before, 'bot must not reply in manual mode');

  const sent = await admin.post(`/api/conversations/${conv.id}/messages`).send({ text: 'Hi, this is Mohamad personally.' });
  assert.equal(sent.status, 201);
  assert.equal(sent.body.status, 'sent');
  assert.equal(lastSent(), 'Hi, this is Mohamad personally.');

  // status webhook
  await deliver({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
    metadata: { phone_number_id: PHONE_ID }, statuses: [{ id: sent.body.wa_message_id, status: 'read', recipient_id: from }] } }] }] });
  const msgs = (await admin.get(`/api/conversations/${conv.id}`)).body.messages;
  assert.equal(msgs.find((m) => m.id === sent.body.id).status, 'read');

  // hand back to bot: it continues with the open question
  const r = await admin.post(`/api/conversations/${conv.id}/mode`).send({ mode: 'auto' });
  assert.equal(r.body.mode, 'auto');
});

test('24-hour window: free text refused, template required', async () => {
  const from = '48600333222';
  await deliver(payload(from, 'hi'));
  const conv = (await admin.get('/api/conversations?q=600333')).body[0];
  await pool.query(`UPDATE conversations SET last_inbound_at = now() - interval '25 hours' WHERE id = $1`, [conv.id]);
  const r = await admin.post(`/api/conversations/${conv.id}/messages`).send({ text: 'Are you still there?' });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /24 uur/);
  const f = await admin.post(`/api/conversations/${conv.id}/follow-up`);
  assert.equal(f.status, 409);
  const tmpl = await admin.post(`/api/conversations/${conv.id}/template`).send({ name: 'job_followup', language: 'en', params: ['Piotr'] });
  assert.equal(tmpl.status, 201, JSON.stringify(tmpl.body));
  const call = graph.calls.at(-1);
  assert.equal(call.body.type, 'template');
  assert.equal(call.body.template.name, 'job_followup');
  assert.deepEqual(call.body.template.components[0].parameters, [{ type: 'text', text: 'Piotr' }]);
});

test('Meta API errors are shown clearly and stored on the message', async () => {
  graph.restore();
  graph = mockGraph(() => ({ __status: 401, error: { message: 'Error validating access token', code: 190, fbtrace_id: 'abc' } }));
  const from = '48600777666';
  await deliver(payload(from, 'hi'));
  const conv = (await admin.get('/api/conversations?q=600777')).body[0];
  const msgs = (await admin.get(`/api/conversations/${conv.id}`)).body.messages;
  const out = msgs.find((m) => m.direction === 'out');
  assert.equal(out.status, 'failed');
  assert.match(out.error, /access token/i);
  const r = await admin.post(`/api/conversations/${conv.id}/messages`).send({ text: 'test' });
  assert.equal(r.status, 400);
  assert.match(r.body.hint, /System User token/);
});

test('CV sent via WhatsApp is downloaded and attached', async () => {
  graph.restore();
  graph = mockGraph((url) => {
    if (url.includes('/media123')) return { url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=media123', mime_type: 'application/pdf', file_size: 10 };
    if (url.startsWith('https://lookaside')) return { pdf: true };
    return undefined;
  });
  const from = '48600121212';
  await deliver(payload(from, 'hi'));
  await deliver(payload(from, '', { type: 'document', text: undefined, document: { id: 'media123', filename: 'my cv.pdf', mime_type: 'application/pdf' } }));
  assert.equal(lastSent(), 'Thank you, we received your file!');
  const cand = (await pool.query('SELECT id FROM candidates WHERE phone = $1', [from])).rows[0];
  const files = (await admin.get(`/api/candidates/${cand.id}`)).body.files;
  assert.equal(files.length, 1);
  assert.equal(files[0].source, 'whatsapp');
  assert.equal(files[0].original_name, 'my cv.pdf');
  const download = graph.calls.find((c) => c.url.startsWith('https://lookaside'));
  assert.equal(download.headers.Authorization, 'Bearer EAAtesttoken');
});

test('Coexistence echo: message from the Business app switches to manual mode', async () => {
  const from = '48600343434';
  await deliver(payload(from, 'hi'));
  await deliver({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'smb_message_echoes', value: {
    metadata: { phone_number_id: PHONE_ID },
    message_echoes: [{ from: '31600000000', to: from, id: 'wamid.echo.1', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'Typed on my phone' } }] } }] }] });
  const conv = (await admin.get('/api/conversations?q=600343')).body[0];
  assert.equal(conv.mode, 'manual');
  const msgs = (await admin.get(`/api/conversations/${conv.id}`)).body.messages;
  assert.ok(msgs.some((m) => m.direction === 'out' && m.body === 'Typed on my phone'));
});

test('GDPR: DELETE command creates a deletion request', async () => {
  const from = '48600565656';
  await deliver(payload(from, 'hi'));
  await deliver(payload(from, 'DELETE'));
  const c = (await pool.query('SELECT deletion_requested_at FROM candidates WHERE phone = $1', [from])).rows[0];
  assert.ok(c.deletion_requested_at);
  assert.match(lastSent(), /delete your data/);
});

test('simulator uses the same bot without calling Meta', async () => {
  const before = graph.calls.length;
  const r = await admin.post('/api/conversations/simulate').send({ text: 'Hello' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.action, 'intro');
  const r2 = await admin.post('/api/conversations/simulate').send({ phone: r.body.phone, text: 'ja' });
  assert.equal(r2.body.action, 'consent_asked');
  assert.equal(graph.calls.length, before);
  const conv = (await admin.get(`/api/conversations/${r.body.conversationId}`)).body;
  assert.equal(conv.simulated, true);
  assert.ok(conv.messages.every((m) => m.direction === 'in' || m.status === 'simulated'));
  assert.equal((await admin.delete(`/api/conversations/${r.body.conversationId}`)).status, 200);
});

test('all-at-once mode: one numbered list, missing answers asked one by one', async () => {
  await admin.put('/api/settings').send({ values: { 'bot.question_mode': 'all' } });
  const from = '48600888777';
  await deliver(payload(from, 'Hello'));
  await deliver(payload(from, 'yes'));
  await deliver(payload(from, 'yes'));
  const list = lastSent();
  assert.match(list, /in ONE message/);
  assert.match(list, /^1\. What is your full name\?$/m);
  assert.match(list, /^12\. What kind of job are you looking for\?$/m);

  // One reply with all answers; the age answer is unclear.
  await deliver(payload(from, [
    '1. Marta Zielinska', '2. old', '3. Polish', '4. Tilburg, Netherlands', '5. yes', '6. good', '7. yes', '8. no',
    '9. yes, 1 year packing in a warehouse', '10. EPT', '11. next week', '12. order picker',
  ].join('\n')));
  assert.match(lastSent(), /I saved your answers! I still need a few more answers:\n\nQuestion 2 of 12: How old are you\?/);
  let c = (await pool.query('SELECT * FROM candidates WHERE phone = $1', [from])).rows[0];
  assert.equal(c.full_name, 'Marta Zielinska');
  assert.equal(c.current_city, 'Tilburg');
  assert.equal(c.ept, true);
  assert.equal(c.forklift, false);
  assert.equal(c.desired_job, 'order picker');
  assert.equal(c.age, null);

  await deliver(payload(from, '31'));
  assert.match(lastSent(), /Do you have a CV\?/);
  c = (await pool.query('SELECT age FROM candidates WHERE phone = $1', [from])).rows[0];
  assert.equal(c.age, 31);
});

test('all-at-once mode: answers on one line and in separate messages', async () => {
  const from = '48600888666';
  await deliver(payload(from, 'Hi, I am looking for a job'));
  await deliver(payload(from, 'yes'));
  await deliver(payload(from, '1. Ion Popescu 2. 40 3) Romanian'));
  assert.match(lastSent(), /Question 4 of 12/);
  // A numbered answer to another open question while a single question is open
  await deliver(payload(from, '6. fluent'));
  const c = (await pool.query('SELECT * FROM candidates WHERE phone = $1', [from])).rows[0];
  assert.equal(c.full_name, 'Ion Popescu');
  assert.equal(c.age, 40);
  assert.equal(c.nationality, 'Romanian');
  assert.equal(c.english_level, 'fluent');
  assert.match(lastSent(), /Question 4 of 12/);
});

test('all-at-once mode: unreadable reply twice falls back to one by one', async () => {
  const from = '48600888555';
  await deliver(payload(from, 'job'));
  await deliver(payload(from, 'yes'));
  await deliver(payload(from, 'ok I will answer later'));
  assert.match(lastSent(), /could not read your answers/);
  await deliver(payload(from, 'hmm'));
  assert.match(lastSent(), /one question at a time\.\n\nQuestion 1 of 12: What is your full name\?/);
  await admin.put('/api/settings').send({ values: { 'bot.question_mode': 'one' } });
});
