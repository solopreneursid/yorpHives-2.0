-- YorpMind OS v2: stage-only analyst agents / shared evidence memory.
-- APPLY ONLY TO isolated preview D1 or independent local SQLite, NEVER the
-- canonical 60-table production D1. No functions can repair, release, pay
-- or grant authority. All "agent" records are analysis-only workforce roles.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS yorpmind_os_schema_versions (
  version INTEGER PRIMARY KEY CHECK(version=2),
  purpose TEXT NOT NULL CHECK(purpose='read-only-agent-analysis'),
  installed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS yorpmind_agent_roster (
  agent_id TEXT PRIMARY KEY CHECK(length(agent_id) BETWEEN 8 AND 80),
  department TEXT NOT NULL CHECK(department IN (
    'engineering','security','market','growth','revenue','evolution')),
  agent_role TEXT NOT NULL CHECK(length(agent_role) BETWEEN 8 AND 150),
  model_policy TEXT NOT NULL DEFAULT 'local_only'
    CHECK(model_policy='local_only'),
  autonomy TEXT NOT NULL DEFAULT 'observe_recommend'
    CHECK(autonomy='observe_recommend'),
  status TEXT NOT NULL DEFAULT 'configured'
    CHECK(status IN ('configured','paused')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS yorpmind_analysis_runs (
  run_id TEXT PRIMARY KEY CHECK(length(run_id) BETWEEN 8 AND 128),
  agent_id TEXT NOT NULL REFERENCES yorpmind_agent_roster(agent_id)
    ON DELETE RESTRICT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL CHECK(status IN ('running','completed','failed','insufficient_evidence')),
  model_calls INTEGER NOT NULL DEFAULT 0 CHECK(model_calls BETWEEN 0 AND 2),
  evidence_count INTEGER NOT NULL DEFAULT 0 CHECK(evidence_count BETWEEN 0 AND 15),
  model_backend TEXT NOT NULL CHECK(model_backend IN ('local_open_weight','unavailable')),
  CHECK(completed_at IS NULL OR completed_at>=started_at)
);

CREATE TABLE IF NOT EXISTS yorpmind_decision_briefs (
  brief_id TEXT PRIMARY KEY CHECK(length(brief_id) BETWEEN 8 AND 128),
  agent_id TEXT NOT NULL REFERENCES yorpmind_agent_roster(agent_id)
    ON DELETE RESTRICT,
  run_id TEXT NOT NULL REFERENCES yorpmind_analysis_runs(run_id)
    ON DELETE RESTRICT,
  source_signal_id TEXT NOT NULL REFERENCES monitor_signals(id)
    ON DELETE RESTRICT,
  classification TEXT NOT NULL CHECK(classification IN
    ('investigate_issue','validate_tool_idea','growth_experiment',
     'revenue_hypothesis','research_update','self_improvement')),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 8 AND 200),
  finding TEXT NOT NULL CHECK(length(finding) BETWEEN 20 AND 900),
  proposed_next_step TEXT NOT NULL CHECK(length(proposed_next_step) BETWEEN 20 AND 900),
  verification_plan TEXT NOT NULL CHECK(length(verification_plan) BETWEEN 20 AND 900),
  evidence_ref TEXT NOT NULL CHECK(length(evidence_ref) BETWEEN 8 AND 512),
  confidence TEXT NOT NULL DEFAULT 'unverified'
    CHECK(confidence IN ('unverified','partially_supported','evidence_backed')),
  review_state TEXT NOT NULL DEFAULT 'proposed'
    CHECK(review_state IN ('proposed','acknowledged','dismissed')),
  generated_at TEXT NOT NULL,
  CHECK(review_state != 'acknowledged' OR confidence != 'unverified')
);

CREATE TABLE IF NOT EXISTS yorpmind_feedback_memory (
  memory_id TEXT PRIMARY KEY CHECK(length(memory_id) BETWEEN 8 AND 128),
  source_brief_id TEXT NOT NULL REFERENCES yorpmind_decision_briefs(brief_id)
    ON DELETE RESTRICT,
  evidence_ref TEXT NOT NULL CHECK(length(evidence_ref) BETWEEN 8 AND 512),
  lesson TEXT NOT NULL CHECK(length(lesson) BETWEEN 25 AND 900),
  outcome TEXT NOT NULL CHECK(outcome IN (
    'unverified','verified_helpful','verified_unhelpful')),
  founder_reviewed INTEGER NOT NULL DEFAULT 0 CHECK(founder_reviewed IN (0,1)),
  recorded_at TEXT NOT NULL,
  CHECK(outcome='unverified' OR founder_reviewed=1)
);

CREATE INDEX IF NOT EXISTS idx_ym_runs_recent
 ON yorpmind_analysis_runs(agent_id,started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ym_briefs_review
 ON yorpmind_decision_briefs(review_state,generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ym_memory_verified
 ON yorpmind_feedback_memory(founder_reviewed,outcome,recorded_at DESC);

INSERT OR IGNORE INTO yorpmind_os_schema_versions(version,purpose)
 VALUES(2,'read-only-agent-analysis');
INSERT OR IGNORE INTO yorpmind_agent_roster(agent_id,department,agent_role) VALUES
 ('yorpmind-engineering-scout','engineering','Website and Headquarters reliability engineer'),
 ('yorpmind-security-auditor','security','Security, dependency and maintenance investigator'),
 ('yorpmind-market-scout','market','Global problem discovery and market evidence researcher'),
 ('yorpmind-growth-strategist','growth','User and agent traffic opportunity researcher'),
 ('yorpmind-revenue-analyst','revenue','Business models and first-party revenue evidence analyst'),
 ('yorpmind-evolution-architect','evolution','AI OS improvement and memory feedback analyst');
