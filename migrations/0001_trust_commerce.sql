PRAGMA foreign_keys = ON;

CREATE TABLE principals (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('human','developer','agent','service')),
  display_name TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX principals_email_unique ON principals(email) WHERE email IS NOT NULL;

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  prefix TEXT NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  last_used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX api_keys_principal_idx ON api_keys(principal_id);

CREATE TABLE capability_grants (
  principal_id TEXT NOT NULL REFERENCES principals(id),
  capability_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  daily_unit_limit INTEGER NOT NULL DEFAULT 1000 CHECK (daily_unit_limit >= 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (principal_id, capability_id)
);

CREATE TABLE entitlements (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  product_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','paused','expired','revoked')),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  source_order_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX entitlements_principal_product_idx ON entitlements(principal_id, product_id, status);

CREATE TABLE rate_limit_windows (
  bucket_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 0),
  updated_at TEXT NOT NULL
);

CREATE TABLE usage_ledger (
  id TEXT PRIMARY KEY,
  principal_id TEXT REFERENCES principals(id),
  capability_id TEXT NOT NULL,
  capability_version TEXT NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  idempotency_key TEXT,
  units INTEGER NOT NULL CHECK (units >= 0),
  amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
  currency TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('succeeded','rejected','failed')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX usage_idempotency_unique ON usage_ledger(principal_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX usage_principal_created_idx ON usage_ledger(principal_id, created_at DESC);
CREATE INDEX usage_capability_created_idx ON usage_ledger(capability_id, created_at DESC);

CREATE TABLE credits_ledger (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  delta_credits INTEGER NOT NULL CHECK (delta_credits <> 0),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('purchase','usage_debit','refund','adjustment','expiry')),
  source_ref TEXT NOT NULL,
  idempotency_key TEXT,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(entry_type, source_ref)
);
CREATE UNIQUE INDEX credits_idempotency_unique ON credits_ledger(principal_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX credits_principal_created_idx ON credits_ledger(principal_id, created_at DESC);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  pack_id TEXT NOT NULL,
  credits INTEGER NOT NULL CHECK (credits > 0),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  status TEXT NOT NULL CHECK (status IN ('pending','paid','failed','refunded','expired')),
  provider TEXT NOT NULL,
  provider_session_id TEXT UNIQUE,
  checkout_url TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  paid_at TEXT,
  UNIQUE(principal_id, idempotency_key)
);
CREATE INDEX orders_principal_created_idx ON orders(principal_id, created_at DESC);

CREATE TABLE payment_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  UNIQUE(provider, provider_event_id)
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_principal_id TEXT REFERENCES principals(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  request_id TEXT,
  outcome TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX audit_actor_created_idx ON audit_events(actor_principal_id, created_at DESC);

CREATE TABLE idempotency_records (
  principal_id TEXT NOT NULL REFERENCES principals(id),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  resource_id TEXT,
  response_json TEXT,
  status TEXT NOT NULL CHECK (status IN ('processing','completed','failed')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (principal_id, idempotency_key)
);

CREATE TRIGGER usage_ledger_no_update BEFORE UPDATE ON usage_ledger BEGIN SELECT RAISE(ABORT, 'usage_ledger is append-only'); END;
CREATE TRIGGER usage_ledger_no_delete BEFORE DELETE ON usage_ledger BEGIN SELECT RAISE(ABORT, 'usage_ledger is append-only'); END;
CREATE TRIGGER credits_ledger_no_update BEFORE UPDATE ON credits_ledger BEGIN SELECT RAISE(ABORT, 'credits_ledger is append-only'); END;
CREATE TRIGGER credits_ledger_no_delete BEFORE DELETE ON credits_ledger BEGIN SELECT RAISE(ABORT, 'credits_ledger is append-only'); END;
CREATE TRIGGER payment_events_no_update BEFORE UPDATE ON payment_events BEGIN SELECT RAISE(ABORT, 'payment_events is append-only'); END;
CREATE TRIGGER payment_events_no_delete BEFORE DELETE ON payment_events BEGIN SELECT RAISE(ABORT, 'payment_events is append-only'); END;
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
