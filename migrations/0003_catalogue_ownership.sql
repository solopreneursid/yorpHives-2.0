ALTER TABLE catalogue_listings
ADD COLUMN owner_type TEXT NOT NULL DEFAULT 'external'
CHECK (owner_type IN ('yorphives', 'external'));

CREATE INDEX IF NOT EXISTS idx_catalogue_yorphives_applications
ON catalogue_listings(owner_type, status, listing_type, published_at DESC);
