-- Founder-issued, single-use action-bound email codes (no plaintext PINs).
-- Production rights are never granted by this migration.
CREATE TABLE IF NOT EXISTS founder_otp_challenges (
  challenge_id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'assistant_grant' CHECK(kind='assistant_grant'),
  assistant_selection TEXT NOT NULL CHECK(assistant_selection IN ('yorpmind','chatgpt','both')),
  scope TEXT NOT NULL CHECK(scope IN ('website','headquarters','both')),
  permission TEXT NOT NULL CHECK(permission IN ('review_findings','prepare_fixes','manage_staging')),
  duration_minutes INTEGER NOT NULL CHECK(duration_minutes IN (15,30,60)),
  purpose TEXT NOT NULL,
  code_hmac TEXT NOT NULL CHECK(length(code_hmac)=64),
  state TEXT NOT NULL CHECK(state IN ('issuing','sent','used','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  sent_at TEXT,
  consumed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_founder_otp_owner_rate ON founder_otp_challenges(owner_email,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_founder_otp_expiry ON founder_otp_challenges(state,expires_at);
-- The selection and exact requested action cannot change after issue.
CREATE TRIGGER IF NOT EXISTS founder_otp_immutable_request
BEFORE UPDATE ON founder_otp_challenges
WHEN NEW.challenge_id!=OLD.challenge_id OR NEW.owner_email!=OLD.owner_email
 OR NEW.kind!=OLD.kind OR NEW.assistant_selection!=OLD.assistant_selection
 OR NEW.scope!=OLD.scope OR NEW.permission!=OLD.permission
 OR NEW.duration_minutes!=OLD.duration_minutes OR NEW.purpose!=OLD.purpose
 OR NEW.code_hmac!=OLD.code_hmac OR NEW.created_at!=OLD.created_at
 OR NEW.expires_at!=OLD.expires_at
BEGIN SELECT RAISE(ABORT,'OTP approval target is immutable'); END;
