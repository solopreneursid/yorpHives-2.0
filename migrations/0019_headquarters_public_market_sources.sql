PRAGMA foreign_keys=ON;
-- Broader publicly observed software and user questions. Not market volume.
CREATE TABLE IF NOT EXISTS hq_public_market_signals (
 signal_key TEXT PRIMARY KEY,
 provider TEXT NOT NULL CHECK(provider IN ('wordpress_plugins','stackexchange_questions')),
 evidence_kind TEXT NOT NULL CHECK(evidence_kind IN ('existing_product','public_question')),
 source_id TEXT NOT NULL,
 source_query TEXT NOT NULL,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 240),
 excerpt TEXT NOT NULL CHECK(length(excerpt)<=900),
 source_url TEXT NOT NULL CHECK(source_url LIKE 'https://%'),
 published_at TEXT,
 public_metric_label TEXT NOT NULL
   CHECK(public_metric_label IN ('active_install_band','question_score')),
 public_metric_value INTEGER NOT NULL CHECK(public_metric_value BETWEEN -10000 AND 1000000000),
 is_exact_metric INTEGER NOT NULL DEFAULT 0 CHECK(is_exact_metric IN (0,1)),
 first_seen_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 last_seen_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(provider,source_id)
);
CREATE INDEX IF NOT EXISTS idx_hq_public_market_signals_recent ON hq_public_market_signals(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_hq_public_market_signals_kind ON hq_public_market_signals(evidence_kind,last_seen_at DESC);
CREATE TABLE IF NOT EXISTS hq_public_market_runs (
 run_id TEXT PRIMARY KEY REFERENCES hq_intelligence_runs(run_id) ON DELETE CASCADE,
 observed_count INTEGER NOT NULL CHECK(observed_count BETWEEN 0 AND 60),
 inserted_count INTEGER NOT NULL CHECK(inserted_count BETWEEN 0 AND 60),
 warnings_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(warnings_json)),
 recorded_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
