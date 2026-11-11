PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admin_assets (
  id TEXT PRIMARY KEY,
  asset_key TEXT NOT NULL UNIQUE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('website_page','free_tool','product','api','discovery')),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  source TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  last_status TEXT,
  last_http_status INTEGER,
  last_checked_at TEXT,
  last_changed_at TEXT,
  last_content_hash TEXT,
  last_duration_ms INTEGER,
  last_title TEXT,
  last_description TEXT,
  last_canonical TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_assets_type_active ON admin_assets(asset_type, active);

CREATE TABLE IF NOT EXISTS admin_asset_checks (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES admin_assets(id) ON DELETE CASCADE,
  checked_at TEXT NOT NULL,
  status TEXT NOT NULL,
  http_status INTEGER,
  duration_ms INTEGER NOT NULL,
  content_hash TEXT,
  page_title TEXT,
  meta_description TEXT,
  canonical_url TEXT,
  details_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_admin_asset_checks_asset_date ON admin_asset_checks(asset_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS admin_asset_findings (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES admin_assets(id) ON DELETE CASCADE,
  finding_key TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low','info')),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','awaiting_approval','fixed','accepted_risk')),
  first_detected TEXT NOT NULL,
  last_verified TEXT NOT NULL,
  resolved_at TEXT,
  UNIQUE(asset_id, finding_key)
);
CREATE INDEX IF NOT EXISTS idx_admin_asset_findings_status ON admin_asset_findings(status, severity, last_verified DESC);

CREATE TABLE IF NOT EXISTS admin_dependency_observations (
  id TEXT PRIMARY KEY,
  dependency_key TEXT NOT NULL UNIQUE,
  package_name TEXT NOT NULL,
  current_version TEXT NOT NULL,
  latest_version TEXT,
  deprecated_message TEXT,
  source_url TEXT NOT NULL,
  status TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_admin_dependency_status ON admin_dependency_observations(status, checked_at DESC);
