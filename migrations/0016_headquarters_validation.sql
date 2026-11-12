PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS hq_validation_experiments (
 experiment_id TEXT PRIMARY KEY,
 idea_id TEXT NOT NULL REFERENCES hq_intelligence_ideas(idea_id) ON DELETE CASCADE,
 created_by TEXT NOT NULL,
 question TEXT NOT NULL CHECK(length(question) BETWEEN 12 AND 350),
 method TEXT NOT NULL CHECK(method IN ('user_interview','landing_page','prototype','usability_test','pricing_test','competitor_audit','other')),
 success_metric TEXT NOT NULL CHECK(success_metric IN ('responses','interviews','signups','completions','qualified_leads','repeat_users','observations')),
 target_count INTEGER NOT NULL CHECK(target_count BETWEEN 1 AND 10000),
 timebox_days INTEGER NOT NULL CHECK(timebox_days BETWEEN 1 AND 90),
 status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','active','completed','cancelled')),
 observed_count INTEGER CHECK(observed_count BETWEEN 0 AND 1000000),
 result_note TEXT NOT NULL DEFAULT '' CHECK(length(result_note)<=1800),
 evidence_url TEXT CHECK(evidence_url IS NULL OR (length(evidence_url)<=900 AND evidence_url LIKE 'https://%')),
 outcome TEXT NOT NULL DEFAULT 'not_measured'
   CHECK(outcome IN ('not_measured','target_met_owner_reported','target_not_met_owner_reported')),
 evidence_status TEXT NOT NULL DEFAULT 'unverified_owner_report'
   CHECK(evidence_status='unverified_owner_report'),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_hq_validation_ideas ON hq_validation_experiments(idea_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hq_validation_status ON hq_validation_experiments(status,created_at DESC);
CREATE TABLE IF NOT EXISTS hq_validation_events (
 event_id TEXT PRIMARY KEY,
 experiment_id TEXT NOT NULL REFERENCES hq_validation_experiments(experiment_id) ON DELETE CASCADE,
 actor TEXT NOT NULL,
 action TEXT NOT NULL,
 details_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(details_json)),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_hq_validation_events_created ON hq_validation_events(created_at DESC);
CREATE TRIGGER IF NOT EXISTS hq_validation_experiment_created
AFTER INSERT ON hq_validation_experiments
BEGIN
 INSERT INTO hq_validation_events(event_id,experiment_id,actor,action,details_json)
 VALUES(lower(hex(randomblob(16))),NEW.experiment_id,NEW.created_by,'experiment_planned',
  json_object('metric',NEW.success_metric,'target_count',NEW.target_count,'timebox_days',NEW.timebox_days));
END;
CREATE TRIGGER IF NOT EXISTS hq_validation_experiment_transition
AFTER UPDATE OF status ON hq_validation_experiments
WHEN NEW.status!=OLD.status
BEGIN
 INSERT INTO hq_validation_events(event_id,experiment_id,actor,action,details_json)
 VALUES(lower(hex(randomblob(16))),NEW.experiment_id,NEW.created_by,'experiment_'||NEW.status,
  json_object('from',OLD.status,'to',NEW.status,
   'observed',NEW.observed_count,'target',NEW.target_count,'outcome',NEW.outcome,
   'source_owner_reported',1,'independently_verified',0));
END;
