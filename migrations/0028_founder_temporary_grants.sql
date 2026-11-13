PRAGMA foreign_keys=ON;

-- The founder remains the sole human owner. These are short-lived,
-- identity-bound grants for bounded staging actions, not account credentials.
-- This migration does not enable any production deployment executor.
CREATE TABLE IF NOT EXISTS founder_temporary_grants (
  grant_id TEXT PRIMARY KEY,
  assistant TEXT NOT NULL CHECK(assistant IN ('yorpmind','chatgpt')),
  scope TEXT NOT NULL CHECK(scope IN ('website','headquarters','both')),
  permission TEXT NOT NULL CHECK(permission IN (
    'review_findings','prepare_fixes','manage_staging'
  )),
  duration_minutes INTEGER NOT NULL CHECK(duration_minutes IN (15,30,60)),
  max_actions INTEGER NOT NULL DEFAULT 3 CHECK(max_actions BETWEEN 1 AND 3),
  used_actions INTEGER NOT NULL DEFAULT 0 CHECK(used_actions BETWEEN 0 AND max_actions),
  purpose TEXT NOT NULL CHECK(length(purpose) BETWEEN 40 AND 700),
  owner_email TEXT NOT NULL CHECK(length(owner_email) BETWEEN 3 AND 200),
  state TEXT NOT NULL DEFAULT 'awaiting_mfa'
    CHECK(state IN ('awaiting_mfa','active','revoked','expired')),
  created_at TEXT NOT NULL,
  request_expires_at TEXT NOT NULL,
  activated_at TEXT,
  activated_by TEXT,
  active_expires_at TEXT,
  revoked_at TEXT,
  revoked_by TEXT,
  CHECK (
    (state='awaiting_mfa' AND activated_at IS NULL AND activated_by IS NULL AND active_expires_at IS NULL)
    OR (state IN ('active','revoked','expired') AND activated_at IS NOT NULL AND
        activated_by IS NOT NULL AND active_expires_at IS NOT NULL)
    OR (state='revoked' AND activated_at IS NULL AND activated_by IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_founder_grants_active
ON founder_temporary_grants(assistant,state,active_expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_founder_grants_recent
ON founder_temporary_grants(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_founder_grants_one_active
ON founder_temporary_grants(assistant) WHERE state='active';

-- A grant's assistant, scope, permissions and limits can never be broadened
-- after the owner has requested it. A new permission requires a new review.
CREATE TRIGGER IF NOT EXISTS founder_grants_immutable_scope
BEFORE UPDATE ON founder_temporary_grants
WHEN NEW.grant_id!=OLD.grant_id OR NEW.assistant!=OLD.assistant
  OR NEW.scope!=OLD.scope OR NEW.permission!=OLD.permission
  OR NEW.duration_minutes!=OLD.duration_minutes OR NEW.max_actions!=OLD.max_actions
  OR NEW.purpose!=OLD.purpose OR NEW.owner_email!=OLD.owner_email
  OR NEW.created_at!=OLD.created_at OR NEW.request_expires_at!=OLD.request_expires_at
  OR NEW.activated_at!=OLD.activated_at
  OR NEW.activated_by!=OLD.activated_by
  OR NEW.active_expires_at!=OLD.active_expires_at
BEGIN SELECT RAISE(ABORT,'Temporary permission target is immutable'); END;

CREATE TABLE IF NOT EXISTS founder_grant_actions (
  action_id TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES founder_temporary_grants(grant_id) ON DELETE RESTRICT,
  request_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('create_issue')),
  target_scope TEXT NOT NULL CHECK(target_scope IN ('website','headquarters')),
  state TEXT NOT NULL CHECK(state IN ('reserved','completed','failed')),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  result_reference TEXT,
  UNIQUE(grant_id,request_id)
);
CREATE INDEX IF NOT EXISTS idx_founder_grant_actions_recent
ON founder_grant_actions(grant_id,created_at DESC);

-- The grant does not alter Cloudflare Access policies, production deployment,
-- admin credentials or the existing exact-release step-up approval system.
