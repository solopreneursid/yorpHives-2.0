import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const visual = await readFile(
  new URL("../scripts/headquarters-offline-visual.mjs", import.meta.url),
  "utf8"
);
const workflow = await readFile(
  new URL("../.github/workflows/headquarters-visual.yml", import.meta.url),
  "utf8"
);

test("visual regression cannot contact real Headquarters backends", () => {
  assert.match(visual, /createServer/);
  assert.match(visual, /127\.0\.0\.1/);
  assert.match(visual, /await page\.route\("\*\*\/\*"/);
  assert.match(visual, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(visual, /method !== "GET" && method !== "HEAD"/);
  assert.match(visual, /status: 405/);
  assert.match(visual, /blockedExternal\.push/);
  assert.match(visual, /await intercepted\.abort\("blockedbyclient"\)/);
  assert.doesNotMatch(visual, /CF_ACCESS_CLIENT_SECRET|CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(visual, /\.env\.CF_/);
});

test("founder choices and permission locks are covered in browser QA", () => {
  for (const marker of [
    "handoff:chatgpt", "handoff:yorpmind", "permission:closed",
    "browser:no-unapproved-mutations", "browser:no-external-network",
    "owner:hierarchy", "brand:design-loaded", "issues:contained-scroll",
    "research:balanced-scroll", "browser:no-script-crashes",
    "cockpit:recorded-counts-and-focused-home", "cockpit:next-action-navigation",
    "cockpit:mission-composer-keyboard", "cockpit:mission-composer-close",
    "cockpit:outage-clears-stale-counts", "cockpit:retry-restores-recorded-counts",
    "cockpit:optional-source-failure-isolated"
  ]) assert.ok(visual.includes(marker), marker);
  for (const view of [
    "headquarters", "yorpmind", "issues", "agents", "intelligence", "demand",
    "business", "radar", "departments", "overview", "monitoring", "analytics",
    "updates", "investigations", "activity"
  ]) assert.ok(visual.includes('"' + view + '"'), view);
  assert.match(visual, /await measure\(page, 1440, 960, "headquarters"\)/);
  assert.match(visual, /await measure\(page, 1024, 768, "demand"\)/);
  assert.match(visual, /await measure\(page, 390, 844, "issues"\)/);
});

test("GitHub screenshot job needs no secrets or production access", () => {
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /headquarters-offline-visual\.mjs/);
  assert.match(workflow, /playwright@1\.56\.1/);
  assert.match(workflow, /--ignore-scripts/);
  assert.match(workflow, /upload-artifact@/);
  assert.doesNotMatch(workflow, /\bsecrets\./);
  assert.doesNotMatch(workflow, /CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(workflow, /CF_ACCESS_CLIENT_SECRET/);
  assert.doesNotMatch(workflow, /wrangler\s+deploy/);
  assert.doesNotMatch(workflow, /pages\s+deploy/);
});
