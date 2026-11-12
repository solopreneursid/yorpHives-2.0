PRAGMA foreign_keys=ON;
-- Owner decisions about independently sourced business opportunities.
-- A stable candidate ID is independent of product type, industry and tech.
-- Evidence remains in its original source tables, not copied or rewritten.
CREATE TABLE IF NOT EXISTS hq_business_opportunity_reviews (
 candidate_id TEXT PRIMARY KEY CHECK(length(candidate_id) BETWEEN 5 AND 170),
 review_status TEXT NOT NULL DEFAULT 'watching'
  CHECK(review_status IN ('watching','investigating','shortlisted','dismissed')),
 owner_note TEXT NOT NULL DEFAULT '' CHECK(length(owner_note)<=1000),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 100000),
 modified_by TEXT NOT NULL CHECK(length(modified_by)>0),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS hq_business_opportunity_events (
 event_id TEXT PRIMARY KEY,
 candidate_id TEXT NOT NULL REFERENCES hq_business_opportunity_reviews(candidate_id) ON DELETE RESTRICT,
 actor TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('created','review_changed')),
 details_json TEXT NOT NULL CHECK(json_valid(details_json)),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_hq_business_reviews_updated
 ON hq_business_opportunity_reviews(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_hq_business_events_candidate
 ON hq_business_opportunity_events(candidate_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS hq_business_review_created
 AFTER INSERT ON hq_business_opportunity_reviews
BEGIN
 INSERT INTO hq_business_opportunity_events(event_id,candidate_id,actor,action,details_json)
 VALUES(lower(hex(randomblob(16))),NEW.candidate_id,NEW.modified_by,'created',
  json_object('status',NEW.review_status,'revision',NEW.revision,
   'verified_market_demand',0,'approved_for_build',0,'approved_for_release',0));
END;
CREATE TRIGGER IF NOT EXISTS hq_business_review_changed
 AFTER UPDATE ON hq_business_opportunity_reviews
 WHEN NEW.revision!=OLD.revision
BEGIN
 INSERT INTO hq_business_opportunity_events(event_id,candidate_id,actor,action,details_json)
 VALUES(lower(hex(randomblob(16))),NEW.candidate_id,NEW.modified_by,'review_changed',
  json_object('before',OLD.review_status,'after',NEW.review_status,
   'revision',NEW.revision,'verified_market_demand',0,
   'approved_for_build',0,'approved_for_release',0));
END;
