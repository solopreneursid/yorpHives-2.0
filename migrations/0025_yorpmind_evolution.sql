PRAGMA foreign_keys = ON;

-- YorpMind daily self-evolution observations. A proposal is not a skill revision
-- or permission to execute, publish, or change the agent's security policy.
CREATE TABLE IF NOT EXISTS yorpmind_evolution_runs (
  run_date TEXT PRIMARY KEY CHECK(length(run_date)=10),
  run_id TEXT NOT NULL UNIQUE,
  trigger_source TEXT NOT NULL CHECK(trigger_source='daily_schedule'),
  status TEXT NOT NULL CHECK(status IN ('running','completed','failed')),
  experiences_scanned INTEGER NOT NULL DEFAULT 0 CHECK(experiences_scanned BETWEEN 0 AND 100),
  topics_observed INTEGER NOT NULL DEFAULT 0 CHECK(topics_observed BETWEEN 0 AND 100),
  proposals_created INTEGER NOT NULL DEFAULT 0 CHECK(proposals_created BETWEEN 0 AND 3),
  error_summary TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS yorpmind_evolution_proposals (
  proposal_id TEXT PRIMARY KEY,
  topic_key TEXT NOT NULL UNIQUE CHECK(length(topic_key) BETWEEN 7 AND 80),
  candidate_type TEXT NOT NULL CHECK(candidate_type IN ('new_reference_skill','review_reference_skill')),
  related_skill_id TEXT REFERENCES yorpmind_skills(skill_id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','acknowledged','dismissed')),
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json) AND json_array_length(evidence_json) BETWEEN 2 AND 5),
  evidence_count INTEGER NOT NULL CHECK(evidence_count BETWEEN 2 AND 5),
  rationale TEXT NOT NULL CHECK(length(rationale) BETWEEN 40 AND 500),
  analysis_method TEXT NOT NULL DEFAULT 'deterministic_title_overlap_v1'
    CHECK(analysis_method='deterministic_title_overlap_v1'),
  run_id TEXT NOT NULL REFERENCES yorpmind_evolution_runs(run_id),
  proposed_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  CHECK((status='proposed' AND reviewed_by IS NULL AND reviewed_at IS NULL)
     OR (status!='proposed' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND length(review_note)>=40))
);
CREATE INDEX IF NOT EXISTS idx_yorpmind_proposals_review
ON yorpmind_evolution_proposals(status, proposed_at DESC);
CREATE INDEX IF NOT EXISTS idx_yorpmind_runs_created
ON yorpmind_evolution_runs(created_at DESC);

-- Prevent replacing historic evidence or changing proposal type on review.
CREATE TRIGGER IF NOT EXISTS yorpmind_proposal_immutable_evidence
BEFORE UPDATE ON yorpmind_evolution_proposals
WHEN NEW.topic_key!=OLD.topic_key OR NEW.evidence_json!=OLD.evidence_json
  OR NEW.evidence_count!=OLD.evidence_count OR NEW.candidate_type!=OLD.candidate_type
  OR COALESCE(NEW.related_skill_id,'')!=COALESCE(OLD.related_skill_id,'')
  OR NEW.rationale!=OLD.rationale OR NEW.analysis_method!=OLD.analysis_method
  OR NEW.run_id!=OLD.run_id OR NEW.proposal_id!=OLD.proposal_id
BEGIN
 SELECT RAISE(ABORT,'Evolution evidence is immutable after recording');
END;
