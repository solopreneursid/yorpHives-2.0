PRAGMA foreign_keys = ON;


-- Independent CI evidence is recorded by the private repair Worker only after
-- GitHub has verified the exact branch/commit and all required QA workflows.
CREATE TABLE IF NOT EXISTS admin_repair_ci_verifications (
  job_id TEXT PRIMARY KEY REFERENCES admin_repair_jobs(id) ON DELETE CASCADE,
  commit_sha TEXT NOT NULL CHECK(length(commit_sha) = 40),
  checks_json TEXT NOT NULL CHECK(length(checks_json) BETWEEN 2 AND 8000),
  verified_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_repair_ci_verified_at
ON admin_repair_ci_verifications(verified_at DESC);

-- Evidence of issue-specific QA, explicitly separate from CI and production release.
-- Each QA report is pinned to a specific GitHub pull-request HEAD commit.
-- Historical reports are retained if a repair branch moves to a later revision.
CREATE TABLE IF NOT EXISTS admin_repair_qa_reports (
  job_id TEXT NOT NULL REFERENCES admin_repair_jobs(id) ON DELETE CASCADE,
  commit_sha TEXT NOT NULL CHECK(length(commit_sha) = 40),
  pr_number INTEGER NOT NULL CHECK(pr_number > 0),
  reproduction_status TEXT NOT NULL CHECK(reproduction_status IN ('reproduced', 'not_reproduced')),
  fix_status TEXT NOT NULL CHECK(fix_status IN ('passed', 'failed', 'inconclusive')),
  regression_status TEXT NOT NULL CHECK(regression_status IN ('passed', 'failed', 'not_run')),
  evidence TEXT NOT NULL CHECK(length(evidence) BETWEEN 30 AND 3000),
  reviewed_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (job_id, commit_sha)
);

CREATE INDEX IF NOT EXISTS idx_admin_repair_qa_job_updated
ON admin_repair_qa_reports(job_id, updated_at DESC);
