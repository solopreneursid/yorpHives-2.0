PRAGMA foreign_keys=ON;

-- Every research run has a bounded, inspectable source and AI usage budget.
CREATE TABLE IF NOT EXISTS hq_intelligence_runs (
 run_id TEXT PRIMARY KEY,
 trigger_source TEXT NOT NULL CHECK(trigger_source IN ('owner','scheduled')),
 run_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued'
  CHECK(status IN ('queued','collecting','synthesizing','completed','partial','failed')),
 source_count INTEGER NOT NULL DEFAULT 0 CHECK(source_count>=0),
 idea_count INTEGER NOT NULL DEFAULT 0 CHECK(idea_count>=0),
 model_calls INTEGER NOT NULL DEFAULT 0 CHECK(model_calls BETWEEN 0 AND 1),
 error_summary TEXT,
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 completed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hq_intelligence_scheduled_day ON hq_intelligence_runs(trigger_source,run_date)
 WHERE trigger_source='scheduled';
CREATE INDEX IF NOT EXISTS idx_hq_intelligence_runs_date ON hq_intelligence_runs(created_at DESC);

-- External sources are public, individually addressable references; title/excerpt
-- are untrusted claims, not validated market demand or accurate geography.
CREATE TABLE IF NOT EXISTS hq_intelligence_sources (
 source_id TEXT PRIMARY KEY,
 provider TEXT NOT NULL CHECK(provider IN ('hn_ask','hn_show','github_repo')),
 external_id TEXT NOT NULL,
 title TEXT NOT NULL,
 excerpt TEXT NOT NULL,
 source_url TEXT NOT NULL,
 external_url TEXT,
 published_at TEXT,
 first_seen_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 last_seen_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 popularity_count INTEGER NOT NULL DEFAULT 0 CHECK(popularity_count>=0),
 provenance_status TEXT NOT NULL DEFAULT 'unverified_public_source'
  CHECK(provenance_status='unverified_public_source'),
 UNIQUE(provider,external_id)
);
CREATE INDEX IF NOT EXISTS idx_hq_intelligence_sources_recent ON hq_intelligence_sources(last_seen_at DESC);

-- AI output is a *hypothesis*, never evidence. These fields are research
-- questions and MVP proposals; monetization is explicitly unvalidated.
CREATE TABLE IF NOT EXISTS hq_intelligence_ideas (
 idea_id TEXT PRIMARY KEY,
 fingerprint TEXT NOT NULL UNIQUE,
 run_id TEXT NOT NULL REFERENCES hq_intelligence_runs(run_id),
 title TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('tool','app','platform','plugin','service','direction')),
 audience TEXT NOT NULL,
 problem TEXT NOT NULL,
 solution TEXT NOT NULL,
 why_now TEXT NOT NULL,
 mvp TEXT NOT NULL,
 differentiation TEXT NOT NULL,
 validation_plan TEXT NOT NULL,
 monetization_hypothesis TEXT NOT NULL,
 risks TEXT NOT NULL,
 distribution_hypothesis TEXT NOT NULL,
 priority_score INTEGER NOT NULL CHECK(priority_score BETWEEN 0 AND 100),
 source_count INTEGER NOT NULL CHECK(source_count BETWEEN 1 AND 3),
 region_scope TEXT NOT NULL DEFAULT 'unverified',
 evidence_level TEXT NOT NULL DEFAULT 'unvalidated_hypothesis'
  CHECK(evidence_level='unvalidated_hypothesis'),
 status TEXT NOT NULL DEFAULT 'proposed'
  CHECK(status IN ('proposed','shortlisted','dismissed','promoted')),
 linked_job_id TEXT REFERENCES agent_jobs(job_id) ON DELETE SET NULL,
 owner_note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 last_seen_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_hq_intelligence_ideas_ranked ON hq_intelligence_ideas(status,priority_score DESC,created_at DESC);

CREATE TABLE IF NOT EXISTS hq_intelligence_evidence (
 idea_id TEXT NOT NULL REFERENCES hq_intelligence_ideas(idea_id) ON DELETE CASCADE,
 source_id TEXT NOT NULL REFERENCES hq_intelligence_sources(source_id) ON DELETE RESTRICT,
 relationship TEXT NOT NULL DEFAULT 'inspiration_not_validation',
 PRIMARY KEY(idea_id,source_id)
);

CREATE TABLE IF NOT EXISTS hq_intelligence_events (
 event_id TEXT PRIMARY KEY,
 idea_id TEXT NOT NULL REFERENCES hq_intelligence_ideas(idea_id) ON DELETE CASCADE,
 actor TEXT NOT NULL,
 action TEXT NOT NULL,
 details_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(details_json)),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_hq_intelligence_events_created ON hq_intelligence_events(created_at DESC);

-- A single planned mission per idea, with no automatic model dispatch.
CREATE TRIGGER IF NOT EXISTS hq_intelligence_mission_promoted
AFTER INSERT ON agent_jobs
WHEN NEW.origin_type='research_idea' AND NEW.origin_ref IS NOT NULL
BEGIN
 UPDATE hq_intelligence_ideas
 SET status='promoted',linked_job_id=NEW.job_id,
     updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE idea_id=NEW.origin_ref AND status IN ('proposed','shortlisted');
 INSERT INTO hq_intelligence_events(event_id,idea_id,actor,action,details_json)
 VALUES(lower(hex(randomblob(16))),NEW.origin_ref,NEW.created_by,'idea_promoted',
   json_object('job_id',NEW.job_id,'autonomous_execution',0,'evidence_validated',0));
END;

CREATE TRIGGER IF NOT EXISTS hq_intelligence_idea_triaged
AFTER UPDATE OF status ON hq_intelligence_ideas
WHEN NEW.status!=OLD.status AND NEW.status IN ('shortlisted','dismissed','proposed')
BEGIN
 INSERT INTO hq_intelligence_events(event_id,idea_id,actor,action,details_json)
 VALUES(lower(hex(randomblob(16))),NEW.idea_id,'owner','idea_'||NEW.status,
   json_object('from',OLD.status,'to',NEW.status,'verified',0));
END;
