PRAGMA foreign_keys = ON;

-- Preserve the legacy admin_repair_jobs.finding_id FK to admin_findings.
-- A separate, source-qualified association supports both monitor and asset
-- findings without dropping or rewriting existing repair records.
CREATE TABLE IF NOT EXISTS admin_repair_finding_links (
  job_id TEXT PRIMARY KEY REFERENCES admin_repair_jobs(id) ON DELETE CASCADE,
  finding_source TEXT NOT NULL CHECK (finding_source IN ('monitor', 'asset')),
  finding_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_admin_repair_finding_links_source
ON admin_repair_finding_links(finding_source, finding_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS admin_repair_link_validate_monitor
BEFORE INSERT ON admin_repair_finding_links
WHEN NEW.finding_source = 'monitor'
  AND NOT EXISTS (SELECT 1 FROM admin_findings WHERE id = NEW.finding_id)
BEGIN
  SELECT RAISE(ABORT, 'Referenced monitor finding does not exist');
END;

CREATE TRIGGER IF NOT EXISTS admin_repair_link_validate_asset
BEFORE INSERT ON admin_repair_finding_links
WHEN NEW.finding_source = 'asset'
  AND NOT EXISTS (SELECT 1 FROM admin_asset_findings WHERE id = NEW.finding_id)
BEGIN
  SELECT RAISE(ABORT, 'Referenced asset finding does not exist');
END;

-- Reconcile existing monitor-linked repairs without changing their original FK.
INSERT OR IGNORE INTO admin_repair_finding_links(job_id, finding_source, finding_id)
SELECT id, 'monitor', finding_id FROM admin_repair_jobs WHERE finding_id IS NOT NULL;
