PRAGMA foreign_keys=ON;

-- YorpHives-owned workforce foundation. These records are NOT active model
-- processes, cloud identities or publishing permissions.
-- Schema is portable SQLite; no proprietary inference provider is required.
CREATE TABLE IF NOT EXISTS yorpmind_local_model_slots (
  slot_id TEXT PRIMARY KEY CHECK(slot_id IN
    ('planning','coding','research','review','general')),
  description TEXT NOT NULL,
  runtime TEXT NOT NULL DEFAULT 'unconfigured'
    CHECK(runtime IN ('unconfigured','ollama','llama_cpp','vllm','mlx_lm')),
  model_ref TEXT NOT NULL DEFAULT '' CHECK(length(model_ref)<=160),
  state TEXT NOT NULL DEFAULT 'unconfigured'
    CHECK(state IN ('unconfigured','needs_benchmark','ready','disabled')),
  last_verified_at TEXT,
  -- Endpoints, credentials, hardware and model weights remain on OWNED hosts.
  CHECK((state='unconfigured' AND runtime='unconfigured' AND model_ref='')
    OR (state!='unconfigured' AND runtime!='unconfigured' AND length(model_ref)>=3))
);

INSERT OR IGNORE INTO yorpmind_local_model_slots(slot_id,description) VALUES
  ('planning','Private reasoning and mission planning'),
  ('coding','Private coding and test repair'),
  ('research','Private synthesis of authorized research'),
  ('review','Independent evidence and quality review'),
  ('general','Private generalist inference');

