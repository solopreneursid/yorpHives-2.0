import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../admin-monitor/asset-intelligence.js", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0007_admin_asset_intelligence.sql", import.meta.url), "utf8");
const endpoint = await readFile(new URL("../functions/api/admin/run-assets.ts", import.meta.url), "utf8");

test("asset intelligence inventories core site routes and the Free Tools manifest", () => {
  for (const route of ["/", "/free-tools/", "/explore/", "/builder/", "/connect/", "/sitemap.xml", "/robots.txt", "/llms.txt", "/openapi.yaml", "/.well-known/yorphives.json", "/api/v1/free-tools"]) {
    assert.ok(source.includes(route), "missing monitored route " + route);
  }
  assert.match(source, /free-tools\/manifest\.json/);
  assert.match(source, /catalogue_listings WHERE status='available'/);
});

test("asset intelligence is bounded and restricts requests to the production origin", () => {
  assert.match(source, /MAX_ASSETS = 250/);\n  assert.match(source, /MAX_ASSETS_PER_RUN = 60/);\n  assert.match(source, /last_checked_at/);
  assert.match(source, /MAX_BODY_BYTES/);
  assert.match(source, /CONCURRENCY = 8/);
  assert.match(source, /url\.origin !== SITE_ORIGIN/);
  assert.match(source, /redirect: "manual"/);
  assert.match(source, /AbortSignal\.timeout/);
});

test("dependency observations flag deprecated packages and version upgrades for review", () => {
  assert.match(source, /deprecated/);
  assert.match(source, /major_update/);
  assert.match(source, /update_available/);
  assert.match(source, /release notes and compatibility impact/);
  assert.match(migration, /admin_dependency_observations/);
});

test("asset findings and history are persisted with lifecycle states", () => {
  assert.match(migration, /admin_assets/);
  assert.match(migration, /admin_asset_checks/);
  assert.match(migration, /admin_asset_findings/);
  assert.match(migration, /awaiting_approval/);
  assert.match(source, /resolveMissingFindings/);
});

test("manual scan endpoint requires admin auth, same origin and explicit confirmation", () => {
  assert.match(endpoint, /requireAdmin/);
  assert.match(endpoint, /INVALID_ORIGIN/);
  assert.match(endpoint, /body\.confirm !== true/);
});
