PRAGMA foreign_keys=ON;
-- Durable category hypotheses and *observed* source links. These do not
-- indicate search volume, traffic, revenue, adoption or proven agent demand.
CREATE TABLE IF NOT EXISTS hq_demand_categories (
 category_key TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 summary TEXT NOT NULL,
 scale TEXT NOT NULL CHECK(length(scale) BETWEEN 2 AND 48),
 origin TEXT NOT NULL DEFAULT 'reference' CHECK(origin IN ('reference','hypothesis')),
 origin_idea_id TEXT UNIQUE REFERENCES hq_intelligence_ideas(idea_id) ON DELETE SET NULL,
 user_job TEXT NOT NULL,
 agent_job TEXT NOT NULL,
 monetization_model TEXT NOT NULL,
 implementation_risk TEXT NOT NULL CHECK(implementation_risk IN ('unknown','low','medium','high')),
 research_status TEXT NOT NULL DEFAULT 'watching'
   CHECK(research_status IN ('watching','investigating','shortlisted','dismissed')),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 modified_by TEXT NOT NULL DEFAULT 'headquarters-source-index',
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS hq_demand_evidence (
 category_key TEXT NOT NULL REFERENCES hq_demand_categories(category_key) ON DELETE CASCADE,
 source_id TEXT NOT NULL REFERENCES hq_intelligence_sources(source_id) ON DELETE CASCADE,
 evidence_kind TEXT NOT NULL CHECK(evidence_kind IN ('public_question','public_showcase','open_source_example')),
 matched_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(category_key,source_id)
);
CREATE INDEX IF NOT EXISTS idx_hq_demand_evidence_source ON hq_demand_evidence(source_id);
CREATE TABLE IF NOT EXISTS hq_demand_refresh_runs (
 refresh_id TEXT PRIMARY KEY,
 trigger_source TEXT NOT NULL CHECK(trigger_source IN ('owner','research_workflow')),
 source_count INTEGER NOT NULL CHECK(source_count>=0),
 observed_matches INTEGER NOT NULL CHECK(observed_matches>=0),
 added_links INTEGER NOT NULL CHECK(added_links>=0),
 generated_candidates INTEGER NOT NULL DEFAULT 0 CHECK(generated_candidates>=0),
 research_run_id TEXT UNIQUE REFERENCES hq_intelligence_runs(run_id),
 completed_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS hq_demand_events (
 event_id TEXT PRIMARY KEY,
 category_key TEXT NOT NULL REFERENCES hq_demand_categories(category_key) ON DELETE CASCADE,
 actor TEXT NOT NULL,
 action TEXT NOT NULL,
 metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TRIGGER IF NOT EXISTS hq_demand_status_event
AFTER UPDATE OF research_status ON hq_demand_categories
WHEN NEW.research_status!=OLD.research_status
BEGIN
 INSERT INTO hq_demand_events(event_id,category_key,actor,action,metadata_json)
 VALUES(lower(hex(randomblob(16))),NEW.category_key,NEW.modified_by,
  'category_'||NEW.research_status,json_object('from',OLD.research_status,'to',NEW.research_status,
    'verified_demand',0,'production_authorized',0));
END;

-- Unmatched public signals are retained rather than rejected by a fixed
-- taxonomy. They can represent unfamiliar technologies or new industries.
CREATE TABLE IF NOT EXISTS hq_demand_unclassified_sources (
 source_id TEXT PRIMARY KEY REFERENCES hq_intelligence_sources(source_id) ON DELETE CASCADE,
 first_detected_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 last_detected_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 review_state TEXT NOT NULL DEFAULT 'needs_classification'
   CHECK(review_state IN ('needs_classification','reviewed')),
 review_note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_hq_demand_category_origin ON hq_demand_categories(origin,research_status);
