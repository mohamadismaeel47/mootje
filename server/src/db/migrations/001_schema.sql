-- Recruitment CRM: complete data model.

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'recruiter' CHECK (role IN ('admin','recruiter','viewer')),
  active        BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Key/value settings. Secret values are stored AES-256-GCM encrypted.
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  encrypted  BOOLEAN NOT NULL DEFAULT false,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agencies (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  contact_person TEXT,
  email          TEXT,
  phone          TEXT,
  address        TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vacancies (
  id                     SERIAL PRIMARY KEY,
  title                  TEXT NOT NULL,
  agency_id              INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
  location               TEXT,
  salary                 TEXT,
  working_hours          TEXT,
  req_driving_licence    BOOLEAN NOT NULL DEFAULT false,
  req_own_car            BOOLEAN NOT NULL DEFAULT false,
  req_forklift           BOOLEAN NOT NULL DEFAULT false,
  req_ept                BOOLEAN NOT NULL DEFAULT false,
  req_reach_truck        BOOLEAN NOT NULL DEFAULT false,
  req_experience         BOOLEAN NOT NULL DEFAULT false,
  required_experience    TEXT,
  min_english_level      TEXT NOT NULL DEFAULT 'none' CHECK (min_english_level IN ('none','basic','good','fluent')),
  required_languages     TEXT[] NOT NULL DEFAULT '{}',
  positions              INTEGER NOT NULL DEFAULT 1 CHECK (positions >= 0),
  description            TEXT,
  status                 TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','paused','filled','closed')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE candidates (
  id                   SERIAL PRIMARY KEY,
  full_name            TEXT,
  phone                TEXT NOT NULL UNIQUE,          -- normalised, digits only (WhatsApp wa_id format)
  email                TEXT,
  nationality          TEXT,
  current_country      TEXT,
  current_city         TEXT,
  has_bsn              BOOLEAN,
  bsn_encrypted        TEXT,                          -- AES-256-GCM, only visible to admins
  date_of_birth        DATE,
  age                  INTEGER CHECK (age IS NULL OR (age BETWEEN 14 AND 100)),
  languages            TEXT[] NOT NULL DEFAULT '{}',
  english_level        TEXT CHECK (english_level IS NULL OR english_level IN ('none','basic','good','fluent')),
  driving_licence      BOOLEAN,
  own_car              BOOLEAN,
  forklift             BOOLEAN,
  ept                  BOOLEAN,
  reach_truck          BOOLEAN,
  has_experience       BOOLEAN,                       -- warehouse / production experience
  work_experience      TEXT,
  previous_jobs        TEXT,
  desired_job          TEXT,
  availability         TEXT,
  available_from       DATE,
  notes                TEXT,
  status               TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
                         'new','contacted','information_requested','information_complete','available',
                         'sent_to_agency','interview','placed','rejected','not_interested')),
  source               TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','whatsapp','import')),
  preferred_language   TEXT NOT NULL DEFAULT 'en',
  consent_given        BOOLEAN NOT NULL DEFAULT false,
  consent_at           TIMESTAMPTZ,
  consent_source       TEXT,
  deletion_requested_at TIMESTAMPTZ,
  status_changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),   -- registration date
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX candidates_status_idx ON candidates(status);
CREATE INDEX candidates_created_idx ON candidates(created_at);

CREATE TABLE candidate_status_history (
  id           SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  from_status  TEXT,
  to_status    TEXT NOT NULL,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX csh_to_status_idx ON candidate_status_history(to_status, changed_at);

CREATE TABLE candidate_files (
  id            SERIAL PRIMARY KEY,
  candidate_id  INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'cv',
  original_name TEXT NOT NULL,
  stored_name   TEXT NOT NULL UNIQUE,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  source        TEXT NOT NULL DEFAULT 'upload' CHECK (source IN ('upload','whatsapp')),
  uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE conversations (
  id              SERIAL PRIMARY KEY,
  candidate_id    INTEGER NOT NULL UNIQUE REFERENCES candidates(id) ON DELETE CASCADE,
  mode            TEXT NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto','manual')),
  status          TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','waiting','completed','needs_attention','closed')),
  bot_step        TEXT,                -- current step of the registration flow
  bot_state       JSONB NOT NULL DEFAULT '{}',
  simulated       BOOLEAN NOT NULL DEFAULT false,   -- test conversations never reach Meta
  unread_count    INTEGER NOT NULL DEFAULT 0,
  last_inbound_at  TIMESTAMPTZ,
  last_outbound_at TIMESTAMPTZ,
  last_message_at  TIMESTAMPTZ,
  last_message_preview TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX conversations_last_msg_idx ON conversations(last_message_at DESC NULLS LAST);

CREATE TABLE messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL CHECK (direction IN ('in','out')),
  wa_message_id   TEXT UNIQUE,
  type            TEXT NOT NULL DEFAULT 'text',
  body            TEXT,
  template_name   TEXT,
  file_id         INTEGER REFERENCES candidate_files(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','queued','sent','delivered','read','failed','simulated')),
  error           TEXT,
  sender          TEXT NOT NULL DEFAULT 'candidate' CHECK (sender IN ('candidate','bot','user')),
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON messages(conversation_id, created_at);

CREATE TABLE submissions (
  id           SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  vacancy_id   INTEGER REFERENCES vacancies(id) ON DELETE SET NULL,
  agency_id    INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','sent','interview','placed','rejected','withdrawn')),
  match_score  INTEGER,
  notes        TEXT,
  interview_at TIMESTAMPTZ,
  approved_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sent_at      TIMESTAMPTZ,
  cv_file_id   INTEGER REFERENCES candidate_files(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, vacancy_id)
);

CREATE TABLE notifications (
  id         SERIAL PRIMARY KEY,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Technical log of webhook deliveries. Contains no message texts or tokens.
CREATE TABLE webhook_events (
  id         SERIAL PRIMARY KEY,
  kind       TEXT NOT NULL,
  ok         BOOLEAN NOT NULL,
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  INTEGER,
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
