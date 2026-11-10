// Public pages that Meta requires for publishing the app: privacy policy, terms and data deletion instructions.
// They contain no personal data and need no login.
import { Router } from 'express';
import { getSetting } from '../services/settings.js';

const router = Router();

const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f3f5f8;color:#16202e;margin:0;line-height:1.6}
  main{max-width:760px;margin:0 auto;background:#fff;padding:32px 24px;min-height:100vh;box-sizing:border-box}
  h1{color:#0f2a4a;font-size:26px;margin-top:0} h2{color:#0f2a4a;font-size:18px;margin-top:28px}
  a{color:#2f7de1} .muted{color:#5d6b7e;font-size:14px} nav a{margin-right:16px}
</style></head><body><main>
<nav class="muted"><a href="/privacy">Privacy policy</a><a href="/terms">Terms</a><a href="/data-deletion">Data deletion</a></nav>
${body}
</main></body></html>`;
}

async function company() {
  const name = await getSetting('general.company_name');
  return name || 'Recruitmen';
}

router.get('/privacy', async (_req, res) => {
  const c = esc(await company());
  const months = esc(await getSetting('privacy.retention_months'));
  res.type('html').send(page(`Privacy policy – ${c}`, `
<h1>Privacy policy</h1>
<p class="muted">${c} · Recruitment services</p>
<p>${c} helps people find work through recruitment agencies. This policy explains which personal data we collect when you contact us (for example via WhatsApp), why we collect it and what your rights are.</p>
<h2>Which data we collect</h2>
<p>Only data that is needed for recruitment: your name, phone number, (optional) email address, age or date of birth, nationality, where you live, whether you have a valid BSN (yes/no – we never ask for or store the number itself), languages, driving licence, own car, work experience, certificates, availability, the kind of job you are looking for, your CV if you send it, and the messages you exchange with us.</p>
<h2>Why we use it</h2>
<p>To find suitable jobs for you and to contact you about them. We only share your data with a recruitment agency for a job that suits you, and only after a recruiter has checked and approved this.</p>
<h2>Legal basis</h2>
<p>Your consent, which we ask before we collect your answers. You can withdraw your consent at any time.</p>
<h2>How long we keep it</h2>
<p>As long as needed to help you find work, and at most ${months || '24'} months after our last contact, unless you ask us to delete it earlier.</p>
<h2>Security</h2>
<p>Your data is stored in a secured database. Only authorised recruiters can see it after logging in.</p>
<h2>Your rights</h2>
<p>You can ask to see, correct or delete your data, or object to its use. Send <b>DELETE</b> in WhatsApp, or see <a href="/data-deletion">data deletion</a>. You can also file a complaint with the Dutch Data Protection Authority (Autoriteit Persoonsgegevens).</p>
<h2>WhatsApp</h2>
<p>We use the WhatsApp Business Platform of Meta to communicate with you. Messages are processed by Meta according to the WhatsApp Business terms.</p>`));
});

router.get('/terms', async (_req, res) => {
  const c = esc(await company());
  res.type('html').send(page(`Terms – ${c}`, `
<h1>Terms of service</h1>
<p>${c} offers a free service for job seekers: we collect your information and look for suitable jobs with recruitment agencies.</p>
<h2>Use of the service</h2>
<p>Please give correct information. We do not guarantee that we will find a job for you. Agencies decide themselves whether they offer you a job.</p>
<h2>Messages</h2>
<p>You can stop automatic messages at any time by sending <b>STOP</b>, and start again by sending <b>START</b>.</p>
<h2>Privacy</h2>
<p>How we handle your personal data is described in our <a href="/privacy">privacy policy</a>.</p>`));
});

router.get('/data-deletion', async (_req, res) => {
  const c = esc(await company());
  res.type('html').send(page(`Data deletion – ${c}`, `
<h1>Delete your data</h1>
<p>You can ask ${c} to delete all your personal data at any time.</p>
<h2>How</h2>
<ol>
  <li>Send the word <b>DELETE</b> (or <b>VERWIJDER</b>) to us on WhatsApp.</li>
  <li>A recruiter checks your request and permanently deletes your profile, your messages and your CV.</li>
  <li>We confirm the deletion to you.</li>
</ol>
<p>We handle your request as soon as possible, and at the latest within one month.</p>`));
});

export default router;
