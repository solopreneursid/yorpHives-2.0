import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";

const run = promisify(execFile);
const reportDir = process.env.REPORT_DIR || "artifacts/agent-review";
const eventName = process.env.GITHUB_EVENT_NAME || "push";
const before = process.env.GITHUB_EVENT_BEFORE || "";
const baseRef = process.env.GITHUB_BASE_REF || "main";
const refName = process.env.GITHUB_REF_NAME || "";
// Explicit stacked-PR ancestry for change review. The incremental review
// detects *new* risks introduced by the branch; the full stack must still
// receive founder/security review before any production release.
const STACKED_BASES = Object.freeze({
 "build/headquarters-yorpmind-foundation":"build/headquarters-release-evidence-console",
 "build/headquarters-release-evidence-console":"build/headquarters-issue-specific-qa",
 "build/headquarters-issue-specific-qa":"build/headquarters-repair-policy-hardening",
 "build/headquarters-repair-policy-hardening":"build/headquarters-repair-verification",
 "build/headquarters-repair-verification":"build/headquarters-lineage-incidents",
 "build/headquarters-lineage-incidents":"build/headquarters-preview-cost-guardrails",
 "build/headquarters-preview-cost-guardrails":"build/headquarters-production-readiness-gate",
 "build/headquarters-production-readiness-gate":"build/headquarters-unified-business-intelligence",
 "build/headquarters-unified-business-intelligence":"build/headquarters-usage-agent-metrics",
 "build/headquarters-usage-agent-metrics":"build/headquarters-traffic-evidence",
 "build/headquarters-traffic-evidence":"build/headquarters-existing-tool-demand",
 "build/headquarters-existing-tool-demand":"build/headquarters-global-intelligence",
 "build/headquarters-global-intelligence":"build/headquarters-opportunity-radar",
 "build/headquarters-opportunity-radar":"build/headquarters-mission-execution",
 "build/headquarters-mission-execution":"build/yorphives-official-logo",
 "build/yorphives-official-logo":"build/yorphives-headquarters",
 "build/yorphives-headquarters":"build/agentic-os-foundation"
});

async function git(args) {
  const { stdout } = await run("git", args, { maxBuffer: 8 * 1024 * 1024 });
  return stdout.trim();
}

async function resolveBase() {
  if (eventName === "pull_request") {
    await git(["fetch", "--no-tags", "origin", baseRef]);
    return `origin/${baseRef}`;
  }
  if (refName.startsWith("build/agent/repair-") || refName.startsWith("build/agentic-ops-")) {
    const repairBase = "build/headquarters-repair-verification";
    await git(["fetch", "--no-tags", "origin", repairBase]);
    return `origin/${repairBase}`;
  }
  if (STACKED_BASES[refName]) {
    const branch = STACKED_BASES[refName];
    await git(["fetch", "--no-tags", "origin", branch]);
    return "origin/" + branch;
  }
  if (refName.startsWith("build/")) {
    await git(["fetch", "--no-tags", "origin", "main"]);
    return "origin/main";
  }
  if (before && !/^0+$/.test(before)) return before;
  try {
    return await git(["rev-parse", "HEAD^"]);
  } catch {
    return "HEAD";
  }
}

const rules = [
  { id: "dynamic-code-execution", severity: "high", pattern: /\beval\s*\(|\bnew\s+Function\s*\(/, description: "Dynamic code execution primitive added." },
  { id: "document-write", severity: "high", pattern: /\bdocument\.write\s*\(/, description: "document.write can replace document content and create injection risk." },
  { id: "hardcoded-credential", severity: "critical", pattern: /(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["'`][A-Za-z0-9_\-./+=]{16,}["'`]/i, description: "Possible hard-coded credential added." },
  { id: "insecure-http", severity: "medium", pattern: /http:\/\/(?!localhost|127\.0\.0\.1)[^\s"'\x60]+/i, description: "Insecure HTTP URL added; verify whether HTTPS is available." },
  { id: "unsafe-html-sink", severity: "medium", pattern: /\.innerHTML\s*=|\.outerHTML\s*=/, description: "HTML string sink added; confirm content is trusted or sanitized." },
  { id: "unsafe-url-sink", severity: "medium", pattern: /(?:location\.href|window\.location)\s*=\s*(?:input|value|url|href|query)/i, description: "Navigation target may be influenced by untrusted input." }
];

const criticalFiles = /(^|\/)(wrangler[^/]*|\.github\/workflows\/[^/]+|.*\.env(?:\..*)?|.*secret.*)$/i;

async function main() {
  await mkdir(reportDir, { recursive: true });
  const base = await resolveBase();
  const changed = await git(["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`]);
  const paths = changed ? changed.split("\n").filter(Boolean) : [];
  const findings = [];
  const changedFiles = [];

  for (const path of paths) {
    if (criticalFiles.test(path)) {
      findings.push({ file: path, line: 0, rule: "sensitive-configuration-change", severity: "high", description: "Infrastructure, workflow, or secret-related file changed; require owner review." });
    }
    let patch = "";
    try {
      patch = await git(["diff", "--unified=0", `${base}...HEAD`, "--", path]);
    } catch {
      continue;
    }
    changedFiles.push(path);
    const lines = patch.split("\n");
    let lineNumber = 0;
    for (const line of lines) {
      if (line.startsWith("@@")) {
        const match = line.match(/\+(\d+)/);
        if (match) lineNumber = Number(match[1]) - 1;
        continue;
      }
      if (!line.startsWith("+") || line.startsWith("+++")) continue;
      lineNumber += 1;
      const added = line.slice(1);
      for (const rule of rules) {
        if (rule.pattern.test(added)) {
          findings.push({ file: path, line: lineNumber, rule: rule.id, severity: rule.severity, description: rule.description });
        }
      }
    }
  }

  const counts = Object.fromEntries(["critical", "high", "medium", "low"].map(level => [level, findings.filter(item => item.severity === level).length]));
  const report = {
    generated_at: new Date().toISOString(),
    base_ref: base,
    comparison_scope: base === "origin/main" ? "full-main-lineage" : "incremental-stacked-feature",
    release_requires_full_lineage_review: base !== "origin/main",
    head_sha: await git(["rev-parse", "HEAD"]),
    files_reviewed: changedFiles,
    summary: { files_changed: paths.length, findings: findings.length, ...counts },
    findings
  };
  await writeFile(`${reportDir}/code-review.json`, JSON.stringify(report, null, 2));
  await writeFile(`${reportDir}/code-review.md`, [
    "# Automated code review",
    "",
    `Generated: ${report.generated_at}`,
    `Files reviewed: ${report.summary.files_changed}`,
    `Findings: ${report.summary.findings} (critical ${counts.critical}, high ${counts.high}, medium ${counts.medium})`,
    "",
    ...(findings.length ? findings.map(item => `- **${item.severity.toUpperCase()}** ${item.file}:${item.line} — ${item.description}`) : ["No configured static-risk patterns were detected."]),
    "",
    "Incremental feature reviews only cover the branch's PR base. All stacked changes still require separate full-lineage owner and security review before production release.",
    "",
    "This automated review is a heuristic signal, not a substitute for human review or a full security assessment."
  ].join("\n"));
  console.log(JSON.stringify(report.summary));
  if (counts.critical > 0 || counts.high > 0) {
    console.error("Code review blocked: critical/high risk findings require owner review.");
    process.exitCode = 1;
  }
}

await main();
