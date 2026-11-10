-- Two-factor authentication, account lockout and session revocation.
ALTER TABLE users
  ADD COLUMN totp_secret_encrypted TEXT,
  ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN failed_logins INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN locked_until TIMESTAMPTZ;
