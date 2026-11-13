-- Dedicated, founder-only single-use OTP receipts. Never deploys production.
-- The old assistant-grant OTP table is not reused.
CREATE TABLE IF NOT EXISTS hq_go_live_challenges (
 challenge_id TEXT PRIMARY KEY,
 owner_email TEXT NOT NULL,
 target TEXT NOT NULL CHECK(target IN ('website','headquarters')),
 commit_sha TEXT NOT NULL CHECK(length(commit_sha)=40),
 preview_deployment_id TEXT NOT NULL,
 preview_url TEXT NOT NULL,
 pr_number INTEGER NOT NULL CHECK(pr_number>0),
 code_hmac TEXT NOT NULL CHECK(length(code_hmac)=64),
 state TEXT NOT NULL CHECK(state IN ('issuing','sent','verified','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 sent_at TEXT,
 consumed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hq_go_live_pending ON
 hq_go_live_challenges(owner_email,target)
 WHERE state IN ('issuing','sent');
CREATE INDEX IF NOT EXISTS idx_hq_go_live_rate ON
 hq_go_live_challenges(owner_email,created_at DESC);
CREATE TRIGGER IF NOT EXISTS hq_go_live_immutable_binding
BEFORE UPDATE ON hq_go_live_challenges
WHEN NEW.challenge_id!=OLD.challenge_id OR NEW.owner_email!=OLD.owner_email
 OR NEW.target!=OLD.target OR NEW.commit_sha!=OLD.commit_sha
 OR NEW.preview_deployment_id!=OLD.preview_deployment_id
 OR NEW.preview_url!=OLD.preview_url OR NEW.pr_number!=OLD.pr_number
 OR NEW.code_hmac!=OLD.code_hmac OR NEW.created_at!=OLD.created_at
 OR NEW.expires_at!=OLD.expires_at
BEGIN SELECT RAISE(ABORT,'Go Live OTP candidate binding is immutable'); END;
