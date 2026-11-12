import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const ROOT = resolve(process.cwd());
const TARGET = process.env.HQ_LINEAGE_BASE || "main";
const OUTPUT = resolve(ROOT, process.env.HQ_LINEAGE_REPORT_DIR || "artifacts/headquarters-readiness");

async function git(...args) {
  const { stdout } = await exec("git", args, { cwd: ROOT, maxBuffer: 25 * 1024 * 1024, encoding: "utf8" });
  return stdout.trim();
}

export function reviewClass(path) {
  if (/^migrations\//.test(path)) return "data_migration";
  if (/^\.github\/workflows\//.test(path) || /(^|\/)wrangler\.[^/]+$/.test(path) || /^_headers$/.test(path)) return "release_security_configuration";
  if (/^(functions\/_lib\/admin-auth\.ts|functions\/api\/admin\/|admin-agent\/|hq-engine\/|hq-intelligence\/)/.test(path)) return "privileged_backend";
  if (/^(admin\/|admin-monitor\/)/.test(path)) return "admin_operations";
  if (/^(tests\/|scripts\/)/.test(path)) return "test_and_tooling";
  if (/^docs\//.test(path)) return "documentation";
  return "public_product_or_other";
}

export function parseNameStatus(raw) {
  const tokens = raw.split("\0");
  if (tokens.at(-1) === "") tokens.pop();
  const result = [];
  for (let i = 0; i < tokens.length;) {
    const status = tokens[i++];
    if (!/^[ACDMRTUX][0-9]*$/.test(status)) throw new Error("Unexpected Git status token.");
    if (status.startsWith("R") || status.startsWith("C")) {
      if (i + 1 >= tokens.length) throw new Error("Incomplete rename/copy record.");
      const previous_path = tokens[i++], path = tokens[i++];
      result.push({ status, path, previous_path, review_class: reviewClass(path) });
    } else {
      if (i >= tokens.length) throw new Error("Incomplete changed-file record.");
      const path = tokens[i++];
      result.push({ status, path, review_class: reviewClass(path) });
    }
  }
  return result;
}

export function reportMarkdown(report) {
  const totals = Object.entries(report.by_class).map(([category, count]) => "- " + category + ": " + count);
  const sensitive = report.changed_files.filter(item =>
    ["data_migration", "release_security_configuration", "privileged_backend"].includes(item.review_class)
  );
  return [
    "# YorpHives full-lineage preproduction review",
    "",
    "Review generated: " + report.generated_at,
    "Scope: merge-base(" + report.base_ref + ", HEAD) through " + report.head_sha,
    "Base commit: " + report.base_sha,
    "Merge-base: " + report.merge_base_sha,
    "Ahead of main: " + report.commits_ahead + "; behind main: " + report.commits_behind,
    "Changed paths: " + report.changed_files.length,
    "",
    "**Production approval: NOT GRANTED.**",
    "**Security/owner review: REQUIRED.**",
    "",
    "## Changed-component groups",
    ...totals,
    "",
    "## Security-sensitive cumulative changes",
    ...sensitive.map(item => "- " + item.status + " " + item.path + " (" + item.review_class + ")"),
    "",
    "## Required verification",
    ...report.required_verifications.map(value => "- " + value),
    "",
    "This is a change inventory and scope receipt, not an independent security review, proof of safe migration, financial estimate or authorization to merge.",
    ""
  ].join("\n");
}

export async function audit() {
  let base;
  for (const candidate of ["refs/remotes/origin/" + TARGET, "refs/heads/" + TARGET]) {
    try { base = await git("rev-parse", "--verify", candidate); break; } catch { /* try next known local ref */ }
  }
  if (!base) throw new Error("Base ref " + TARGET + " is absent. Fetch complete Git history before reviewing; never infer a clean release.");
  const head = await git("rev-parse", "HEAD");
  const mergeBase = await git("merge-base", base, head);
  const [behind, ahead] = (await git("rev-list", "--left-right", "--count", base + "...HEAD")).split(/\s+/).map(Number);
  const changed = parseNameStatus(await git("diff", "--name-status", "-z", mergeBase, "HEAD"));
  const byClass = {};
  for (const item of changed) byClass[item.review_class] = (byClass[item.review_class] || 0) + 1;
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    base_ref: TARGET, base_sha: base, merge_base_sha: mergeBase, head_sha: head,
    commits_ahead: ahead, commits_behind: behind,
    changed_files: changed,
    by_class: byClass,
    production_approved: false,
    owner_security_review_required: true,
    required_verifications: [
      "Independently inspect full cumulative patches for authentication, secrets, service bindings and API permissions.",
      "Review every migration and verify private staging backup/restore and prod-safety boundaries.",
      "Verify PR lineage and reconcile changes introduced by both sides when main has diverged.",
      "Complete staging browser, SEO, security, functional, accessibility and performance testing.",
      "Verify actual Cloudflare charges or explicitly mark billing data unavailable (not zero).",
      "Run and independently validate repair-to-preview functionality.",
      "Require explicit authenticated founder authorization for exact production commit and recovery plan."
    ]
  };
}

async function main() {
  const report = await audit();
  await mkdir(OUTPUT, { recursive: true });
  await Promise.all([
    writeFile(join(OUTPUT, "full-lineage.json"), JSON.stringify(report, null, 2) + "\n"),
    writeFile(join(OUTPUT, "full-lineage.md"), reportMarkdown(report))
  ]);
  console.log(JSON.stringify({
    scope: "cumulative release branch vs " + report.base_ref,
    ahead: report.commits_ahead,
    behind: report.commits_behind,
    changed_paths: report.changed_files.length,
    sensitive_paths: report.changed_files.filter(v =>
      ["data_migration", "release_security_configuration", "privileged_backend"].includes(v.review_class)).length,
    production_approved: false
  }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch(error => {
    console.error("Full-lineage review failed closed: " + error.message);
    process.exitCode = 1;
  });
}
