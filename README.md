# Recruitment CRM with WhatsApp automation

A web application to manage candidates, vacancies and recruitment agencies, with a WhatsApp assistant that
registers candidates automatically through the **official Meta WhatsApp Business Cloud API**.

- **Frontend:** React 18 + Vite (`client/`)
- **Backend:** Node.js 20+ with Express 5 (`server/`)
- **Database:** PostgreSQL 14+ (works with local PostgreSQL, Supabase, Neon, Railway, …)
- **Files:** CVs stored privately on the server disk, only downloadable after login

> 🇳🇱 Step-by-step guide (in Dutch) for connecting WhatsApp and the Coexistence question:
> [`docs/WHATSAPP-KOPPELEN.md`](docs/WHATSAPP-KOPPELEN.md)

---

## Features

| Area | What it does |
|---|---|
| Dashboard | Totals for candidates, new, contacted, available, placed, active vacancies, interviews, candidates waiting for a reply; weekly chart of registrations and placements; candidates by status |
| Candidates | Full profile (all fields from the brief), 10 statuses with history, search, filters, edit with auto-save, delete, Excel/CSV export, Excel/CSV import, duplicate protection by phone number |
| WhatsApp assistant | Asks the 12 questions one by one, saves each answer immediately, explains questions, re-asks unclear answers, skips known answers, English + Dutch, consent question, STOP / DELETE commands, notification when complete |
| WhatsApp inbox | All conversations, unread counters, search, filters, timestamps, delivery ticks, manual messages, automatic/manual mode, templates, follow-ups, 24-hour window indicator, test chat (simulator) |
| Vacancies & agencies | Full vacancy and agency records, linked to each other and to candidates |
| Matching | Match percentage per candidate/vacancy with reasons (✓ / ✗ / unknown); proposals need your approval before anything is sent |
| CV management | Upload, open, download, delete; CVs sent through WhatsApp are downloaded automatically; send CV to agency by email after approval |
| Security | bcrypt passwords, httpOnly session cookie, roles (admin / recruiter / viewer), CSRF protection, login rate limiting, encrypted API tokens, only BSN yes/no (never the number), webhook signature check, audit log |
| GDPR | Consent tracking, deletion requests via WhatsApp, data export per candidate, permanent delete incl. files and messages |

## Quick start (local)

Requirements: Node.js 20+, PostgreSQL.

```bash
# 1. Install
npm run install:all

# 2. Create a database (example for local PostgreSQL)
createuser -P crm            # choose a password
createdb -O crm recruitment_crm

# 3. Create .env with random secrets, then edit DATABASE_URL
npm run setup:env

# 4. Build the frontend and start the server (migrations run automatically)
npm run build
npm start                    # http://localhost:4000
```

Open the website. The first time you see **Create admin account**. (Set `SETUP_TOKEN` in `.env` on a public server, so
only you can create the first account. Or use `npm run create-admin -- "Name" you@example.com "Password123456"`.)

