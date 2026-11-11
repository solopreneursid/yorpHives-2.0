PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admin_repair_jobs (
  id TEXT PRIMARY KEY,
  finding_id TEXT,
  requested_by TEXT NOT NULL,
  request_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','dispatched','running','needs_review','completed','failed','cancelled')),
  agent_name TEXT,
  branch_name TEXT,
  pull_request_url TEXT,
  result_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  dispatched_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (finding_id) REFERENCES admin_findings(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_repair_jobs_status ON admin_repair_jobs(status, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_audit_events (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_events_created ON admin_audit_events(created_at DESC);
