PRAGMA foreign_keys = ON;

-- YorpMind v1 is a PRIVATE Headquarters knowledge registry.
-- Never bind these tables to public routes or visitor sessions.
-- No executable skill payloads, generated code, or production permissions.
CREATE TABLE IF NOT EXISTS yorpmind_experiences (
  experience_id TEXT PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'headquarters' CHECK(scope='headquarters'),
  source_type TEXT NOT NULL CHECK(source_type='repair_qa'),
  source_id TEXT NOT NULL REFERENCES admin_repair_jobs(id) ON DELETE RESTRICT,
  source_commit_sha TEXT NOT NULL CHECK(length(source_commit_sha)=40),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 8 AND 180),
  lesson TEXT NOT NULL CHECK(length(lesson) BETWEEN 30 AND 1800),
  evidence_level TEXT NOT NULL DEFAULT 'founder_reported_qa' CHECK(evidence_level='founder_reported_qa'),
  status TEXT NOT NULL DEFAULT 'recorded' CHECK(status IN ('recorded','archived')),
  recorded_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(source_type, source_id, source_commit_sha)
);

CREATE INDEX IF NOT EXISTS idx_yorpmind_experiences_created
ON yorpmind_experiences(scope, status, created_at DESC);

CREATE TABLE IF NOT EXISTS yorpmind_skills (
  skill_id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 5 AND 120),
  purpose TEXT NOT NULL CHECK(length(purpose) BETWEEN 20 AND 600),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','retired')),
  current_revision INTEGER NOT NULL DEFAULT 1 CHECK(current_revision>=1),
  approved_revision INTEGER CHECK(approved_revision IS NULL OR approved_revision>=1),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK((status='approved' AND approved_revision=current_revision)
    OR (status!='approved' AND approved_revision IS NULL))
);

CREATE TABLE IF NOT EXISTS yorpmind_skill_revisions (
  skill_id TEXT NOT NULL REFERENCES yorpmind_skills(skill_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK(revision>=1),
  source_experience_id TEXT NOT NULL REFERENCES yorpmind_experiences(experience_id) ON DELETE RESTRICT,
  procedure_json TEXT NOT NULL CHECK(length(procedure_json) BETWEEN 40 AND 5000),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(skill_id,revision)
);

CREATE TABLE IF NOT EXISTS yorpmind_skill_reviews (
  skill_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')),
  review_note TEXT NOT NULL CHECK(length(review_note) BETWEEN 40 AND 1200),
  reviewed_by TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  PRIMARY KEY(skill_id,revision),
  FOREIGN KEY(skill_id,revision) REFERENCES yorpmind_skill_revisions(skill_id,revision) ON DELETE RESTRICT
);

CREATE TRIGGER IF NOT EXISTS yorpmind_skill_review_current_draft
BEFORE INSERT ON yorpmind_skill_reviews
WHEN NOT EXISTS (
  SELECT 1 FROM yorpmind_skills
  WHERE skill_id=NEW.skill_id AND current_revision=NEW.revision AND status='draft'
)
BEGIN
  SELECT RAISE(ABORT, 'YorpMind skills may only be reviewed at their current draft revision');
END;

CREATE INDEX IF NOT EXISTS idx_yorpmind_skills_status
ON yorpmind_skills(status, updated_at DESC);

-- All skills are plain-language advice. Approval is not executable permission.
