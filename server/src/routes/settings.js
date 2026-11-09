import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { many } from '../db/pool.js';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { getPublicSettings, saveSettings, clearSecret, DEFINITIONS } from '../services/settings.js';
import { testConnection, subscribeApp, missingConfig } from '../services/whatsapp.js';
import { sendMail, smtpConfigured } from '../services/mailer.js';
import { audit } from '../services/audit.js';

const router = Router();

router.get('/', async (req, res) => {
  const base = config.publicUrl || `${req.protocol}://${req.get('host')}`;
  res.json({
    settings: await getPublicSettings(),
    webhookUrl: `${base.replace(/\/$/, '')}/api/webhooks/whatsapp`,
    publicUrlConfigured: !!config.publicUrl,
    whatsappMissing: await missingConfig(),
    smtpConfigured: await smtpConfigured(),
  });
});

router.put('/', requireRole('admin'), validate(z.object({ values: z.record(z.string(), z.union([z.string().max(4000), z.null()])) })), async (req, res) => {
  const keys = Object.keys(req.body.values).filter((k) => DEFINITIONS[k]);
  await saveSettings(req.body.values, req.user.id);
  await audit(req.user.id, 'update_settings', 'settings', null, keys.join(', '));
  res.json({ settings: await getPublicSettings() });
});

router.delete('/secret/:key', requireRole('admin'), async (req, res) => {
  await clearSecret(req.params.key, req.user.id);
  await audit(req.user.id, 'clear_secret', 'settings', null, req.params.key);
  res.json({ settings: await getPublicSettings() });
});

router.post('/whatsapp/test', requireRole('admin'), async (_req, res) => {
  res.json(await testConnection());
});

router.post('/whatsapp/subscribe', requireRole('admin'), async (req, res) => {
  const r = await subscribeApp();
  await audit(req.user.id, 'subscribe_app', 'settings');
  res.json(r);
});

router.get('/webhook-events', requireRole('admin'), async (_req, res) => {
  res.json(await many('SELECT * FROM webhook_events ORDER BY created_at DESC LIMIT 100'));
});

router.post('/smtp/test', requireRole('admin'), validate(z.object({ to: z.string().email() })), async (req, res) => {
  await sendMail({ to: req.body.to, subject: 'Recruitment CRM test email', text: 'Your SMTP settings work.' });
  res.json({ ok: true });
});

router.get('/audit-log', requireRole('admin'), async (_req, res) => {
  res.json(await many(`SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT 200`));
});

export default router;
