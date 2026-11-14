-- YorpHives HQ isolated-preview ONLY (v1). Never apply to canonical D1.
-- This is a fresh monitoring-evidence schema, not the legacy live HQ schema.
-- It intentionally has no repair queue, AI execution, OTP, authorization grant,
-- publishing, payment, customer upload or credential storage tables.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS monitor_schema_versions (
  version INTEGER PRIMARY KEY CHECK (version = 1),
  purpose TEXT NOT NULL CHECK (purpose = 'monitor-only'),
  installed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS monitor_targets (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 3 AND 64),
  kind TEXT NOT NULL CHECK (kind IN ('website','headquarters','security','revenue','market')),
  label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 200),
  public_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS monitor_observation_runs (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 8 AND 128),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  collector TEXT NOT NULL CHECK (collector IN ('external-watchdog','first-party-analytics','manual-verified')),
  status TEXT NOT NULL CHECK (status IN ('running','completed','failed')),
  CHECK(finished_at IS NULL OR finished_at >= started_at)
);

CREATE TABLE IF NOT EXISTS monitor_observations (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 8 AND 128),
  run_id TEXT NOT NULL REFERENCES monitor_observation_runs(id) ON DELETE RESTRICT,
  target_id TEXT NOT NULL REFERENCES monitor_targets(id) ON DELETE RESTRICT,
  observed_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('verified','degraded','unavailable','unknown')),
  evidence_kind TEXT NOT NULL CHECK(evidence_kind IN
    ('http-status','browser-output','catalogue-consistency','manual-receipt','analytics-snapshot')),
  evidence_sha256 TEXT CHECK (evidence_sha256 IS NULL OR
    (length(evidence_sha256)=64 AND evidence_sha256 NOT GLOB '*[^0-9a-f]*')),
  note TEXT NOT NULL DEFAULT '' CHECK(length(note) <= 1000),
  UNIQUE (run_id,target_id,evidence_kind)
);

CREATE TABLE IF NOT EXISTS monitor_signals (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 8 AND 128),
  category TEXT NOT NULL CHECK(category IN
    ('reliability','security','revenue','product','market','technology')),
  state TEXT NOT NULL DEFAULT 'unreviewed' CHECK(state IN ('unreviewed','reviewing','dismissed','verified')),
  priority INTEGER NOT NULL CHECK(priority BETWEEN 1 AND 5),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 240),
  evidence_ref TEXT NOT NULL CHECK(length(evidence_ref) BETWEEN 4 AND 512),
  observed_at TEXT NOT NULL,
  founder_action TEXT NOT NULL DEFAULT '' CHECK(length(founder_action) <= 1200),
  -- No SQL table/column here grants execution, PR creation or release powers.
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_monitor_observations_time
  ON monitor_observations (target_id,observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitor_signals_priority
  ON monitor_signals (state,priority DESC,observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitor_runs_time
  ON monitor_observation_runs (started_at DESC);

INSERT OR IGNORE INTO monitor_schema_versions(version,purpose)
VALUES (1,'monitor-only');
