import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const smoke = await readFile(
  new URL("../scripts/admin-smoke.mjs", import.meta.url), "utf8");
const workflow = await readFile(
  new URL("../.github/workflows/admin-staging-quality.yml", import.meta.url),
  "utf8"
);

test("authenticated smoke proves actual manager records, not just present UI", () => {
  assert.match(smoke, /\/api\/admin\/yorpmind-team/);
  assert.match(smoke, /yorpmind_six_managers_real_staging_read/);
  assert.match(smoke, /ids\.size===6/);
  assert.match(smoke, /members\.filter\(item=>item\.staff_id==="yorpmind" && item\.reports_to===null\)\.length===1/);
  assert.match(smoke, /members\.filter\(item=>item\.staff_id!=="yorpmind" && item\.reports_to==="yorpmind"\)\.length===5/);
  assert.match(smoke, /yorpmind_manager_scan_no_autonomous_release/);
  assert.match(smoke, /model_calls_per_team_scan===0/);
  assert.match(smoke, /temporary_permissions_staging_schema_ready_but_access_locked/);
  assert.match(smoke, /production_execution_enabled===false/);
});

test("private staging workflow requires the exact owner-reviewed source SHA", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /reviewed_commit_sha:/);
  assert.match(workflow, /required: true/);
  assert.match(workflow, /PAGES_COMMIT_SHA: \$\{\{ inputs\.reviewed_commit_sha \}\}/);
  assert.match(workflow, /\[\[ "\$REVIEWED_SHA" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /\$PAGES_BRANCH" = "main"/);
  assert.doesNotMatch(workflow, /^  push:/m);
  assert.match(workflow, /staging-deployments/);
  assert.match(workflow, /CF_ACCESS_CLIENT_ID/);
  assert.match(workflow, /CF_ACCESS_CLIENT_SECRET/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN/);
});
