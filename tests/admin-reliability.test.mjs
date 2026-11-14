import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkMonitor } from "../admin-monitor/admin-health.js";
import { runSecurityAudit } from "../admin-monitor/security-auditor.js";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const extractApprovedHosts = (source) => {
  const block = source.match(/const APPROVED_HOSTS = new Set\(\[([\s\S]*?)\]\)/)?.[1] || "";
  return [...block.matchAll(/"([^"]+)"/g)].map(([, host]) => host);
};

test("admin reliability migration creates isolated monitoring and findings tables", async () => {
  const sql = await read("../migrations/0004_admin_reliability.sql");
  for (const table of ["admin_monitors", "admin_runs", "admin_checks", "admin_findings"]) assert.match(sql, new RegExp("CREATE TABLE IF NOT EXISTS " + table));
  assert.match(sql, /INSERT OR IGNORE INTO admin_monitors/);
  const productionUrl = sql.match(/'prod-home'[^\n]*'(https:\/\/[^']+)'/)?.[1];
  assert.equal(new URL(productionUrl).hostname, ["yorphives", "com"].join("."));
});

test("admin routes verify user and CI service identities while keeping CI access read-only", async () => {
  const auth = await read("../functions/_lib/admin-auth.ts");
  const route = await read("../functions/admin/[[path]].ts");
  assert.match(auth, /cf-access-jwt-assertion/);
  assert.match(auth, /RSASSA-PKCS1-v1_5/);
  assert.match(auth, /CF_ACCESS_AUD/);
  assert.match(auth, /expectedAudiences/);
  assert.match(auth, /tokenAudiences\.some/);
  assert.match(auth, /ADMIN_ALLOWED_EMAILS/);
  assert.match(auth, /ADMIN_CI_SERVICE_TOKEN_IDS/);
  assert.match(auth, /claims\.common_name/);
  assert.match(auth, /claims\.service_token_status === true/);
  assert.match(auth, /claims\.sub === ""/);
  assert.match(auth, /claims\.exp/);
  assert.match(auth, /claims\.iss/);
  assert.match(auth, /identity\.serviceToken && !\["GET", "HEAD"\]/);
  assert.match(auth, /ADMIN_CI_READ_ONLY/);
  assert.match(route, /requireAdmin/);
});

test("Headquarters retires the AI repair and write-permission probe",async()=>{
 const worker=await read("../admin-agent/worker.js");
 const route=await read("../functions/api/admin/repair-jobs.ts");
 const html=await read("../admin/index.html");
 const ui=await read("../admin/admin.js");
 assert.match(route,/MONITOR_ONLY/);
 assert.match(route,/repair_dispatch_enabled: false/);
 assert.match(route,/permission_probe_performed: false/);
 assert.doesNotMatch(html,/id="verify-github-permissions"|id="repair-form"|id="repair-submit"/);
 assert.doesNotMatch(ui,/permission_probe:true|runProbe/);
 assert.match(html,/id="monitor-only-guidance"/);
 assert.match(worker,/probeGithubWritePermissions/); // archived worker source only
});


