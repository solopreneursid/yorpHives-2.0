PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agent_departments (
  department_id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mission TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS agent_registry (
  agent_id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  department_id TEXT NOT NULL REFERENCES agent_departments(department_id) ON DELETE RESTRICT,
  role TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'ready', 'paused', 'blocked')),
  autonomy_level TEXT NOT NULL DEFAULT 'observe' CHECK (autonomy_level IN ('observe', 'recommend', 'sandbox_execute', 'owner_approval')),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  capabilities_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(capabilities_json)),
  policy_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(policy_json)),
  schedule_expression TEXT,
  provider_key TEXT,
  model_key TEXT,
  last_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (enabled = 0 OR status = 'ready')
);

CREATE TABLE IF NOT EXISTS agent_jobs (
  job_id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agent_registry(agent_id) ON DELETE RESTRICT,
  parent_job_id TEXT REFERENCES agent_jobs(job_id) ON DELETE SET NULL,
  job_type TEXT NOT NULL,
  title TEXT NOT NULL,
  request_summary TEXT NOT NULL,
  origin_type TEXT,
  origin_ref TEXT,
  status TEXT NOT NULL DEFAULT 'observed' CHECK (status IN (
    'observed', 'triaged', 'planned', 'queued', 'running',
    'awaiting_verification', 'awaiting_owner_approval',
    'completed', 'failed', 'cancelled', 'rolled_back'
  )),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  requires_owner_approval INTEGER NOT NULL DEFAULT 1 CHECK (requires_owner_approval IN (0, 1)),
  created_by TEXT NOT NULL,
  input_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(input_json)),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  evidence_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(evidence_json)),
  branch_name TEXT,
  pull_request_url TEXT,
  preview_url TEXT,
  release_deployment_id TEXT,
  rollback_deployment_id TEXT,
  estimated_cost_micros_usd INTEGER CHECK (estimated_cost_micros_usd IS NULL OR estimated_cost_micros_usd >= 0),
  actual_cost_micros_usd INTEGER CHECK (actual_cost_micros_usd IS NULL OR actual_cost_micros_usd >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS agent_job_events (
  event_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES agent_jobs(job_id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agent_registry(agent_id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'agent', 'owner', 'reviewer')),
  actor_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS agent_artifacts (
  artifact_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES agent_jobs(job_id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN (
    'report', 'diff', 'test_report', 'review_report', 'preview',
    'screenshot', 'recording', 'research_source', 'release_receipt'
  )),
  storage_kind TEXT NOT NULL CHECK (storage_kind IN ('github', 'pages', 'r2', 'external')),
  uri TEXT NOT NULL,
  content_sha256 TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS agent_approvals (
  approval_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES agent_jobs(job_id) ON DELETE RESTRICT,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'publish_release', 'rollback_release', 'change_permissions', 'destructive_action', 'financial_commitment'
  )),
  target_ref TEXT NOT NULL,
  change_digest TEXT NOT NULL,
  preview_url TEXT,
  approved_by TEXT,
  auth_provider TEXT,
  auth_method TEXT CHECK (auth_method IS NULL OR auth_method IN (
    'cloudflare_access_otp', 'cloudflare_access_mfa', 'webauthn', 'totp'
  )),
  authenticated_at TEXT,
  step_up_verified_at TEXT,
  approved_at TEXT,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'consumed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    status NOT IN ('approved', 'consumed')
    OR (approved_by IS NOT NULL AND auth_provider IS NOT NULL AND auth_method IS NOT NULL
        AND authenticated_at IS NOT NULL AND step_up_verified_at IS NOT NULL AND approved_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_agent_registry_department
  ON agent_registry(department_id, enabled, status, display_name);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_status
  ON agent_jobs(status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_agent
  ON agent_jobs(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_parent
  ON agent_jobs(parent_job_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_job_events_job
  ON agent_job_events(job_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_job
  ON agent_artifacts(job_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_pending
  ON agent_approvals(status, expires_at);

INSERT OR IGNORE INTO agent_departments (department_id, slug, name, mission, sort_order) VALUES
  ('engineering', 'engineering', 'Engineering & Operations', 'Build, maintain and improve the YorpHives platform and its products.', 10),
  ('security', 'security', 'Security & Reliability', 'Protect users, platform availability, data and release integrity.', 20),
  ('research', 'research', 'Research & Innovation', 'Evaluate emerging technologies, models, frameworks and technical opportunities.', 30),
  ('market-intelligence', 'market-intelligence', 'Global Market Intelligence', 'Validate regional needs and market opportunities using evidence.', 40),
  ('product', 'product', 'Product Development', 'Turn validated user problems into useful products and improvements.', 50),
  ('growth', 'growth', 'Growth & Marketing', 'Improve discoverability, acquisition, activation and retention.', 60),
  ('revenue', 'revenue', 'Revenue & Business', 'Develop sustainable monetization, partnerships and business performance.', 70),
  ('quality', 'quality', 'Quality Assurance', 'Independently verify functionality, accessibility, compatibility and release quality.', 80),
  ('orchestration', 'orchestration', 'Orchestration & Owner Support', 'Coordinate specialist work, priorities, evidence, approvals and reporting.', 0);

INSERT OR IGNORE INTO agent_registry
  (agent_id, slug, display_name, department_id, role, description, status, autonomy_level, enabled, capabilities_json, policy_json)
VALUES
  ('chief-of-staff', 'chief-of-staff', 'Chief of Staff', 'orchestration', 'Orchestrator', 'Coordinates specialist agents, priorities, dependencies, reports and owner decisions.', 'planned', 'recommend', 0, '["task_triage","delegation","status_reporting"]', '{"may_execute":false,"requires_independent_review":true}'),
  ('engineering-lead', 'engineering-lead', 'Engineering Lead', 'engineering', 'Platform engineering', 'Plans and coordinates isolated code changes, maintenance and platform improvements.', 'planned', 'sandbox_execute', 0, '["repository_read","branch_changes","draft_pull_requests","staging_verification"]', '{"production_access":false,"may_merge":false,"may_deploy_production":false}'),
  ('security-sentinel', 'security-sentinel', 'Security Sentinel', 'security', 'Security & reliability', 'Monitors availability, security posture, dependency risk and incident evidence.', 'planned', 'recommend', 0, '["passive_security_audit","health_monitoring","risk_triage"]', '{"active_testing_production":false,"may_change_security_policy":false}'),
  ('innovation-scout', 'innovation-scout', 'Innovation Scout', 'research', 'Technology research', 'Evaluates new frameworks, AI capabilities and infrastructure against platform needs and cost.', 'planned', 'recommend', 0, '["technology_research","compatibility_analysis","cost_comparison"]', '{"may_change_dependencies":false,"requires_engineering_review":true}'),
  ('global-intelligence', 'global-intelligence', 'Global Market Intelligence', 'market-intelligence', 'Regional market research', 'Researches user demand, regional constraints, competition and localization opportunities using public or consented evidence.', 'planned', 'recommend', 0, '["market_research","competitor_analysis","localization_research"]', '{"no_sensitive_profiling":true,"no_stereotype_based_recommendations":true}'),
  ('product-strategist', 'product-strategist', 'Product Strategist', 'product', 'Product discovery', 'Validates user problems and prepares product concepts, roadmaps and release requirements.', 'planned', 'recommend', 0, '["problem_discovery","product_specs","catalogue_review"]', '{"no_unverified_product_claims":true,"requires_owner_review_for_major_launch":true}'),
  ('growth-operator', 'growth-operator', 'Growth Operator', 'growth', 'Growth & marketing', 'Improves SEO, acquisition, onboarding, conversion and retention using measured outcomes.', 'planned', 'recommend', 0, '["seo_analysis","content_recommendations","funnel_analysis"]', '{"publishing_external_content_requires_approval":true,"no_fake_metrics":true}'),
  ('revenue-analyst', 'revenue-analyst', 'Revenue Analyst', 'revenue', 'Revenue & partnerships', 'Evaluates monetization, product economics, pricing, partnerships and revenue opportunities.', 'planned', 'recommend', 0, '["revenue_analysis","pricing_research","partnership_research"]', '{"financial_commitments_require_owner_approval":true,"no_unapproved_spend":true}'),
  ('quality-engineer', 'quality-engineer', 'Quality Engineer', 'quality', 'Independent QA', 'Runs independent functional, browser, accessibility, performance and regression verification.', 'planned', 'sandbox_execute', 0, '["automated_tests","browser_testing","accessibility_review","release_verification"]', '{"must_not_approve_own_changes":true,"production_access":false}');
