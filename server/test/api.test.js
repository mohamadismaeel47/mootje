import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, makeAgent, loggedInAdmin, pool } from './helpers.js';

let admin;
before(async () => { await resetDb(); admin = await loggedInAdmin(); });
after(async () => { await pool.end(); });

test('auth: setup only once, login, csrf header, roles', async () => {
  const a = makeAgent();
  const again = await a.post('/api/auth/setup').send({ name: 'Xavier', email: 'x@example.com', password: 'Password1234' });
  assert.equal(again.status, 409);
  assert.equal((await a.get('/api/dashboard')).status, 401);
  const wrong = await a.post('/api/auth/login').send({ email: 'admin@example.com', password: 'nope' });
  assert.equal(wrong.status, 401);
  const ok = await a.post('/api/auth/login').send({ email: 'admin@example.com', password: 'Password1234' });
  assert.equal(ok.status, 200);
  assert.equal((await a.get('/api/auth/me')).body.user.role, 'admin');
  // Without the client header, POST is refused (CSRF protection)
  const noHeader = await a.raw.post('/api/candidates').send({ phone: '+31600000001' });
  assert.equal(noHeader.status, 403);

  // viewer cannot create
  const u = await admin.post('/api/users').send({ name: 'Viewer', email: 'viewer@example.com', password: 'Password1234', role: 'viewer' });
  assert.equal(u.status, 201);
  const v = makeAgent();
  await v.post('/api/auth/login').send({ email: 'viewer@example.com', password: 'Password1234' });
  assert.equal((await v.get('/api/candidates')).status, 200);
  assert.equal((await v.post('/api/candidates').send({ phone: '+31600000002' })).status, 403);
  assert.equal((await v.get('/api/settings/webhook-events')).status, 403);
});

