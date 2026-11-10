PRAGMA foreign_keys = ON;

CREATE TABLE email_login_challenges (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  display_name TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX email_challenge_lookup_idx ON email_login_challenges(email, created_at DESC);

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  token_hash TEXT NOT NULL UNIQUE,
  csrf_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX auth_sessions_principal_idx ON auth_sessions(principal_id, expires_at);

CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  owner_principal_id TEXT NOT NULL REFERENCES principals(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX applications_owner_idx ON applications(owner_principal_id, created_at DESC);

CREATE TABLE agent_authorizations (
  id TEXT PRIMARY KEY,
  owner_principal_id TEXT NOT NULL REFERENCES principals(id),
  agent_principal_id TEXT NOT NULL UNIQUE REFERENCES principals(id),
  application_id TEXT REFERENCES applications(id),
  scopes_json TEXT NOT NULL,
  daily_spending_limit_minor INTEGER NOT NULL DEFAULT 0 CHECK (daily_spending_limit_minor >= 0),
  monthly_spending_limit_minor INTEGER NOT NULL DEFAULT 0 CHECK (monthly_spending_limit_minor >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  expires_at TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX agent_authorizations_owner_idx ON agent_authorizations(owner_principal_id, created_at DESC);

ALTER TABLE api_keys ADD COLUMN application_id TEXT;
CREATE INDEX api_keys_application_idx ON api_keys(application_id);

CREATE TRIGGER auth_sessions_no_update_guard BEFORE UPDATE ON auth_sessions
WHEN OLD.revoked_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'revoked auth sessions cannot be changed'); END;
