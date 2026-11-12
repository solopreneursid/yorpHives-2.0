PRAGMA foreign_keys=ON;

-- A founder-approved operation is narrowly scoped to an immutable release
-- candidate. A Cloudflare Access MFA session never becomes an agent password.
-- No production executor is connected by this migration.
CREATE TABLE IF NOT EXISTS yorpmind_owner_delegations (
  delegation_id TEXT PRIMARY KEY,
  repair_job_id TEXT NOT NULL REFERENCES admin_repair_jobs(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK(action='deploy_verified_release'),
  target_environment TEXT NOT NULL CHECK(target_environment='production'),
  commit_sha TEXT NOT NULL CHECK(length(commit_sha)=40),
  pull_request_number INTEGER NOT NULL CHECK(pull_request_number>0),
  preview_url TEXT NOT NULL CHECK(length(preview_url) BETWEEN 20 AND 240),
  reviewed_preview_by TEXT NOT NULL,
  reviewed_preview_at TEXT NOT NULL,
  owner_checklist_json TEXT NOT NULL CHECK(json_valid(owner_checklist_json)),
  owner_note TEXT NOT NULL CHECK(length(owner_note) BETWEEN 40 AND 1200),
  state TEXT NOT NULL DEFAULT 'awaiting_mfa'
    CHECK(state IN ('awaiting_mfa','authorized','consumed','revoked')),
  requested_at TEXT NOT NULL,
  request_expires_at TEXT NOT NULL,
  authorized_by TEXT,
  authorized_at TEXT,
  authorization_expires_at TEXT,
  consumed_at TEXT,
  revoked_at TEXT,
  CHECK((state='awaiting_mfa' AND authorized_at IS NULL AND authorized_by IS NULL)
     OR (state!='awaiting_mfa' AND authorized_at IS NOT NULL AND authorized_by IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_yorpmind_delegation_one_per_revision
ON yorpmind_owner_delegations(repair_job_id,commit_sha,action);
CREATE INDEX IF NOT EXISTS idx_yorpmind_delegation_recent
ON yorpmind_owner_delegations(requested_at DESC);

-- Prevent editing the reviewed target after step-up approval.
CREATE TRIGGER IF NOT EXISTS yorpmind_delegation_immutable_target
BEFORE UPDATE ON yorpmind_owner_delegations
WHEN NEW.repair_job_id!=OLD.repair_job_id
  OR NEW.action!=OLD.action OR NEW.target_environment!=OLD.target_environment
  OR NEW.commit_sha!=OLD.commit_sha
  OR NEW.pull_request_number!=OLD.pull_request_number
  OR NEW.preview_url!=OLD.preview_url
  OR NEW.reviewed_preview_by!=OLD.reviewed_preview_by
  OR NEW.reviewed_preview_at!=OLD.reviewed_preview_at
  OR NEW.owner_checklist_json!=OLD.owner_checklist_json
  OR NEW.owner_note!=OLD.owner_note
  OR NEW.requested_at!=OLD.requested_at
  OR NEW.request_expires_at!=OLD.request_expires_at
BEGIN
 SELECT RAISE(ABORT,'Cannot change an owner-reviewed release candidate');
END;