test("Free Tools browser sweep recognizes real tool roots and hidden controls stay hidden", async () => {
  const quality = await read("../scripts/site-quality.mjs");
  const styles = await read("../styles.css");
  assert.match(quality, /main \[data-tool\]:visible/);
  assert.match(quality, /main #tool-app:visible/);
  assert.match(quality, /main #advanced-tool:visible/);
  assert.match(quality, /keyboardFocusable/);
  assert.match(quality, /visible_control_count/);
  assert.match(quality, /let failedTools = \[\]/);
  assert.match(quality, /failedTools = toolResults\.filter/);
  assert.match(quality, /hidden_elements_visible/);
  assert.match(styles, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
});

test("admin health checks are read-only, same-origin and reject arbitrary targets and redirects", async () => {
  const runner = await read("../functions/api/admin/run-checks.ts");
  const shared = await read("../admin-monitor/admin-health.js");
  assert.match(runner, /origin !== new URL\(context\.request\.url\)\.origin/);
  assert.match(runner, /confirm !== true/);
  assert.match(runner, /runAdminHealthChecks/);
  const approvedHosts = extractApprovedHosts(shared);
  assert.ok(approvedHosts.some(host => host === ["yorphives", "com"].join(".")));
  assert.ok(approvedHosts.some(host => host === ["www", "yorphives", "com"].join(".")));
  assert.ok(approvedHosts.some(host => host === ["build-yorphives-admin-reliab", "yorphives-2-preview", "pages", "dev"].join(".")));
  assert.match(shared, /AbortSignal\.timeout\(8000\)/);
  assert.match(shared, /redirect: "manual"/);
  assert.match(shared, /admin_findings/);
  assert.match(shared, /ACCESS_GATE_MONITORS/);
  assert.match(shared, /expectedAccessDenial/);
});

test("scheduled monitor uses the existing D1 binding and a single six-hour cron", async () => {
  const worker = await read("../admin-monitor/worker.js");
  const config = JSON.parse(await read("../admin-monitor/wrangler.jsonc"));
  assert.match(worker, /scheduled\(controller, env\)/);
  assert.match(worker, /runAdminHealthChecks\(env\.DB, "scheduled"\)/);
  assert.match(worker, /captureProductionSnapshots\(env\.DB\)/);
  assert.match(worker, /runAssetIntelligence\(env\.DB\)/);
  assert.match(worker, /security\.status !== "complete"/);
  assert.match(worker, /security_errors: security\.errors/);
  assert.equal(config.name, "yorphives-admin-monitor");
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.triggers.crons, ["0 */6 * * *"]);
  assert.equal(config.d1_databases[0].binding, "DB");
});

test("admin dashboard is private, responsive and loads all protected APIs", async () => {
  const html = await read("../admin/index.html");
  const script = await read("../admin/admin.js");
  const styles = await read("../admin/admin.css");
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.match(html, /changes-list/);
  assert.match(html, /assets-list/);
  assert.match(html, /asset-findings-list/);
  assert.match(html, /dependencies-list/);
  assert.match(html, /products-count/);
  assert.match(html, /tools-count/);
  assert.match(html, /website-count/);
  assert.match(styles, /@media\(max-width:760px\)/);
  assert.match(html, /Monitoring/);
  assert.match(html, /data-view="overview"/);
  assert.match(html, /data-view="agents"/);
  assert.match(html, /id="catalogue-list"/);
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
  const securityTarget = security.match(/target:\s*(https:\/\/[^\s]+)/)?.[1];
  assert.equal(new URL(securityTarget).hostname, ["yorphives", "com"].join("."));
});


test("Control Center retains repair history and analytics without dispatching new repairs", async () => {
  const migration = await read("../migrations/0008_admin_control_center.sql");
  const analytics = await read("../functions/api/admin/analytics.ts");
  const repairs = await read("../functions/api/admin/repair-jobs.ts");
  const html = await read("../admin/index.html");
  const script = await read("../admin/admin.js");
  const assets = await read("../functions/api/admin/assets.ts");
  assert.match(assets, /catalogue_listings/);
  assert.match(assets, /api\/v1\/catalogue/);
  assert.match(assets, /api\/v1\/free-tools/);
  assert.match(assets, /sitemap\.xml/);
  assert.match(assets, /openapi\.yaml/);
  assert.match(assets, /source_errors/);
  assert.match(html, /id="analytics-export"/);
  assert.match(migration, /admin_repair_jobs/);
  assert.match(migration, /admin_audit_events/);
  assert.match(analytics, /CF_ANALYTICS_API_TOKEN/);
  assert.match(analytics, /CF_ANALYTICS_ZONE_ID/);
  assert.ok(analytics.includes("api.cloudflare.com/client/v4/graphql"));
  assert.match(repairs, /requireAdmin/);
  assert.match(repairs, /MONITOR_ONLY/);
  assert.match(repairs, /ADMIN_AGENT_SERVICE/);
  assert.match(repairs, /admin_asset_findings/);
  assert.match(html, /id="view-analytics"/);
  assert.match(html, /id="view-agents"/);
  assert.match(html, /id="view-investigations"/);
  assert.match(script, /loadAnalytics\(\)/);
  assert.match(script, /loadAgents\(\)/);
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
  assert.match(script, /method:\s*"PATCH"/);
  assert.match(script, /loadActivity\(\)/);
  assert.match(html, /id="audit-list"/);
});



test("Historical repair worker remains auditable but Headquarters dispatch is retired", async () => {
  const route = await read("../functions/api/admin/repair-jobs.ts");
  const worker = await read("../admin-agent/worker.js");
  const repairEvidence = await read("../admin-agent/repair-evidence.js");
  const reviewer = await read("../scripts/agent-review.mjs");
  const config = JSON.parse(await read("../admin-agent/wrangler.jsonc"));
  assert.match(route, /ADMIN_AGENT_SERVICE/);
  const adminUi = await read("../admin/admin.js");
  const adminHtml = await read("../admin/index.html");
  assert.match(adminUi, /Monitoring and recommendations only/);
  assert.match(adminUi, /setInterval\(\(\)=>/);
  assert.match(adminHtml, /id="monitor-only-guidance"/);
  assert.match(route, /MONITOR_ONLY/);
  assert.equal(route.includes("admin-agent.internal/instances"),false);
  assert.match(route, /security_audit_partial/);
  assert.match(route, /securityEvidence.checked === securityEvidence.target_count/);
  assert.match(route, /securityFresh/);
  assert.match(route, /older evidence format/);
  assert.match(route, /hasStructuredSecurityEvidence/);
  assert.match(worker, /WorkflowEntrypoint/);
  assert.match(reviewer, /refName\.startsWith\("build\/agentic-ops-"\)/);
  assert.match(reviewer, /build\/headquarters-repair-verification/);
  assert.match(worker, /"user-agent": "YorpHives-Agentic-Operations\/1\.0"/);
  assert.match(worker, /repositoryWrite/);
  assert.match(worker, /repositoryContextAccess/);
  assert.match(worker, /contents\/admin-agent\/worker\.js/);
  assert.match(route, /repository_context_access\?: boolean/);
  assert.match(worker, /jobs_access/);
  assert.match(worker, /workers_ai: Boolean\(env\.AI\)/);
  assert.match(worker, /durable_workflow: Boolean\(env\.ADMIN_REPAIR_WORKFLOW\)/);
  assert.match(worker, /missingDependencies/);
  assert.match(route, /workers_ai\?: boolean/);
  assert.match(worker, /identity = await github\(env, "\/user"\)/);
  assert.match(worker, /catch \{\s*authenticatedLogin = null;\s*\}/);
  assert.match(repairEvidence, /job\.conclusion !== "success"/);
  assert.doesNotMatch(worker, /"success", "neutral", "skipped"/);
  assert.match(worker, /@cf\/qwen\/qwen3\.8-27b/);
  assert.match(worker, /build\/agent\/repair-/);
  assert.match(repairEvidence, /YorpHives platform checks/);
  assert.match(worker, /triggerPlatformChecks/);
  assert.match(worker, /repair-receipts/);
  assert.match(worker, /needs_review/);
  assert.match(worker, /admin_repair_ci_verifications/);
  assert.match(worker, /await db\.batch\(statements\)/);
  assert.match(worker, /ciCommitSha: ciTrigger\.commitSha/);
  assert.match(worker, /checks: verification\.checks/);
  assert.match(worker, /Cannot record review-ready repair without complete exact-commit CI evidence/);

  assert.match(worker, /draft: true/);
  assert.doesNotMatch(worker, /mergePullRequest|productionDeploy|wrangler deploy/);
  assert.equal(config.vars.REPAIR_BASE_BRANCH, "build/headquarters-repair-verification");
  assert.match(worker, /repairBase\(env\)/);
  assert.equal(config.name, "yorphives-admin-agent");
  assert.equal(config.workflows[0].class_name, "AdminRepairWorkflow");
  assert.equal(config.d1_databases[0].database_id, "e8690813-b139-44a2-a1c7-bea2d2777ead");
});

test("Admin inventory discovers sitemap pages, manifest tools and published YorpHives applications without duplicates", async () => {
  const scanner = await read("../admin-monitor/asset-intelligence.js");
  assert.match(scanner, /SITE_ORIGIN \+ "\/sitemap\.xml"/);
  assert.match(scanner, /free-tools\/manifest\.json/);
  assert.match(scanner, /api\/v1\/catalogue/);
  assert.match(scanner, /knownPaths/);
  assert.match(scanner, /sitemapError/);
  assert.match(scanner, /sitemapEntries === 0/);
  assert.ok(scanner.includes('/<loc(?:\\s[^>]*)?>'));
  assert.match(scanner, /catalogueError/);
  assert.match(scanner, /openapi\.yaml/);
  assert.match(scanner, /openapiError/);
  assert.match(scanner, /inventoryTruncated/);
  assert.match(scanner, /syncInventory\(db, trackedInventory, now, !manifestError && !sitemapError && !openapiError && !catalogueError && !inventoryTruncated\)/);
});

test("Admin findings API unifies monitor and asset findings with audited triage", async () => {
  const findings = await read("../functions/api/admin/findings.ts");
  assert.match(findings, /admin_asset_findings/);
  assert.match(findings, /source_type: "asset"/);
  assert.match(findings, /resource_type/);
  assert.match(findings, /finding_status_changed/);
  assert.match(findings, /UPDATE " \+ table/);
});

test("scheduled health checks include the private Admin UI and API access gates", async () => {
  const health = await read("../admin-monitor/admin-health.js");
  const migration = await read("../migrations/0009_admin_control_center_monitors.sql");
  const approvedHosts = extractApprovedHosts(health);
  assert.ok(approvedHosts.some(host => host === ["admin-staging", "yorphives", "com"].join(".")));
  assert.match(migration, /admin-staging-ui/);
  assert.match(migration, /admin-staging-api/);
  assert.match(migration, /environment\)/);
});


test("private Admin gate monitors treat Cloudflare Access 401 and 403 denials as healthy", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(null, { status: 401, headers: { "cf-ray": "test-ray" } });
    const admin = await checkMonitor({ id: "admin-staging-ui", name: "Admin UI", url: "https://admin-staging.yorphives.com/admin/", environment: "preview" });
    const publicSite = await checkMonitor({ id: "prod-home", name: "Production homepage", url: "https://yorphives.com/", environment: "production" });
    assert.equal(admin.ok, true);
    assert.equal(admin.status_code, 401);
    assert.equal(admin.error_message, null);
    assert.equal(publicSite.ok, false);
    assert.equal(publicSite.error_message, "HTTP 401");

    globalThis.fetch = async () => new Response(null, { status: 403, headers: { "cf-ray": "test-ray" } });
    const deniedApi = await checkMonitor({ id: "admin-staging-api", name: "Admin API", url: "https://admin-staging.yorphives.com/api/admin/overview", environment: "preview" });
    assert.equal(deniedApi.ok, true);
    assert.equal(deniedApi.status_code, 403);

    globalThis.fetch = async () => new Response(null, { status: 401 });
    const unverifiedDenial = await checkMonitor({ id: "admin-staging-api", name: "Admin API", url: "https://admin-staging.yorphives.com/api/admin/overview", environment: "preview" });
    assert.equal(unverifiedDenial.ok, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


function createSecurityAuditDb(events = []) {
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => sql.includes("SELECT id FROM admin_assets")
              ? { id: "asset-" + values[0] }
              : null,
            all: async () => ({ results: [] }),
            run: async () => {
              if (sql.includes("INSERT INTO admin_audit_events")) {
                events.push({ action: values[2], details: JSON.parse(values[5]) });
              }
              return { success: true };
            }
          };
        }
      };
    }
  };
}

