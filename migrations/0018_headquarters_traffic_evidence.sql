PRAGMA foreign_keys=ON;
-- One bounded zone-traffic capture per UTC day. Raw IP addresses, cookies,
-- user agents and visitor identifiers must never be collected into this ledger.
CREATE TABLE IF NOT EXISTS hq_traffic_captures (
 capture_id TEXT PRIMARY KEY,
 capture_day TEXT NOT NULL UNIQUE,
 observed_start TEXT NOT NULL,
 observed_end TEXT NOT NULL,
 source TEXT NOT NULL DEFAULT 'cloudflare_http_requests_adaptive'
   CHECK(source='cloudflare_http_requests_adaptive'),
 metric TEXT NOT NULL DEFAULT 'grouped_http_request_count'
   CHECK(metric='grouped_http_request_count'),
 tool_paths INTEGER NOT NULL CHECK(tool_paths BETWEEN 0 AND 250),
 grouped_requests INTEGER NOT NULL CHECK(grouped_requests BETWEEN 0 AND 1000000000),
 candidate_groups INTEGER NOT NULL CHECK(candidate_groups BETWEEN 0 AND 250),
 result_limit INTEGER NOT NULL DEFAULT 250 CHECK(result_limit=250),
 data_quality TEXT NOT NULL DEFAULT 'sampled_top_n_not_unique_visitors'
   CHECK(data_quality='sampled_top_n_not_unique_visitors'),
 recorded_by TEXT NOT NULL,
 recorded_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_hq_traffic_captures_recent ON hq_traffic_captures(recorded_at DESC);
CREATE TABLE IF NOT EXISTS hq_traffic_tool_paths (
 capture_id TEXT NOT NULL REFERENCES hq_traffic_captures(capture_id) ON DELETE CASCADE,
 slug TEXT NOT NULL CHECK(length(slug) BETWEEN 1 AND 72 AND slug NOT GLOB '*[^a-z0-9-]*'),
 path TEXT NOT NULL,
 grouped_requests INTEGER NOT NULL CHECK(grouped_requests BETWEEN 0 AND 1000000000),
 PRIMARY KEY(capture_id,slug)
);
CREATE INDEX IF NOT EXISTS idx_hq_traffic_paths_ranking ON hq_traffic_tool_paths(capture_id,grouped_requests DESC);
