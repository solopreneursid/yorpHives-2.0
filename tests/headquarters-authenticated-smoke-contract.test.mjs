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

test("private staging workflow is one-checkbox, exact-SHA, manual, nondeploying and protected", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /confirm_preview_reviewed:/);
  assert.match(workflow, /type: boolean/);
  assert.match(workflow, /required: true/);
  assert.match(workflow, /CONFIRM_PREVIEW_REVIEWED/);
  assert.match(workflow, /\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /PAGES_BRANCH" = "main"/);
  assert.doesNotMatch(workflow, /^  push:/m);
  assert.doesNotMatch(workflow, /reviewed_deployment_id:/);
  assert.doesNotMatch(workflow, /npm run deploy:pages-preview/);
  assert.match(workflow, /verify-existing-admin-preview\.mjs/);
  assert.match(workflow, /staging-deployments/);
  assert.match(workflow, /CF_ACCESS_CLIENT_ID/);
  assert.match(workflow, /CF_ACCESS_CLIENT_SECRET/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN/);
});