test('candidates: create, duplicate phone, update, status history, search, filters', async () => {
  const c = await admin.post('/api/candidates').send({
    full_name: 'Anna Kowalska', phone: '06 1234 5678', email: 'Anna@Example.com', driving_licence: true, forklift: true, english_level: 'good', bsn: '123456782', has_bsn: true,
  });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  assert.equal(c.body.phone, '31612345678');
  assert.equal(c.body.email, 'anna@example.com');
  assert.equal(c.body.has_bsn, true);
  assert.equal(c.body.bsn, undefined, 'the BSN number is never stored');
  const row = (await pool.query('SELECT * FROM candidates WHERE id = $1', [c.body.id])).rows[0];
  assert.ok(!JSON.stringify(row).includes('123456782'));

  const dup = await admin.post('/api/candidates').send({ full_name: 'Other', phone: '+31 6 12345678' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.details.existingId, c.body.id);

  const check = await admin.get('/api/candidates/check-phone?phone=0612345678');
  assert.equal(check.body.exists, true);

  const upd = await admin.patch(`/api/candidates/${c.body.id}`).send({ status: 'available', current_city: 'Breda' });
  assert.equal(upd.status, 200);
  const detail = await admin.get(`/api/candidates/${c.body.id}`);
  assert.equal(detail.body.history.length, 2);
  assert.equal(detail.body.history[0].to_status, 'available');

  assert.equal((await admin.get(`/api/candidates/${c.body.id}/bsn`)).status, 404);

  await admin.post('/api/candidates').send({ full_name: 'Jan Jansen', phone: '+48600100200' });
  assert.equal((await admin.get('/api/candidates?q=anna')).body.total, 1);
  assert.equal((await admin.get('/api/candidates?q=600100')).body.total, 1);
  assert.equal((await admin.get('/api/candidates?forklift=true')).body.total, 1);
  assert.equal((await admin.get('/api/candidates?english_level=basic')).body.total, 1);
  assert.equal((await admin.get('/api/candidates?status=available')).body.total, 1);

  const bad = await admin.post('/api/candidates').send({ phone: '12' });
  assert.equal(bad.status, 400);
});

test('candidates: export CSV/XLSX and import', async () => {
  const csv = await admin.get('/api/candidates/export?format=csv');
  assert.equal(csv.status, 200);
  assert.match(csv.text, /Full name,Phone,Email/);
  assert.match(csv.text, /Anna Kowalska/);
  const xlsx = await admin.get('/api/candidates/export?format=xlsx').buffer(true).parse((res, cb) => {
    const chunks = []; res.on('data', (d) => chunks.push(d)); res.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  assert.equal(xlsx.status, 200);
  assert.equal(xlsx.body.slice(0, 2).toString(), 'PK');

  const importCsv = 'Full name;Phone;Driving licence;Languages\nPiet Puk;0687654321;ja;Dutch, English\nDup;0612345678;no;\n;12;;\n';
  const r = await admin.post('/api/candidates/import').attach('file', Buffer.from(importCsv), 'import.csv');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.created, 1);
  assert.equal(r.body.duplicates.length, 1);
  assert.equal(r.body.errors.length, 1);
  const piet = (await admin.get('/api/candidates?q=piet')).body.items[0];
  assert.equal(piet.driving_licence, true);
  assert.deepEqual(piet.languages, ['Dutch', 'English']);
  assert.equal(piet.source, 'import');

  // XLSX round trip: import the exported file into a clean list -> all duplicates
  const again = await admin.post('/api/candidates/import').attach('file', xlsx.body, 'export.xlsx');
  assert.equal(again.body.created, 0);
  assert.equal(again.body.duplicates.length, 2, JSON.stringify(again.body));
  assert.equal(again.body.errors.length, 0);
});

test('CV upload, download and GDPR delete', async () => {
  const c = (await admin.post('/api/candidates').send({ full_name: 'Cv Person', phone: '+31611111111' })).body;
  const bad = await admin.post(`/api/candidates/${c.id}/files`).attach('file', Buffer.from('x'), { filename: 'x.exe', contentType: 'application/x-msdownload' });
  assert.equal(bad.status, 400);
  const up = await admin.post(`/api/candidates/${c.id}/files`).attach('file', Buffer.from('%PDF-1.4 test'), { filename: 'cv.pdf', contentType: 'application/pdf' });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  assert.equal(up.body.stored_name, undefined);
  const dl = await admin.get(`/api/files/${up.body.id}?download=1`);
  assert.equal(dl.status, 200);
  assert.match(dl.headers['content-disposition'], /attachment/);
  assert.equal((await makeAgent().get(`/api/files/${up.body.id}`)).status, 401);

  const exp = await admin.get(`/api/candidates/${c.id}/data-export`);
  assert.equal(exp.body.candidate.full_name, 'Cv Person');
  const del = await admin.delete(`/api/candidates/${c.id}`);
  assert.equal(del.status, 200);
  assert.equal((await admin.get(`/api/candidates/${c.id}`)).status, 404);
  assert.equal((await admin.get(`/api/files/${up.body.id}`)).status, 404);
});

test('agencies, vacancies, matching and submissions (approval required)', async () => {
  const ag = await admin.post('/api/agencies').send({ name: 'Flex Uitzend', email: 'jobs@flex.example', contact_person: 'Sanne' });
  assert.equal(ag.status, 201);
  const vac = await admin.post('/api/vacancies').send({
    title: 'Forklift driver', agency_id: ag.body.id, location: 'Breda', req_forklift: true, req_driving_licence: true, req_own_car: true, min_english_level: 'basic', positions: 3,
  });
  assert.equal(vac.status, 201, JSON.stringify(vac.body));
  const anna = (await admin.get('/api/candidates?q=anna')).body.items[0];
  const matches = (await admin.get(`/api/candidates/${anna.id}/matches`)).body;
  assert.equal(matches.length, 1);
  const m = matches[0];
  // has forklift (20), licence (15), english (15), available (10); own car unknown (15) -> 60/75 = 80%
  assert.equal(m.score, 80);
  assert.ok(m.checks.find((c) => c.label === 'Own car').unknown);
  assert.equal(m.eligible, true);

  const vm = (await admin.get(`/api/vacancies/${vac.body.id}/matches`)).body;
  assert.equal(vm[0].candidate.id, anna.id);

  const sub = await admin.post('/api/submissions').send({ candidate_id: anna.id, vacancy_id: vac.body.id });
  assert.equal(sub.status, 201);
  assert.equal(sub.body.status, 'proposed');
  assert.equal(sub.body.agency_id, ag.body.id);
  // Still not sent: candidate status unchanged
  assert.equal((await admin.get(`/api/candidates/${anna.id}`)).body.status, 'available');
  const noConfirm = await admin.post(`/api/submissions/${sub.body.id}/send`).send({});
  assert.equal(noConfirm.status, 400);
  const sent = await admin.post(`/api/submissions/${sub.body.id}/send`).send({ confirm: true, send_email: false });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.status, 'sent');
  assert.equal((await admin.get(`/api/candidates/${anna.id}`)).body.status, 'sent_to_agency');
  // Email without SMTP or consent is refused with a clear message
  const mail = await admin.post(`/api/submissions/${sub.body.id}/send`).send({ confirm: true, send_email: true });
  assert.equal(mail.status, 400);

  await admin.patch(`/api/submissions/${sub.body.id}`).send({ status: 'interview', interview_at: '2026-11-20T10:00:00Z' });
  const placed = await admin.patch(`/api/submissions/${sub.body.id}`).send({ status: 'placed' });
  assert.equal(placed.status, 200);
  const agency = (await admin.get(`/api/agencies/${ag.body.id}`)).body;
  assert.equal(agency.submissions.length, 1);

  const dash = (await admin.get('/api/dashboard')).body;
  assert.equal(dash.stats.placed, 1);
  assert.equal(dash.stats.active_vacancies, 1);
  assert.equal(dash.chart.length, 12);
  assert.equal(dash.chart.at(-1).placements, 1);
});

test('settings: secrets are encrypted and never returned', async () => {
  const r = await admin.put('/api/settings').send({ values: { 'whatsapp.access_token': 'EAAGsecrettoken1234', 'whatsapp.phone_number_id': '1234567890' } });
  assert.equal(r.status, 200);
  const s = (await admin.get('/api/settings')).body;
  assert.equal(s.settings['whatsapp.access_token'].isSet, true);
  assert.ok(!JSON.stringify(s).includes('EAAGsecrettoken1234'));
  assert.match(s.settings['whatsapp.access_token'].value, /1234$/);
  const row = (await pool.query("SELECT value FROM settings WHERE key = 'whatsapp.access_token'")).rows[0];
  assert.ok(row.value.startsWith('v1:'));
  assert.ok(!row.value.includes('secrettoken'));
  // Empty secret = keep existing
  await admin.put('/api/settings').send({ values: { 'whatsapp.access_token': '' } });
  assert.equal((await admin.get('/api/settings')).body.settings['whatsapp.access_token'].isSet, true);
  assert.ok(s.webhookUrl.endsWith('/api/webhooks/whatsapp'));
});
