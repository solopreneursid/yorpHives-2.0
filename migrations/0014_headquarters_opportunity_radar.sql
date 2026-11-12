PRAGMA foreign_keys = ON;

-- Signals are facts observed by the private monitoring system, not invented
-- market demand, AI research, or independently verified external evidence.
CREATE TABLE IF NOT EXISTS hq_opportunity_signals (
  signal_id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('monitor_finding','asset_finding')),
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  source_url TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low','info')),
  category TEXT NOT NULL CHECK (category IN ('reliability','security','discoverability','product_quality')),
  suggested_agent_id TEXT NOT NULL REFERENCES agent_registry(agent_id),
  source_status TEXT NOT NULL,
  first_observed TEXT NOT NULL,
  last_observed TEXT NOT NULL,
  triage_status TEXT NOT NULL DEFAULT 'new' CHECK (triage_status IN ('new','investigating','promoted','dismissed')),
  linked_job_id TEXT REFERENCES agent_jobs(job_id) ON DELETE SET NULL,
  modified_by TEXT NOT NULL DEFAULT 'headquarters-radar',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(source_kind,source_id)
);

CREATE TABLE IF NOT EXISTS hq_signal_events (
  event_id TEXT PRIMARY KEY,
  signal_id TEXT NOT NULL REFERENCES hq_opportunity_signals(signal_id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS hq_radar_runs (
  run_id TEXT PRIMARY KEY,
  trigger_source TEXT NOT NULL CHECK (trigger_source IN ('owner','scheduled')),
  status TEXT NOT NULL CHECK (status IN ('complete','failed')),
  observed_count INTEGER NOT NULL CHECK (observed_count >= 0),
  inserted_count INTEGER NOT NULL CHECK (inserted_count >= 0),
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_hq_signals_triage ON hq_opportunity_signals(triage_status,severity,last_observed DESC);
CREATE INDEX IF NOT EXISTS idx_hq_signals_source ON hq_opportunity_signals(source_kind,source_id);
CREATE INDEX IF NOT EXISTS idx_hq_signal_events_created ON hq_signal_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hq_radar_runs_created ON hq_radar_runs(recorded_at DESC);
-- One source can create at most one mission, even under concurrent owners or retries.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hq_jobs_origin_signal
  ON agent_jobs(origin_type,origin_ref)
  WHERE origin_type='opportunity_signal' AND origin_ref IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS hq_signal_observed
AFTER INSERT ON hq_opportunity_signals
BEGIN
  INSERT INTO hq_signal_events(event_id,signal_id,actor_id,event_type,details_json)
  VALUES(lower(hex(randomblob(16))),NEW.signal_id,'headquarters-radar','signal_observed',
    json_object('severity',NEW.severity,'category',NEW.category,'source',NEW.source_kind,'source_status',NEW.source_status));
END;

CREATE TRIGGER IF NOT EXISTS hq_signal_triaged
AFTER UPDATE OF triage_status ON hq_opportunity_signals
WHEN NEW.triage_status != OLD.triage_status
BEGIN
  INSERT INTO hq_signal_events(event_id,signal_id,actor_id,event_type,details_json)
  VALUES(lower(hex(randomblob(16))),NEW.signal_id,NEW.modified_by,'signal_'||NEW.triage_status,
    json_object('from',OLD.triage_status,'to',NEW.triage_status,'linked_mission',NEW.linked_job_id));
END;

-- Mission promotion and signal transition happen inside the same SQLite write.
-- Promotion only creates a planned mission; no inference, publishing or spending.
CREATE TRIGGER IF NOT EXISTS hq_signal_mission_promoted
AFTER INSERT ON agent_jobs
WHEN NEW.origin_type='opportunity_signal' AND NEW.origin_ref IS NOT NULL
BEGIN
  UPDATE hq_opportunity_signals
     SET triage_status='promoted',linked_job_id=NEW.job_id,
         modified_by=NEW.created_by,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
   WHERE signal_id=NEW.origin_ref AND triage_status IN ('new','investigating');
END;
