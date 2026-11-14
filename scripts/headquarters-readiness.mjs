import { access, readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_COMPONENTS = Object.freeze([
  "admin/index.html",
  "admin/headquarters.js",
  "admin/headquarters.css",
  "functions/_lib/admin-auth.ts",
  "functions/api/admin/headquarters.ts",
  "functions/api/admin/repair-jobs.ts",
  "functions/api/admin/repair-qa.ts",
  "functions/api/admin/release-evidence.ts",
  "functions/_lib/yorpmind.js",
  "functions/api/admin/yorpmind.ts",
  "functions/api/admin/yorpmind-search.ts",
  "functions/_lib/yorpmind-retrieval.js",
  "admin/yorpmind-search.js",
  "admin/yorpmind-mission-policy.js",
  "admin/yorpmind-mission-planning.js",
  "admin/yorpmind-mission-planning.css",
  "admin/yorpmind-evolution.js",
  "admin/yorpmind-evolution.css",
  "functions/api/admin/yorpmind-evolution.ts",
  "functions/api/admin/owner-delegations.ts",
  "functions/api/admin/step-up/owner-delegations.ts",
  "functions/_lib/owner-delegation.js",
  "functions/_lib/owner-action-center.js",
  "functions/api/admin/action-center.ts",
  "admin/owner-action-center.js",
  "admin/owner-action-center.css",
  "hq-engine/brief-output.js",
  "hq-engine/usage-receipt.js",
  "functions/_lib/mission-proof.js",
  "functions/api/admin/mission-proof.ts",
  "admin/mission-proof.js",
  "admin/mission-proof.css",
  "admin/shared-repair-inbox.js",
  "admin/shared-repair-inbox.css",
  "admin/founder-control-center.js",
  "admin/founder-control-center.css",
  "admin/headquarters-refined.js",
  "admin/headquarters-refined.css",
  "admin/headquarters-prism-theme.css",
  "scripts/headquarters-schema-audit.mjs",
  "scripts/headquarters-offline-visual.mjs",
  "docs/HEADQUARTERS-PHASE-15-BROWSER-QA.md",
  ".github/workflows/headquarters-visual.yml",
  "docs/HEADQUARTERS-STAGING-DATABASE-RECOVERY-2026-11-13.md",
  "functions/_lib/founder-permissions.js",
  "functions/api/admin/assistant-permissions.ts",
  "functions/api/admin/step-up/assistant-permissions.ts",
  "functions/api/admin/assistant-actions.ts",
  "migrations/0028_founder_temporary_grants.sql",
  "migrations/0029_founder_email_otp.sql",
  "migrations/0030_go_live_otp.sql",
  "functions/_lib/go-live-live.js",
  "functions/_lib/go-live-otp-core.js",
  "functions/api/admin/go-live-otp.ts",
  "functions/api/admin/go-live.ts",
  "functions/_lib/founder-email-otp.js",
  "functions/api/admin/founder-otp.ts",
  "tests/founder-email-otp.test.mjs",
  "docs/FOUNDER_ONE_TAP_CONTROLS.md",
  "functions/api/admin/repair-inbox.ts",
  "functions/_lib/yorpmind-verified-learning.js",
  "functions/_lib/yorpmind-team.js",
  "functions/api/admin/yorpmind-team.ts",
  "hq-intelligence/yorpmind-team-scan.js",
  "admin/yorpmind-team.js",
  "admin/yorpmind-team.css",
  "admin/owner-delegation.js",
  "admin/owner-delegation.css",
  "functions/_lib/yorpmind-patterns.js",
  "hq-intelligence/yorpmind-evolution.js",
  "hq-engine/yorpmind-context.js",
  "admin/yorpmind.js",
  "functions/api/admin/business-intelligence.ts",
  "admin-monitor/worker.js",
  "admin-monitor/asset-policy.js",
  "functions/_lib/website-proof.js",
  "functions/api/admin/website-proof.ts",
  "scripts/website-public-evidence.mjs",
  "scripts/website-preview-contrast.mjs",
  "scripts/staging-preview-check.mjs",
  "scripts/verify-existing-admin-preview.mjs",
  "docs/HEADQUARTERS-PHASE-18-AUTHENTICATED-STAGING.md",
  ".github/workflows/website-public-evidence.yml",
  "docs/HEADQUARTERS-PHASE-17-LIVE-WEBSITE-PROOF.md",
  "admin/website-proof.js",
  "admin/website-proof.css",
  "admin-agent/model-output.js",
  "functions/_lib/repair-intake.js",
  "functions/_lib/yorpmind-repair-coaching.js",
  "admin-agent/worker.js",
  "hq-engine/worker.js",
  "hq-engine/staging-rehearsal-entry.js",
  "hq-engine/wrangler.rehearsal.jsonc",
  "hq-intelligence/worker.js",
  ".github/workflows/ci.yml",
  ".github/workflows/codeql.yml",
  ".github/workflows/security.yml",
  ".github/workflows/site-quality.yml",
  ".github/workflows/admin-staging-quality.yml",
  "scripts/admin-smoke.mjs",
  "scripts/headquarters-production-gate.mjs",
  "scripts/headquarters-cloudflare-preflight.mjs",
  "scripts/headquarters-cloudflare-topology.mjs",
  "scripts/headquarters-retired-access-audit.mjs",
  "tests/headquarters-retired-access-audit.test.mjs",
  "tests/headquarters-cloudflare-topology.test.mjs",
  ".github/workflows/headquarters-provider-safety.yml",
  "docs/HEADQUARTERS-PRODUCTION-HARDENING-2026-11-14.md",
  "functions/_lib/hq-resource-isolation.js",
  "functions/api/admin/watchdog-status.ts",
  "self-host/watchdog.mjs",
  "self-host/watchdog-evidence.mjs",
  "self-host/catalogue-contract.mjs",
  "self-host/agentic-internet-contract.mjs",
  "staging/monitor-only-schema-v1.sql",
  "tests/headquarters-isolated-schema.test.mjs",
  "tests/agentic-internet-contract.test.mjs",
  "docs/CONNECT-2026-AGENTIC-INTERNET-ARCHITECTURE.md",
  "admin/independent-watchdog.js",
  "admin/inbox-triage.css",
  "docs/HEADQUARTERS-MONITORING-ONLY-POLICY.md",
  "docs/HEADQUARTERS-FUNCTIONAL-WATCHDOG-INBOX.md"
]);

export const APPROVED_DIRECT_PACKAGES = Object.freeze([
  "@tailwindcss/cli",
  "tailwindcss"
]);

export async function assessHeadquarters(root) {
  const checks = [];
  const add = (id, ok, detail) => checks.push({ id, status: ok ? "pass" : "fail", detail });

  for (const path of REQUIRED_COMPONENTS) {
    try {
      await access(join(root, path));
      add("component:" + path, true, "Present");
    } catch {
      add("component:" + path, false, "Missing required Headquarters component");
    }
  }

  let pkg;
  try {
    pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    add("package-json", true, "Readable package manifest");
  } catch {
    add("package-json", false, "package.json is missing or invalid");
  }
  if (pkg) {
    const direct = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    const unknown = direct.filter(name => !APPROVED_DIRECT_PACKAGES.includes(name));
    add("direct-package-allowlist", unknown.length === 0,
      unknown.length ? "Unapproved direct dependencies: " + unknown.join(", ") :
      "No unapproved direct packages; indirect dependency and licensing review is still required");
    add("test-command", typeof pkg.scripts?.check === "string" && typeof pkg.scripts?.test === "string",
      "The existing platform check and test scripts must remain available");
  }

  let migrations = [];
  try {
    migrations = (await readdir(join(root, "migrations")))
      .map(name => /^([0-9]{4})_.*\.sql$/.exec(name))
      .filter(Boolean)
      .map(match => Number(match[1]));
  } catch {
    // Report through the explicit migration check below.
  }
  const expected = Array.from({ length: 27 }, (_, i) => i + 4);
  const missing = expected.filter(number => !migrations.includes(number));
  const duplicates = migrations.filter((number, index) => migrations.indexOf(number) !== index);
  add("headquarters-migrations", missing.length === 0 && duplicates.length === 0,
    missing.length || duplicates.length ?
      "Missing migration IDs: " + missing.join(", ") + "; duplicate IDs: " + duplicates.join(", ") :
      "Migrations 0004–0030 exist with unique IDs. Historical OTP migration 0030 is archival only; do NOT apply migrations to a shared preview/canonical D1. Private backup/restore and a separate staging database are required.");

  let workflow = "";
  try {
    workflow = await readFile(join(root, ".github/workflows/ci.yml"), "utf8");
  } catch {
    // Component check already reports a missing file.
  }
  add("platform-ci", /npm run check/.test(workflow) && /pull_request:/.test(workflow),
    "CI must run platform checks on pull requests");

  let rehearsalConfig;
  try {
    rehearsalConfig = JSON.parse(await readFile(join(root, "hq-engine/wrangler.rehearsal.jsonc"), "utf8"));
  } catch {
    rehearsalConfig = null;
  }
  const rehearsalPolicy = Boolean(
    rehearsalConfig?.name === "yorphives-hq-mission-rehearsal" &&
    rehearsalConfig?.main === "./staging-rehearsal-entry.js" &&
    rehearsalConfig?.workers_dev === false &&
    rehearsalConfig?.preview_urls === false &&
    !rehearsalConfig?.ai &&
    (!rehearsalConfig?.d1_databases || rehearsalConfig.d1_databases.length === 0) &&
    (!rehearsalConfig?.workflows || rehearsalConfig.workflows.length === 0) &&
    !rehearsalConfig?.triggers &&
    !rehearsalConfig?.routes
  );
  add("rehearsal-worker-isolation", rehearsalPolicy,
    "Retired rehearsal configuration must have NO D1, AI, Workflows, public subdomains, triggers or routes. Never reuse Headquarters data or compute privileges for archived release experiments.");
  let rehearsalEntry = "";
  try {
    rehearsalEntry = await readFile(join(root, "hq-engine/staging-rehearsal-entry.js"), "utf8");
  } catch {
    // Component check reports the missing file.
  }
  add("rehearsal-http-entrypoint", /status:\s*404/.test(rehearsalEntry) &&
    /export\s+default/.test(rehearsalEntry) &&
    !/\bMissionWorkflow\b/.test(rehearsalEntry) &&
    !/\bimport\s*\(/.test(rehearsalEntry) &&
    !/\bAI\.run\(/.test(rehearsalEntry),
    "Retired rehearsal must export only a denied HTTP handler and cannot import or expose a live Workflow.");

  let guard = "";
  try {
    guard = await readFile(join(root, "functions/_lib/admin-auth.ts"), "utf8");
  } catch {
    // Component check already reports a missing file.
  }
  add("access-auth-source", /CF_ACCESS|Access/.test(guard),
    "Access verification source must exist; runtime authentication testing remains mandatory");

  const failed = checks.filter(check => check.status === "fail");
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    stage: "preproduction-static-audit",
    ready_for_production: false,
    static_checks_passed: failed.length === 0,
    checks,
    required_live_evidence: [
      "Review the cumulative changes for every stacked Headquarters draft PR against main.",
      "Verify Cloudflare project identity, unique preview/canonical D1, and archived project auto-build/DB shutdown; do not trust legacy historical preview deployments until separately inspected.",
      "Confirm the canonical production Pages project no longer binds the privileged ADMIN_AGENT_SERVICE Worker, after functional replacement and safe external release.",
      "Test actual owner-only Cloudflare Access policies and anonymous denial for all Headquarters origins and deployment aliases.",
      "Run authenticated, read-only browser QA against the exact reviewed commit in an isolated staging environment.",
      "Prove a private backup can be restored into a disposable independent database with matching schema and rows.",
      "Install a separate watchdog process; prove local scheduler readiness and independent regression/recovery alert delivery.",
      "Verify the complete monitoring-only UI, historical 410 endpoints and absent automated repair, publishing and OTP actions.",
      "Review required capacity, backup retention, operational access and any incremental infrastructure cost with the founder.",
      "Founder makes an independent deployment decision; Headquarters cannot authorize or perform production publishing.",
      "After any independently authorized deployment, verify live authentication, monitoring data, uptime, rollback and recovery."
    ],
    policy: {
      approved_services: ["Existing Cloudflare infrastructure", "GitHub source control", "self-hosted open-source software"],
      new_external_paid_services: "prohibited_without_prior_owner_approval",
      production_auto_publish: false,
      cost_target_usd_monthly_incremental: 0,
      cost_review_threshold_usd_monthly_incremental: 0,
      optional_workload_pause_threshold_usd_monthly_incremental: 0
    }
  };
}

export function formatMarkdown(report) {
  const lines = [
    "# Headquarters preproduction readiness",
    "",
    "Generated: " + report.generated_at,
    "Static checks: " + (report.static_checks_passed ? "PASS" : "FAIL"),
    "Production authorization: NOT GRANTED (static evidence is not release approval)",
    "",
    "## Repository checks",
    "",
    ...report.checks.map(c => "- " + (c.status === "pass" ? "PASS" : "FAIL") + " — " + c.id + ": " + c.detail),
    "",
    "## Mandatory live evidence before production",
    "",
    ...report.required_live_evidence.map(item => "- " + item),
    "",
    "## Cost and provider policy",
    "",
    "The current Cloudflare/GitHub deployment footprint is historical infrastructure, not a mandate for proprietary providers. Prefer local open-source services; new paid resources require founder approval. Monthly cost targets are preferences, not billing caps.",
    ""
  ];
  return lines.join("\n");
}

async function main() {
  const root = resolve(process.cwd());
  const report = await assessHeadquarters(root);
  const destination = resolve(root, process.env.HQ_READINESS_REPORT_DIR ?? "artifacts/headquarters-readiness");
  await mkdir(destination, { recursive: true });
  await Promise.all([
    writeFile(join(destination, "report.json"), JSON.stringify(report, null, 2) + "\n"),
    writeFile(join(destination, "report.md"), formatMarkdown(report))
  ]);
  console.log("Headquarters static readiness: " + (report.static_checks_passed ? "PASS" : "FAIL"));
  console.log("Production authorization: NOT GRANTED — owner approval and live evidence required");
  if (!report.static_checks_passed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