For development with hot reload run `npm run dev:server` and `npm run dev:client` (http://localhost:5173).

## Deploying

**Railway:** `railway.json` contains the build/start commands – see the Dutch guide
[`docs/RAILWAY.md`](docs/RAILWAY.md) (database, volume, variables, custom domain).
**Render:** use the Blueprint (`render.yaml`) – see [`docs/ONLINE-ZETTEN.md`](docs/ONLINE-ZETTEN.md). In production `SETUP_TOKEN` is required, so nobody else can create
the first account.

Any host that runs Node.js and gives you **https** works (Render, Railway, Fly.io, a VPS, …). Meta requires an https
webhook URL with a valid certificate.

1. Create a PostgreSQL database (for Supabase/Neon set `DATABASE_SSL=true`).
2. Set the environment variables from `.env.example` in your host (never commit `.env`).
   `NODE_ENV=production`, `PUBLIC_URL=https://your-domain`, `JWT_SECRET`, `ENCRYPTION_KEY`, `SETUP_TOKEN`.
3. Build command: `npm run install:all && npm run build` — Start command: `npm start`.
4. Make sure `UPLOAD_DIR` is on a **persistent disk** (otherwise CVs are lost on redeploy).
5. Back up the database and `ENCRYPTION_KEY`. Without the key, encrypted tokens cannot be read.

The server runs as **one process** (the assistant processes messages of one conversation in order). Do not run multiple
instances behind a load balancer without adding a shared lock.

## Connecting WhatsApp (summary)

1. Meta app (type *Business*) with the **WhatsApp** product, a WhatsApp Business Account (WABA) and a phone number.
2. Create a **System User** in Business Settings, give it the app + WABA, and generate a **permanent token** with
   `whatsapp_business_messaging` and `whatsapp_business_management`.
3. In the CRM: **Settings → WhatsApp API**, fill in token, Phone Number ID, WABA ID, App Secret and a Verify Token
   of your choice (or set them as environment variables – those always win).
4. In Meta: **WhatsApp → Configuration → Webhook**: callback URL `https://your-domain/api/webhooks/whatsapp`, the same
   verify token, **Verify and save**, subscribe to `messages` (and `smb_message_echoes` for Coexistence).
5. Click **Test connection** in the CRM. Every check calls Meta for real and shows Meta's own error message if
   something is wrong. Use **Subscribe app** if the WABA has no subscribed app.
6. Create approved **message templates** for the first message and for follow-ups, and enter their names under
   **Settings → Assistant**.

Webhook endpoint details:

- `GET /api/webhooks/whatsapp` – answers `hub.challenge` only when `hub.verify_token` matches.
- `POST /api/webhooks/whatsapp` – rejects requests without a valid `X-Hub-Signature-256` (HMAC-SHA256 with the App
  Secret), answers 200 quickly, then processes messages, statuses and Coexistence echoes. Duplicate deliveries are
  ignored. The **Webhook activity** list in Settings shows every call (without message contents).

**Without credentials the integration does not pretend to work**: sending fails with a clear message, and the
connection test shows what is missing. Use the **Test chat** button in the inbox to try the assistant without Meta.

## The 24-hour window and templates

WhatsApp only allows free-form messages within 24 hours after the candidate's last message. Outside that window:

- the inbox disables the text box and offers **Send template**;
- **Start WhatsApp** on a candidate uses the template from *Settings → Assistant → Template for the first message*;
- **Send follow-up** uses the follow-up template.

## Privacy notes

- **BSN:** the assistant only asks *whether* a candidate has a valid BSN (yes/no) and tells them not to send the
  number. The CRM never stores the BSN number itself; the employer/agency collects it when the contract is signed.
- Collect only what you need, and review/delete old candidates according to your retention period.
- Candidates can send **DELETE** / **VERWIJDER**; you get a notification and delete the profile with one click.

## Tests

```bash
createdb -O crm recruitment_crm_test   # once
npm test
```

28 automated tests cover the answer parsers, login/roles/CSRF, candidates (duplicates, filters, export, import),
CV upload and GDPR delete, matching and approval flow, encrypted settings, webhook verification and signatures, a
complete 12-question WhatsApp conversation through the real webhook (with the Meta API mocked), Dutch conversations,
duplicate webhooks, manual takeover, delivery statuses, the 24-hour window, Meta error handling, CV download from
WhatsApp, Coexistence echoes, DELETE requests and the simulator.

## Project structure

```
server/
  src/db/migrations/   SQL schema
  src/routes/          REST API (auth, candidates, conversations, webhook, …)
  src/services/        business logic (whatsapp.js, messenger.js, inbound.js, matching.js, …)
  src/services/bot/    the WhatsApp assistant (texts.js = all messages, parsers.js, engine.js)
  test/                automated tests
client/
  src/pages/           Dashboard, Candidates, Inbox, Vacancies, Agencies, Settings, …
docs/                  setup guides
```

To change the assistant's wording, edit `server/src/services/bot/texts.js`. To add a language, copy the `en` block.
