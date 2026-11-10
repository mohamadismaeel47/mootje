// Public endpoint for Meta. URL: https://YOUR-DOMAIN/api/webhooks/whatsapp
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getWhatsAppConfig, verifySignature } from '../services/whatsapp.js';
import { processWebhookPayload, logEvent } from '../services/inbound.js';
import { safeEqual } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';

const router = Router();
router.use(rateLimit({ windowMs: 60_000, limit: 1200, standardHeaders: true, legacyHeaders: false }));

// 1) Verification request (GET). Meta sends hub.mode, hub.verify_token and hub.challenge.
//    We must answer with the challenge as plain text when the token matches.
router.get('/', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const { verifyToken } = await getWhatsAppConfig();
  if (!verifyToken) {
    await logEvent('verify', false, 'Verify token is niet ingesteld in de CRM');
    return res.status(403).type('text/plain').send('Verify token not configured');
  }
  if (mode === 'subscribe' && typeof token === 'string' && safeEqual(token, verifyToken) && typeof challenge === 'string') {
    await logEvent('verify', true, 'Webhook geverifieerd door Meta');
    logger.info('Webhook verified by Meta');
    return res.status(200).type('text/plain').send(challenge);
  }
  await logEvent('verify', false, mode !== 'subscribe' ? `Verkeerde hub.mode: ${mode}` : 'Verify token klopt niet');
  return res.status(403).type('text/plain').send('Forbidden');
});

// 2) Notifications (POST). The raw body is needed to check the X-Hub-Signature-256 header.
router.post('/', express.raw({ type: '*/*', limit: '2mb' }), async (req, res) => {
  const { appSecret } = await getWhatsAppConfig();
  const signature = req.get('x-hub-signature-256');
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  if (!appSecret) {
    await logEvent('signature', false, 'App-geheim niet ingesteld – bericht geweigerd');
    return res.sendStatus(401);
  }
  if (!verifySignature(raw, signature, appSecret)) {
    await logEvent('signature', false, signature ? 'Ongeldige handtekening – bericht geweigerd (klopt het App-geheim?)' : 'Handtekening ontbreekt – bericht geweigerd');
    return res.sendStatus(401);
  }
  let payload;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    await logEvent('parse', false, 'Bericht is geen geldige JSON');
    return res.sendStatus(400);
  }
  // Answer Meta quickly (it retries when we are slow), then process.
  res.sendStatus(200);
  processWebhookPayload(payload).catch((err) => logger.error('Webhook processing failed', { error: err.message }));
});

export default router;
