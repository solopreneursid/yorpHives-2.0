PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admin_monitors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  environment TEXT NOT NULL CHECK (environment IN ('production', 'preview')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS admin_runs (
  id TEXT PRIMARY KEY,
  trigger_source TEXT NOT NULL CHECK (trigger_source IN ('manual', 'scheduled')),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  monitor_count INTEGER NOT NULL DEFAULT 0,
  passed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS admin_checks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES admin_runs(id) ON DELETE CASCADE,
  monitor_id TEXT NOT NULL REFERENCES admin_monitors(id) ON DELETE CASCADE,
  ok INTEGER NOT NULL CHECK (ok IN (0, 1)),
  status_code INTEGER,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  checked_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_findings (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  monitor_id TEXT REFERENCES admin_monitors(id) ON DELETE SET NULL,
  run_id TEXT REFERENCES admin_runs(id) ON DELETE SET NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'awaiting_approval', 'fixed', 'verified', 'accepted_risk')),
  first_detected TEXT NOT NULL,
  last_verified TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_checks_run ON admin_checks(run_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_checks_monitor ON admin_checks(monitor_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_findings_status ON admin_findings(status, severity, last_verified DESC);
CREATE INDEX IF NOT EXISTS idx_admin_runs_started ON admin_runs(started_at DESC);

INSERT OR IGNORE INTO admin_monitors (id, name, url, environment)
VALUES
  ('prod-home', 'Production homepage', 'https://yorphives.com/', 'production'),
  ('prod-tools', 'Production Free Tools', 'https://yorphives.com/free-tools/', 'production'),
  ('prod-discovery', 'Production discovery API', 'https://yorphives.com/api/v1/free-tools', 'production'),
  ('prod-llms', 'Production agent discovery', 'https://yorphives.com/llms.txt', 'production'),
  ('preview-home', 'Preview homepage', 'https://yorphives-2-preview.pages.dev/', 'preview');
