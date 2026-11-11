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
  assert.match(auth, /expectedAudiences/);
  assert.match(auth, /tokenAudiences\.some/);
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
  assert.match(worker, /runAssetIntelligence\(env\.DB\)/);
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
  assert.match(html, /changes-list/);
  assert.match(html, /assets-list/);
  assert.match(html, /asset-findings-list/);
  assert.match(html, /dependencies-list/);
  assert.match(html, /products-count/);
  assert.match(html, /tools-count/);
  assert.match(html, /website-count/);
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
  assert.match(script, /all_free_tools_render_and_controls/);
  assert.match(security, /gitleaks/);
  assert.match(security, /retire/);
  assert.match(security, /action-baseline/);
  assert.doesNotMatch(security, /rules_file_name/);
  assert.match(security, /target: https:\/\/yorphives\.com/);
});


test("Control Center adds bounded repair jobs, owner audit history and optional analytics", async () => {
  const migration = await read("../migrations/0008_admin_control_center.sql");
  const analytics = await read("../functions/api/admin/analytics.ts");
  const repairs = await read("../functions/api/admin/repair-jobs.ts");
  const html = await read("../admin/index.html");
  const script = await read("../admin/admin.js");
  assert.match(migration, /admin_repair_jobs/);
  assert.match(migration, /admin_audit_events/);
  assert.match(analytics, /CF_ANALYTICS_API_TOKEN/);
  assert.match(analytics, /CF_ANALYTICS_ZONE_ID/);
  assert.match(analytics, /api\.cloudflare\.com\/client\/v4\/graphql/);
  assert.match(repairs, /requireAdmin/);
  assert.match(repairs, /INVALID_ORIGIN/);
  assert.match(repairs, /ADMIN_AGENT_WEBHOOK_URL/);
  assert.match(repairs, /pull_request_only/);
  assert.match(repairs, /no_production_deploy/);
  assert.match(html, /id="analytics"/);
  assert.match(html, /id="repair-desk"/);
  assert.match(html, /id="release-control"/);
  assert.match(script, /loadAnalytics\(\)/);
  assert.match(script, /loadRepairDesk\(\)/);
});


test("Admin findings support audited triage while fixed status remains verification-controlled", async () => {
  const findings = await read("../functions/api/admin/findings.ts");
  const audit = await read("../functions/api/admin/audit.ts");
  const script = await read("../admin/admin.js");
  const html = await read("../admin/index.html");
  assert.match(findings, /onRequestPatch/);
  assert.match(findings, /accepted_risk/);
  assert.match(findings, /admin_audit_events/);
  assert.match(findings, /INVALID_ORIGIN/);
  assert.match(audit, /requireAdmin/);
  assert.match(audit, /ORDER BY created_at DESC/);
  assert.match(script, /method: "PATCH"/);
  assert.match(script, /loadAudit\(\)/);
  assert.match(html, /id="audit-list"/);
});



test("Cloudflare durable repair agent uses a private service binding and CI-gated draft PRs", async () => {
  const route = await read("../functions/api/admin/repair-jobs.ts");
  const worker = await read("../admin-agent/worker.js");
  const config = JSON.parse(await read("../admin-agent/wrangler.jsonc"));
  assert.match(route, /ADMIN_AGENT_SERVICE/);\n  assert.match(route, /ADMIN_AGENT_SERVICE_TOKEN/);
  assert.match(route, /AGENT_DAILY_LIMIT/);
  assert.match(route, /admin-agent\.internal\/instances/);
  assert.match(worker, /WorkflowEntrypoint/);\n  assert.match(worker, /ADMIN_AGENT_SERVICE_TOKEN/);
  assert.match(worker, /@cf\/qwen\/qwen3\.8-27b/);
  assert.match(worker, /build\/agent\/repair-/);
  assert.match(worker, /yorphives platform checks/);
  assert.match(worker, /needs_review/);
  assert.match(worker, /draft: true/);
  assert.doesNotMatch(worker, /mergePullRequest|productionDeploy|wrangler deploy/);
  assert.equal(config.name, "yorphives-admin-agent");
  assert.equal(config.workflows[0].class_name, "AdminRepairWorkflow");
  assert.equal(config.d1_databases[0].database_id, "e8690813-b139-44a2-a1c7-bea2d2777ead");
});
