PRAGMA foreign_keys=ON;
-- No IPs, cookies, session IDs, user agents, content, file names,
-- agent identities or payloads are retained. Counts are daily aggregates.
CREATE TABLE IF NOT EXISTS hq_tool_activity_registry (
 slug TEXT NOT NULL CHECK(length(slug) BETWEEN 3 AND 72 AND slug NOT GLOB '*[^a-z0-9-]*'),
 channel TEXT NOT NULL CHECK(channel IN ('browser_client_reported','access_authenticated_agent_execution')),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY (slug,channel)
);
CREATE TABLE IF NOT EXISTS hq_tool_activity_daily (
 activity_day TEXT NOT NULL CHECK(length(activity_day)=10),
 slug TEXT NOT NULL,
 channel TEXT NOT NULL CHECK(channel IN ('browser_client_reported','access_authenticated_agent_execution')),
 success_count INTEGER NOT NULL DEFAULT 0 CHECK(success_count BETWEEN 0 AND 10000),
 last_recorded_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY (activity_day,slug,channel),
 FOREIGN KEY (slug,channel) REFERENCES hq_tool_activity_registry(slug,channel) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_hq_tool_activity_recent ON hq_tool_activity_daily(activity_day DESC,channel,success_count DESC);
INSERT OR IGNORE INTO hq_tool_activity_registry(slug,channel)
VALUES
('word-counter','browser_client_reported'),
('json-formatter','browser_client_reported'),
('json-validator','browser_client_reported'),
('json-minifier','browser_client_reported'),
('uuid-generator','browser_client_reported'),
('sha256-generator','browser_client_reported'),
('html-to-markdown','browser_client_reported'),
('csv-to-markdown','browser_client_reported'),
('sha256-text','access_authenticated_agent_execution'),
('json-compact','access_authenticated_agent_execution');