test("Security Auditor marks a run complete only when every configured target returns 2xx", async () => {
  const originalFetch = globalThis.fetch;
  const events = [];
  try {
    globalThis.fetch = async (url) => new Response(null, {
      status: 200,
      headers: {
        "content-type": String(url).endsWith("/") ? "text/html; charset=utf-8" : "application/json",
        "strict-transport-security": "max-age=31536000",
        "x-content-type-options": "nosniff",
        "referrer-policy": "strict-origin-when-cross-origin",
        "content-security-policy": "default-src 'self'; frame-ancestors 'none'"
      }
    });
    const result = await runSecurityAudit(createSecurityAuditDb(events));
    assert.equal(result.status, "complete");
    assert.equal(result.checked, 7);
    assert.equal(result.target_count, 7);
    assert.equal(result.errors, 0);
    assert.equal(result.skipped, 0);
    assert.equal(events.at(-1).action, "security_audit_completed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Security Auditor records partial evidence when targets fail instead of reporting a clean audit", async () => {
  const originalFetch = globalThis.fetch;
  const events = [];
  try {
    globalThis.fetch = async () => {
      throw new Error("simulated network failure");
    };
    const result = await runSecurityAudit(createSecurityAuditDb(events));
    assert.equal(result.status, "partial");
    assert.equal(result.checked, 0);
    assert.equal(result.errors, 7);
    assert.equal(result.skipped, 0);
    assert.equal(events.at(-1).action, "security_audit_partial");
    assert.equal(events.at(-1).details.status, "partial");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Security Auditor does not resolve prior findings from redirects or failed HTTP responses", async () => {
  const originalFetch = globalThis.fetch;
  const events = [];
  let resolutionQueries = 0;
  const db = createSecurityAuditDb(events);
  const originalPrepare = db.prepare;
  db.prepare = (sql) => {
    if (sql.includes("SELECT finding_key FROM admin_asset_findings")) resolutionQueries += 1;
    return originalPrepare(sql);
  };
  try {
    let request = 0;
    globalThis.fetch = async () => {
      request += 1;
      if (request === 1) return new Response(null, { status: 302, headers: { location: "https://yorphives.com/redirected" } });
      if (request === 2) return new Response(null, { status: 503 });
      return new Response(null, {
        status: 200,
        headers: {
          "content-type": "application/json",
          "strict-transport-security": "max-age=31536000",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin"
        }
      });
    };
    const result = await runSecurityAudit(db);
    assert.equal(result.status, "partial");
    assert.equal(result.skipped, 1);
    assert.equal(result.errors, 1);
    assert.equal(resolutionQueries, 5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("public Pages responses include conservative HSTS and existing clickjacking protections", async () => {
  const headers = await read("../_headers");
  assert.match(headers, /^  Strict-Transport-Security: max-age=31536000$/m);
  assert.doesNotMatch(headers, /includeSubDomains|preload/i);
  assert.match(headers, /^  X-Frame-Options: DENY$/m);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /rel="canonical"/);
});

test("Security Auditor checks clickjacking only on HTML and requires an actual frame-ancestors directive", async () => {
  const auditor = await read("../admin-monitor/security-auditor.js");
  assert.match(auditor, /contentType\.includes\("text\/html"\)/);
  assert.match(auditor, /hasFrameAncestors/);
  assert.match(auditor, /frame-ancestors\b/i);
  assert.match(auditor, /!response\.headers\.get\("x-frame-options"\)/);
  assert.match(auditor, /await closeVerifiedFindings\(db, asset\.id, detected, startedAt\)/);
});
