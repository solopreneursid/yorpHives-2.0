import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("admin reliability migration creates isolated monitoring and findings tables", async () => {
  const sql = await read("../migrations/0004_admin_reliability.sql");
  for (const table of ["admin_monitors", "admin_runs", "admin_checks", "admin_findings"]) assert.match(sql, new RegExp("CREATE TABLE IF NOT EXISTS " + table));
  assert.match(sql, /INSERT OR IGNORE INTO admin_monitors/);
  assert.match(sql, /yorphives\.com/);
});

test("admin routes require a signed Cloudflare Access identity and explicit email allowlist", async () => {
  const auth = await read("../functions/_lib/admin-auth.ts");
  const route = await read("../functions/admin/[[path]].ts");
  assert.match(auth, /cf-access-jwt-assertion/);
  assert.match(auth, /RSASSA-PKCS1-v1_5/);
  assert.match(auth, /CF_ACCESS_AUD/);
  assert.match(auth, /ADMIN_ALLOWED_EMAILS/);
  assert.match(auth, /claims\.exp/);
  assert.match(auth, /claims\.iss/);
  assert.match(route, /requireAdmin/);
});

test("admin health checks are read-only, same-origin and reject arbitrary targets and redirects", async () => {
  const runner = await read("../functions/api/admin/run-checks.ts");
  const shared = await read("../admin-monitor/admin-health.js");
  assert.match(runner, /origin !== new URL\(context\.request\.url\)\.origin/);
  assert.match(runner, /confirm !== true/);
  assert.match(runner, /runAdminHealthChecks/);
  assert.match(shared, /APPROVED_HOSTS/);
  assert.match(shared, /yorphives\.com/);
  assert.match(shared, /yorphives-2-preview\.pages\.dev/);
  assert.match(shared, /AbortSignal\.timeout\(8000\)/);
  assert.match(shared, /redirect: "manual"/);
  assert.match(shared, /admin_findings/);
});

test("scheduled monitor uses the existing D1 binding and a single six-hour cron", async () => {
  const worker = await read("../admin-monitor/worker.js");
  const config = JSON.parse(await read("../admin-monitor/wrangler.jsonc"));
  assert.match(worker, /scheduled\(controller, env\)/);
  assert.match(worker, /runAdminHealthChecks\(env\.DB, "scheduled"\)/);
  assert.match(worker, /captureProductionSnapshots\(env\.DB\)/);
  assert.equal(config.name, "yorphives-admin-monitor");
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.triggers.crons, ["0 */6 * * *"]);
  assert.equal(config.d1_databases[0].binding, "DB");
});

test("admin dashboard is private, responsive and loads all protected APIs", async () => {
  const html = await read("../admin/index.html");
  const script = await read("../admin/admin.js");
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.match(html, /changes-list/);\n  assert.match(html, /assets-list/);\n  assert.match(html, /asset-findings-list/);\n  assert.match(html, /dependencies-list/);
  assert.match(html, /@media\(max-width:760px\)/);
  assert.match(html, /Read-only monitoring/);
  for (const route of ["overview", "findings", "changes", "assets", "run-checks", "run-assets"]) assert.ok(script.includes("/api/admin/" + route));
});

test("CodeQL security workflow runs weekly and on branch changes", async () => {
  const workflow = await read("../.github/workflows/codeql.yml");
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /cron:/);
  assert.match(workflow, /javascript-typescript/);
  assert.match(workflow, /security-extended/);
});

test("production change tracking is bounded, fixed-target and persists hash differences", async () => {
  const migration = await read("../migrations/0006_admin_change_tracking.sql");
  const monitor = await read("../admin-monitor/change-monitor.js");
  const worker = await read("../admin-monitor/worker.js");
  const route = await read("../functions/api/admin/changes.ts");
  const trigger = await read("../functions/api/admin/run-snapshots.ts");
  for (const table of ["admin_page_snapshots", "admin_change_events"]) assert.match(migration, new RegExp("CREATE TABLE IF NOT EXISTS " + table));
  assert.match(monitor, /SNAPSHOT_TARGETS/);
  assert.match(monitor, /SNAPSHOT_HOSTS/);
  assert.match(monitor, /512 \* 1024/);
  assert.match(monitor, /redirect: "manual"/);
  assert.match(monitor, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(worker, /captureProductionSnapshots\(env\.DB\)/);
  assert.match(route, /requireAdmin/);
  assert.match(route, /admin_change_events/);
  assert.match(trigger, /requireAdmin/);
  assert.match(trigger, /captureProductionSnapshots/);
});

test("quality workflows include browser, SEO, Lighthouse and passive security coverage", async () => {
  const quality = await read("../.github/workflows/site-quality.yml");
  const security = await read("../.github/workflows/security.yml");
  const script = await read("../scripts/site-quality.mjs");
  assert.match(quality, /playwright install/);
  assert.match(quality, /lighthouse/);
  assert.match(script, /free_tools_search/);
  assert.match(script, /json_formatter_execution/);
  assert.match(script, /sitemap_pages_http_and_metadata/);
  assert.match(security, /gitleaks/);
  assert.match(security, /retire/);
  assert.match(security, /action-baseline/);
  assert.doesNotMatch(security, /rules_file_name/);
  assert.match(security, /target: https:\/\/yorphives\.com/);
});
