CREATE TRIGGER IF NOT EXISTS catalogue_listing_validate_insert
BEFORE INSERT ON catalogue_listings
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN json_valid(NEW.audiences_json) = 0 OR json_type(NEW.audiences_json) != 'array'
    THEN RAISE(ABORT, 'audiences_json must be a JSON array')
  END;
  SELECT CASE
    WHEN json_valid(NEW.required_scopes_json) = 0 OR json_type(NEW.required_scopes_json) != 'array'
    THEN RAISE(ABORT, 'required_scopes_json must be a JSON array')
  END;
  SELECT CASE
    WHEN json_valid(NEW.side_effects_json) = 0 OR json_type(NEW.side_effects_json) != 'array'
    THEN RAISE(ABORT, 'side_effects_json must be a JSON array')
  END;
  SELECT CASE
    WHEN NEW.destination_url IS NOT NULL
      AND lower(NEW.destination_url) NOT LIKE 'https://%'
      AND lower(NEW.destination_url) NOT LIKE 'http://%'
    THEN RAISE(ABORT, 'destination_url must use HTTP or HTTPS')
  END;
  SELECT CASE
    WHEN NEW.machine_readable_url IS NOT NULL
      AND lower(NEW.machine_readable_url) NOT LIKE 'https://%'
      AND lower(NEW.machine_readable_url) NOT LIKE 'http://%'
    THEN RAISE(ABORT, 'machine_readable_url must use HTTP or HTTPS')
  END;
  SELECT CASE
    WHEN NEW.price_minor IS NOT NULL AND (
      NEW.currency IS NULL OR NEW.currency NOT GLOB '[A-Z][A-Z][A-Z]'
    )
    THEN RAISE(ABORT, 'paid listings require a three-letter uppercase currency')
  END;
END;

CREATE TRIGGER IF NOT EXISTS catalogue_listing_validate_update
BEFORE UPDATE OF audiences_json, required_scopes_json, side_effects_json, destination_url, machine_readable_url, price_minor, currency
ON catalogue_listings
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN json_valid(NEW.audiences_json) = 0 OR json_type(NEW.audiences_json) != 'array'
    THEN RAISE(ABORT, 'audiences_json must be a JSON array')
  END;
  SELECT CASE
    WHEN json_valid(NEW.required_scopes_json) = 0 OR json_type(NEW.required_scopes_json) != 'array'
    THEN RAISE(ABORT, 'required_scopes_json must be a JSON array')
  END;
  SELECT CASE
    WHEN json_valid(NEW.side_effects_json) = 0 OR json_type(NEW.side_effects_json) != 'array'
    THEN RAISE(ABORT, 'side_effects_json must be a JSON array')
  END;
  SELECT CASE
    WHEN NEW.destination_url IS NOT NULL
      AND lower(NEW.destination_url) NOT LIKE 'https://%'
      AND lower(NEW.destination_url) NOT LIKE 'http://%'
    THEN RAISE(ABORT, 'destination_url must use HTTP or HTTPS')
  END;
  SELECT CASE
    WHEN NEW.machine_readable_url IS NOT NULL
      AND lower(NEW.machine_readable_url) NOT LIKE 'https://%'
      AND lower(NEW.machine_readable_url) NOT LIKE 'http://%'
    THEN RAISE(ABORT, 'machine_readable_url must use HTTP or HTTPS')
  END;
  SELECT CASE
    WHEN NEW.price_minor IS NOT NULL AND (
      NEW.currency IS NULL OR NEW.currency NOT GLOB '[A-Z][A-Z][A-Z]'
    )
    THEN RAISE(ABORT, 'paid listings require a three-letter uppercase currency')
  END;
END;
