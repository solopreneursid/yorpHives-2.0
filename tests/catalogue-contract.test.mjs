import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("catalogue schema constrains listing types, lifecycle and publication readiness", async () => {
  const sql = await read("../migrations/0001_catalogue.sql");
  assert.match(sql, /listing_type IN \('tool', 'application', 'service', 'opportunity', 'capability'\)/);
  assert.match(sql, /status IN \('draft', 'review', 'available', 'paused', 'retired'\)/);
  assert.match(sql, /status != 'available' OR \(destination_url IS NOT NULL AND published_at IS NOT NULL AND reviewed_at IS NOT NULL\)/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS catalogue_usage_daily/);
});

test("catalogue integrity migration rejects unsafe URLs and malformed JSON", async () => {
  const sql = await read("../migrations/0002_catalogue_integrity.sql");
  assert.match(sql, /catalogue_listing_validate_insert/);
  assert.match(sql, /catalogue_listing_validate_update/);
  assert.match(sql, /json_type\(NEW\.audiences_json\) != 'array'/);
  assert.match(sql, /destination_url must use HTTP or HTTPS/);
  assert.match(sql, /paid listings require a three-letter uppercase currency/);
});

test("catalogue list API only exposes available listings and parameterizes filters", async () => {
  const source = await read("../functions/api/v1/catalogue.ts");
  assert.match(source, /l\.status = 'available'/);
  assert.match(source, /\.bind\(\.\.\.bindings, limitValue, offsetValue\)/);
  assert.match(source, /limitValue > 50/);
  assert.match(source, /offsetValue > 10000/);
  assert.match(source, /text\/markdown/);
});

test("catalogue detail API hides unpublished listings", async () => {
  const source = await read("../functions/api/v1/catalogue/[slug].ts");
  assert.match(source, /WHERE l\.slug = \? AND l\.status = 'available'/);
  assert.match(source, /LISTING_NOT_FOUND/);
  assert.match(source, /\.bind\(slug\)/);
});

test("catalogue contracts expose audience, access and agent execution metadata", async () => {
  const source = await read("../functions/_lib/catalogue.ts");
  for (const contract of [
    "CatalogueListingType",
    "CatalogueAudience",
    "CatalogueAccessModel",
    "required_scopes",
    "side_effects",
    "machine_readable_url",
    "requires_auth",
  ]) {
    assert.ok(source.includes(contract), "Missing catalogue contract field: " + contract);
  }
});
