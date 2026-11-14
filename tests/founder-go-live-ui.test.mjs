import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("founder UI has monitoring, investigations and security but no publishing actions", async () => {
 const html = await read("../admin/index.html");
 assert.match(html, /id="view-investigations"/);
 assert.match(html, /data-view="investigations"/);
 assert.match(html, /data-pulse-route="business"/);
 for (const id of ["release-go-live", "release-launch-preview", "founder-open-preview", "founder-open-release", "view-releases"]) {
  assert.doesNotMatch(html, new RegExp('id="' + id + '"'));
 }
 assert.match(html, /id="view-security"/);
 assert.equal((html.match(/id="founder-stop-all"/g) || []).length, 1);
});

test("historical investigation viewer never fetches release readiness or executes actions", async () => {
 const js = await read("../admin/release-evidence.js");
 assert.match(js, /window\.loadInvestigationHistory/);
 assert.match(js, /\/api\/admin\/release-evidence/);
 assert.match(js, /production_deployment_enabled !== false/);
 assert.doesNotMatch(js, /\/api\/admin\/go-live(?:\?|\/)|loadGoLiveReadiness|issueOtp|Go Live/);
 assert.doesNotMatch(js, /method:\s*["'](?:POST|PATCH|DELETE)["']/);
});

test("unfinished development work is not framed as founder production approval", async () => {
  const js = await read("../functions/_lib/owner-action-center.js");
  assert.match(js, /not production approval requests/);
  assert.match(js, /you decide whether to act and implement changes outside Headquarters/);
});
