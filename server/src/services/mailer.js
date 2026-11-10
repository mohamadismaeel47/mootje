import nodemailer from 'nodemailer';
import { getSettings } from './settings.js';

export async function smtpConfigured() {
  const s = await getSettings('smtp.');
  return !!(s['smtp.host'] && s['smtp.from']);
}

export async function sendMail({ to, subject, text, attachments }) {
  const s = await getSettings('smtp.');
  if (!s['smtp.host'] || !s['smtp.from']) {
    const err = new Error('E-mail (SMTP) is niet ingesteld. Vul eerst de SMTP-instellingen in.');
    err.status = 400;
    throw err;
  }
  const port = Number(s['smtp.port'] || 587);
  const transport = nodemailer.createTransport({
    host: s['smtp.host'],
    port,
    secure: port === 465,
    auth: s['smtp.user'] ? { user: s['smtp.user'], pass: s['smtp.pass'] } : undefined,
  });
  return transport.sendMail({ from: s['smtp.from'], to, subject, text, attachments });
}
