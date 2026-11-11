CREATE TABLE IF NOT EXISTS admin_page_snapshots (
  url TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  byte_length INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT NOT NULL,
  last_changed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_change_events (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  previous_hash TEXT,
  current_hash TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed')),
  title TEXT NOT NULL,
  details TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_change_events_detected ON admin_change_events(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_change_events_status ON admin_change_events(status, detected_at DESC);