CREATE TABLE IF NOT EXISTS yorpmind_workers (
  worker_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL UNIQUE REFERENCES agent_registry(agent_id) ON DELETE RESTRICT,
  supervisor_id TEXT NOT NULL REFERENCES yorpmind_staff(staff_id) ON DELETE RESTRICT,
  model_slot TEXT NOT NULL REFERENCES yorpmind_local_model_slots(slot_id) ON DELETE RESTRICT,
  role_summary TEXT NOT NULL CHECK(length(role_summary) BETWEEN 20 AND 320),
  state TEXT NOT NULL DEFAULT 'planned' CHECK(state IN ('planned','ready','paused')),
  max_active_tasks INTEGER NOT NULL DEFAULT 1 CHECK(max_active_tasks BETWEEN 1 AND 3),
  execution_policy TEXT NOT NULL DEFAULT 'plan_only'
    CHECK(execution_policy IN ('plan_only','isolated_sandbox')),
  can_release INTEGER NOT NULL DEFAULT 0 CHECK(can_release=0),
  can_grant_permissions INTEGER NOT NULL DEFAULT 0 CHECK(can_grant_permissions=0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(state!='ready' OR execution_policy='isolated_sandbox')
);
CREATE INDEX IF NOT EXISTS idx_yorpmind_workers_supervisor
  ON yorpmind_workers(supervisor_id,state,worker_id);

INSERT OR IGNORE INTO yorpmind_workers(worker_id,agent_id,supervisor_id,model_slot,role_summary) VALUES
('w-orchestration','chief-of-staff','yorpmind','planning','Coordinates plans, dependencies, and founder-readable status without executing privileged actions.'),
('w-engineering','engineering-lead','yorpmind1','coding','Prepares code improvements in isolated environments without production release privileges.'),
('w-security','security-sentinel','yorpmind5','review','Observes risks independently and checks security evidence without changing access rules.'),
('w-innovation','innovation-scout','yorpmind2','research','Studies open-weight models and verifies migration, license, quality and operating costs.'),
('w-market','global-intelligence','yorpmind2','research','Studies international demand and supports claims with provenance and dated evidence.'),
('w-product','product-strategist','yorpmind3','planning','Develops product hypotheses, acceptance criteria and reversible release proposals.'),
('w-growth','growth-operator','yorpmind3','general','Researches legitimate human and agent traffic channels using measurable experiments.'),
('w-revenue','revenue-analyst','yorpmind4','research','Analyzes sustainable revenue opportunities without committing funds or publishing claims.'),
('w-quality','quality-engineer','yorpmind5','review','Independently verifies artifacts and regressions without approving its own changes.');

-- Business work is linked to the EXISTING general-purpose mission ledger.
-- A work order can be assigned but NEVER changes an AI process by itself.
CREATE TABLE IF NOT EXISTS yorpmind_work_orders (
  work_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE REFERENCES agent_jobs(job_id) ON DELETE RESTRICT,
  worker_id TEXT NOT NULL REFERENCES yorpmind_workers(worker_id) ON DELETE RESTRICT,
  supervisor_id TEXT NOT NULL REFERENCES yorpmind_staff(staff_id) ON DELETE RESTRICT,
  asset TEXT NOT NULL CHECK(asset IN ('yorphives_website','headquarters','company_portfolio')),
  acceptance_criteria TEXT NOT NULL CHECK(length(acceptance_criteria) BETWEEN 40 AND 1200),
  state TEXT NOT NULL DEFAULT 'planned'
    CHECK(state IN ('planned','awaiting_private_runtime','awaiting_qa','reviewed','cancelled')),
  requested_by TEXT NOT NULL,
  reviewer_worker_id TEXT REFERENCES yorpmind_workers(worker_id) ON DELETE RESTRICT,
  approved_evidence_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(reviewer_worker_id IS NULL OR reviewer_worker_id!=worker_id),
  CHECK(state!='reviewed' OR (reviewer_worker_id IS NOT NULL AND
    approved_evidence_ref IS NOT NULL AND length(approved_evidence_ref)>=12))
);
CREATE INDEX IF NOT EXISTS idx_yorpmind_work_queue
  ON yorpmind_work_orders(state,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_yorpmind_work_worker
  ON yorpmind_work_orders(worker_id,state,created_at DESC);

-- Append-only coordination messages are stored locally; the API currently
-- permits only founder-authored notes. Worker posting needs real service
-- identities in a separately reviewed stage.
CREATE TABLE IF NOT EXISTS yorpmind_work_messages (
  message_id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES yorpmind_work_orders(work_id) ON DELETE RESTRICT,
  sender_kind TEXT NOT NULL CHECK(sender_kind IN ('founder','verified_worker')),
  sender_id TEXT NOT NULL,
  message TEXT NOT NULL CHECK(length(message) BETWEEN 8 AND 1500),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_yorpmind_messages_work
  ON yorpmind_work_messages(work_id,created_at);
CREATE TRIGGER IF NOT EXISTS trg_yorpmind_messages_no_update
BEFORE UPDATE ON yorpmind_work_messages
BEGIN SELECT RAISE(ABORT,'Work messages are append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_yorpmind_messages_no_delete
BEFORE DELETE ON yorpmind_work_messages
BEGIN SELECT RAISE(ABORT,'Work messages are append-only'); END;

-- A candidate is NOT an approved skill, benchmark or model training update.
CREATE TABLE IF NOT EXISTS yorpmind_learning_candidates (
  candidate_id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES yorpmind_work_orders(work_id) ON DELETE RESTRICT,
  proposal TEXT NOT NULL CHECK(length(proposal) BETWEEN 40 AND 1600),
  evidence_ref TEXT NOT NULL CHECK(length(evidence_ref) BETWEEN 12 AND 350),
  state TEXT NOT NULL DEFAULT 'needs_independent_review'
    CHECK(state IN ('needs_independent_review','rejected','approved_reference')),
  created_by TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(state='needs_independent_review' OR
    (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by!=created_by))
);
CREATE INDEX IF NOT EXISTS idx_yorpmind_learning_review
  ON yorpmind_learning_candidates(state,created_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_yorpmind_learning_immutable
BEFORE UPDATE ON yorpmind_learning_candidates
WHEN NEW.work_id!=OLD.work_id OR NEW.proposal!=OLD.proposal OR
  NEW.evidence_ref!=OLD.evidence_ref OR NEW.created_by!=OLD.created_by
BEGIN SELECT RAISE(ABORT,'Learning candidates must preserve their evidence'); END;
