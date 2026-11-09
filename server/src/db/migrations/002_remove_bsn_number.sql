-- Decision: only store whether a candidate has a valid BSN (has_bsn yes/no), never the number itself.
ALTER TABLE candidates DROP COLUMN IF EXISTS bsn_encrypted;
