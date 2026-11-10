import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, makeAgent, loggedInAdmin, pool } from './helpers.js';
import { totp, base32Encode, verifyTotp } from '../src/utils/totp.js';

before(async () => { await resetDb(); });
after(async () => { await pool.end(); });

test('TOTP matches RFC 6238 test vectors', () => {
  const s = base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(totp(s, 59000), '287082');
  assert.equal(totp(s, 1111111109000), '081804');
  assert.equal(verifyTotp(s, '287082', 59000), true);
  assert.equal(verifyTotp(s, '000000', 59000), false);
  assert.equal(verifyTotp(s, 'abc', 59000), false);
});

test('two-factor login: setup, enable, login needs the code, disable', async () => {
  const admin = await loggedInAdmin();
  const setup = await admin.post('/api/auth/2fa/setup');
  assert.equal(setup.status, 200);
  assert.match(setup.body.qr, /^data:image\/png;base64,/);
  const secret = setup.body.secret;
  assert.equal((await admin.post('/api/auth/2fa/enable').send({ code: '000000' })).status, 400);
  assert.equal((await admin.post('/api/auth/2fa/enable').send({ code: totp(secret) })).status, 200);
  // The secret is stored encrypted, never in plain text
  const row = (await pool.query('SELECT totp_secret_encrypted FROM users WHERE email = $1', ['admin@example.com'])).rows[0];
  assert.ok(!row.totp_secret_encrypted.includes(secret));
  // Session on this device stays valid after enabling
  assert.equal((await admin.get('/api/auth/me')).body.user.totp_enabled, true);

  const a = makeAgent();
  const step1 = await a.post('/api/auth/login').send({ email: 'admin@example.com', password: 'Password1234' });
  assert.equal(step1.status, 200);
  assert.equal(step1.body.needs2fa, true);
  assert.equal((await a.get('/api/dashboard')).status, 401, 'no session before the code');
  const wrong = await a.post('/api/auth/login').send({ email: 'admin@example.com', password: 'Password1234', code: '123456' });
  assert.equal(wrong.status, 401);
  const ok = await a.post('/api/auth/login').send({ email: 'admin@example.com', password: 'Password1234', code: totp(secret) });
  assert.equal(ok.status, 200);
  assert.equal((await a.get('/api/dashboard')).status, 200);

  const off = await a.post('/api/auth/2fa/disable').send({ password: 'Password1234', code: totp(secret) });
  assert.equal(off.status, 200);
  // the other device (admin) was logged out because 2FA changed
  assert.equal((await admin.get('/api/dashboard')).status, 401);
});

test('account is locked after 5 wrong passwords, admin can unlock', async () => {
  const admin = makeAgent();
  await admin.post('/api/auth/login').send({ email: 'admin@example.com', password: 'Password1234' });
  await admin.post('/api/users').send({ name: 'Rec', email: 'rec@example.com', password: 'Password1234', role: 'recruiter' });
  const a = makeAgent();
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await a.post('/api/auth/login').send({ email: 'rec@example.com', password: 'wrongpass1' })).status, 401);
  }
  const locked = await a.post('/api/auth/login').send({ email: 'rec@example.com', password: 'Password1234' });
  assert.equal(locked.status, 423);
  assert.match(locked.body.error, /geblokkeerd/);
  const id = (await pool.query('SELECT id FROM users WHERE email = $1', ['rec@example.com'])).rows[0].id;
  await admin.patch(`/api/users/${id}`).send({ unlock: true });
  assert.equal((await a.post('/api/auth/login').send({ email: 'rec@example.com', password: 'Password1234' })).status, 200);
});

test('logout everywhere and password change end other sessions', async () => {
  const d1 = makeAgent();
  const d2 = makeAgent();
  await d1.post('/api/auth/login').send({ email: 'rec@example.com', password: 'Password1234' });
  await d2.post('/api/auth/login').send({ email: 'rec@example.com', password: 'Password1234' });
  const pw = await d1.post('/api/auth/change-password').send({ currentPassword: 'Password1234', newPassword: 'NewPassword5678' });
  assert.equal(pw.status, 200);
  assert.equal((await d1.get('/api/auth/me')).status, 200, 'this device keeps working');
  assert.equal((await d2.get('/api/auth/me')).status, 401, 'other device is logged out');
  await d1.post('/api/auth/logout-everywhere');
  assert.equal((await d1.get('/api/auth/me')).status, 401);
});
