PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS catalogue_categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (length(slug) BETWEEN 2 AND 80),
  CHECK (length(name) BETWEEN 2 AND 120)
);

CREATE TABLE IF NOT EXISTS catalogue_listings (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  listing_type TEXT NOT NULL CHECK (listing_type IN ('tool', 'application', 'service', 'opportunity', 'capability')),
  audiences_json TEXT NOT NULL DEFAULT '[]',
  category_id TEXT REFERENCES catalogue_categories(id) ON DELETE RESTRICT,
  owner_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'available', 'paused', 'retired')),
  access_model TEXT NOT NULL DEFAULT 'unknown' CHECK (access_model IN ('free', 'paid', 'freemium', 'contact', 'unknown')),
  price_minor INTEGER CHECK (price_minor IS NULL OR price_minor >= 0),
  currency TEXT CHECK (currency IS NULL OR length(currency) = 3),
  destination_url TEXT,
  machine_readable_url TEXT,
  requires_auth INTEGER NOT NULL DEFAULT 0 CHECK (requires_auth IN (0, 1)),
  required_scopes_json TEXT NOT NULL DEFAULT '[]',
  side_effects_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  published_at TEXT,
  reviewed_at TEXT,
  CHECK (length(slug) BETWEEN 2 AND 100),
  CHECK (length(title) BETWEEN 2 AND 160),
  CHECK (length(summary) BETWEEN 10 AND 280),
  CHECK (price_minor IS NULL OR access_model IN ('paid', 'freemium')),
  CHECK (status != 'available' OR (destination_url IS NOT NULL AND published_at IS NOT NULL AND reviewed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_catalogue_listings_publication
  ON catalogue_listings(status, published_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_catalogue_listings_type
  ON catalogue_listings(status, listing_type, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_catalogue_listings_category
  ON catalogue_listings(status, category_id, published_at DESC);

CREATE TABLE IF NOT EXISTS catalogue_usage_daily (
  listing_id TEXT NOT NULL REFERENCES catalogue_listings(id) ON DELETE CASCADE,
  usage_date TEXT NOT NULL,
  detail_views INTEGER NOT NULL DEFAULT 0 CHECK (detail_views >= 0),
  launches INTEGER NOT NULL DEFAULT 0 CHECK (launches >= 0),
  PRIMARY KEY (listing_id, usage_date)
);
CREATE INDEX IF NOT EXISTS idx_catalogue_usage_daily_date
  ON catalogue_usage_daily(usage_date DESC);
