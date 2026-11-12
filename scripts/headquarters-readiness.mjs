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
  "functions/api/admin/business-intelligence.ts",
  "admin-monitor/worker.js",
  "admin-agent/worker.js",
  "hq-engine/worker.js",
  "hq-intelligence/worker.js",
  ".github/workflows/ci.yml",
  ".github/workflows/codeql.yml",
  ".github/workflows/security.yml",
  ".github/workflows/site-quality.yml",
  ".github/workflows/admin-staging-quality.yml",
  "scripts/admin-smoke.mjs"
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
  const expected = Array.from({ length: 18 }, (_, i) => i + 4);
  const missing = expected.filter(number => !migrations.includes(number));
  const duplicates = migrations.filter((number, index) => migrations.indexOf(number) !== index);
  add("headquarters-migrations", missing.length === 0 && duplicates.length === 0,
    missing.length || duplicates.length ?
      "Missing migration IDs: " + missing.join(", ") + "; duplicate IDs: " + duplicates.join(", ") :
      "Migrations 0004–0021 exist with unique IDs; application and restore tests remain mandatory");

  let workflow = "";
  try {
    workflow = await readFile(join(root, ".github/workflows/ci.yml"), "utf8");
  } catch {
    // Component check already reports a missing file.
  }
  add("platform-ci", /npm run check/.test(workflow) && /pull_request:/.test(workflow),
    "CI must run platform checks on pull requests");

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
      "Full cumulative diff review against main across all stacked Headquarters pull requests",
      "Independent security review and authenticated owner-only mutation tests",
      "Verified staging D1 migration, backup and restore rehearsal",
      "Real repair-agent execution with regression test, independent QA and preview",
      "Verified complete desktop and mobile owner approval flow",
      "Cloudflare Workers, Workflows, D1 and Workers AI actual usage and cost review",
      "Signed owner authorization for the exact production release commit",
      "Post-deployment production health and rollback verification"
    ],
    policy: {
      approved_services: ["Cloudflare", "ChatGPT/OpenAI", "GitHub free capabilities"],
      new_external_paid_services: "prohibited_without_prior_owner_approval",
      production_auto_publish: false,
      cost_target_usd_monthly_incremental: 5,
      cost_review_threshold_usd_monthly_incremental: 10,
      optional_workload_pause_threshold_usd_monthly_incremental: 15
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
    "Only Cloudflare, existing ChatGPT/OpenAI access, and free GitHub capabilities are approved. New paid external providers require explicit founder authorization. Monthly cost targets are operational preferences, not guaranteed provider billing caps.",
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
