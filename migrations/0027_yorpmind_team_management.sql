PRAGMA foreign_keys=ON;

-- Private reporting hierarchy. YorpMind staff identities are organizational
-- roles, not privileged Cloudflare identities or independent API credentials.
CREATE TABLE IF NOT EXISTS yorpmind_staff (
  staff_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  tier TEXT NOT NULL CHECK(tier IN ('chief','lead','oversight')),
  domain TEXT NOT NULL,
  reports_to TEXT REFERENCES yorpmind_staff(staff_id) ON DELETE RESTRICT,
  max_parallel_reviews INTEGER NOT NULL DEFAULT 2 CHECK(max_parallel_reviews BETWEEN 1 AND 3),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK((tier='chief' AND reports_to IS NULL) OR (tier!='chief' AND reports_to IS NOT NULL))
);

INSERT OR IGNORE INTO yorpmind_staff(staff_id,display_name,tier,domain,reports_to,max_parallel_reviews) VALUES
('yorpmind','YorpMind · Chief Manager','chief','headquarters',NULL,3);
INSERT OR IGNORE INTO yorpmind_staff(staff_id,display_name,tier,domain,reports_to,max_parallel_reviews) VALUES
('yorpmind1','YorpMind 1 · Engineering Lead','lead','engineering','yorpmind',2),
('yorpmind2','YorpMind 2 · Research Lead','lead','research','yorpmind',2),
('yorpmind3','YorpMind 3 · Product & Growth Lead','lead','product','yorpmind',2),
('yorpmind4','YorpMind 4 · Revenue Lead','lead','revenue','yorpmind',2),
('yorpmind5','YorpMind 5 · Quality & Security Observer','oversight','assurance','yorpmind',2);

-- Monitoring proposals do not authorize execution, privilege changes,
-- production publishing, skill approvals, spending, or release QA.
CREATE TABLE IF NOT EXISTS yorpmind_team_reports (
  report_id TEXT PRIMARY KEY,
  report_day TEXT NOT NULL,
  report_key TEXT NOT NULL CHECK(length(report_key) BETWEEN 8 AND 150),
  manager_id TEXT NOT NULL REFERENCES yorpmind_staff(staff_id) ON DELETE RESTRICT,
  subject_agent_id TEXT NOT NULL,
  source_job_id TEXT NOT NULL,
  recommendation TEXT NOT NULL CHECK(recommendation IN (
    'route_planned_mission','review_specialist_output',
    'investigate_failed_mission','investigate_stalled_mission',
    'verify_reusable_history','review_capacity'
  )),
  severity TEXT NOT NULL CHECK(severity IN ('low','medium','high')),
  summary TEXT NOT NULL CHECK(length(summary) BETWEEN 20 AND 400),
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json) AND length(evidence_json)<=1200),
  state TEXT NOT NULL DEFAULT 'proposed' CHECK(state IN ('proposed','acknowledged','dismissed')),
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  UNIQUE(report_day,report_key),
  CHECK((state='proposed' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_note IS NULL)
    OR (state!='proposed' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
        AND length(review_note) BETWEEN 40 AND 1000))
);

CREATE INDEX IF NOT EXISTS idx_yorpmind_team_reports_review
ON yorpmind_team_reports(state,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_yorpmind_team_reports_manager
ON yorpmind_team_reports(manager_id,created_at DESC);

CREATE TRIGGER IF NOT EXISTS yorpmind_team_reports_immutable
BEFORE UPDATE ON yorpmind_team_reports
WHEN NEW.report_id!=OLD.report_id OR NEW.report_day!=OLD.report_day
 OR NEW.report_key!=OLD.report_key OR NEW.manager_id!=OLD.manager_id
 OR NEW.subject_agent_id!=OLD.subject_agent_id OR NEW.source_job_id!=OLD.source_job_id
 OR NEW.recommendation!=OLD.recommendation OR NEW.severity!=OLD.severity
 OR NEW.summary!=OLD.summary OR NEW.evidence_json!=OLD.evidence_json
 OR NEW.created_at!=OLD.created_at OR OLD.state!='proposed'
BEGIN
  SELECT RAISE(ABORT,'YorpMind report evidence is immutable and can only be reviewed once');
END;
