/**
 * Strict verification of the exact repair revision using GitHub Actions evidence.
 * This module is dependency-free and runs in Cloudflare Workers V8 isolates.
 */
export const REQUIRED_REPAIR_JOBS = Object.freeze([
  { key: "contract-tests", workflow: "YorpHives platform checks", name: "contract-tests" },
  { key: "staging-deployment", workflow: "YorpHives browser, SEO and performance quality", name: "Deploy isolated Cloudflare Pages preview" },
  { key: "browser-and-seo", workflow: "YorpHives browser, SEO and performance quality", name: "Browser smoke tests and SEO crawl" },
  { key: "code-review", workflow: "YorpHives browser, SEO and performance quality", name: "Code review" },
  { key: "lighthouse", workflow: "YorpHives browser, SEO and performance quality", name: "Lighthouse performance audit" }
]);

export function evaluateRepairEvidence(runs, jobsByRun, expected) {
  const { commitSha, branch } = expected;
  if (!/^[0-9a-f]{40}$/i.test(commitSha) || !/^build\/agent\/repair-[0-9a-f-]{36}$/i.test(branch)) {
    throw new Error("Invalid expected repair branch or commit.");
  }
  const names = [...new Set(REQUIRED_REPAIR_JOBS.map(item => item.workflow))];
  const chosen = new Map();
  for (const name of names) {
    const candidates = (Array.isArray(runs) ? runs : []).filter(run =>
      run?.name === name && run.head_sha === commitSha && run.head_branch === branch && run.event === "push"
    );
    candidates.sort((a, b) =>
      (b.run_attempt || 1) - (a.run_attempt || 1) ||
      Date.parse(b.run_started_at || b.created_at || 0) - Date.parse(a.run_started_at || a.created_at || 0) ||
      (b.id || 0) - (a.id || 0)
    );
    if (candidates[0]) chosen.set(name, candidates[0]);
  }
  const evidence = [];
  for (const required of REQUIRED_REPAIR_JOBS) {
    const run = chosen.get(required.workflow);
    if (!run) return { status: "pending", reason: "Missing exact-commit workflow run for " + required.workflow, checks: evidence };
    if (run.status !== "completed") return { status: "pending", reason: "Workflow still running: " + required.workflow, checks: evidence };
    if (run.conclusion !== "success") return { status: "failed", reason: "Workflow did not pass: " + required.workflow, checks: evidence };

    const jobs = jobsByRun.get(run.id) || [];
    const job = jobs.find(candidate => candidate?.name?.toLowerCase() === required.name.toLowerCase());
    if (!job) return { status: "pending", reason: "No verified job: " + required.name, checks: evidence };
    if (job.status !== "completed") return { status: "pending", reason: "Job still running: " + required.name, checks: evidence };
    if (job.conclusion !== "success") return { status: "failed", reason: "Job failed: " + required.name, checks: evidence };
    evidence.push({
      key: required.key,
      workflow_run_id: run.id,
      workflow: required.workflow,
      job_id: job.id,
      conclusion: "success",
      commit_sha: commitSha
    });
  }
  return {
    status: "passed",
    checks: evidence,
    exact_commit: commitSha,
    branch,
    ci_verified: true,
    issue_resolution_verified: false,
    production_approved: false
  };
}
