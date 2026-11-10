-- Messages the recruiter sends in bulk: vacancy offers and "are you still looking for work?" check-ins.
CREATE TABLE outreach (
  id           SERIAL PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('vacancy','checkin')),
  vacancy_id   INTEGER REFERENCES vacancies(id) ON DELETE SET NULL,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  method       TEXT,                    -- 'text' or 'template'
  status       TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','interested','declined')),
  error        TEXT,
  answered_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX outreach_candidate_idx ON outreach(candidate_id, kind, created_at DESC);
CREATE INDEX outreach_vacancy_idx ON outreach(vacancy_id);
