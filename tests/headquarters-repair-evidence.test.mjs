import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRepairEvidence, REQUIRED_REPAIR_JOBS } from "../admin-agent/repair-evidence.js";

const commitSha = "b".repeat(40);
const branch = "build/agent/repair-123e4567-e89b-42d3-a456-426614174000";
const meta = { commitSha, branch };
function fixture() {
  const names = [...new Set(REQUIRED_REPAIR_JOBS.map(item => item.workflow))];
  const runs = names.map((name, index) => ({
    id: index + 120, name, head_sha: commitSha, head_branch: branch,
    event: "push", status: "completed", conclusion: "success",
    run_attempt: 1, created_at: "2026-11-12T10:00:00Z"
  }));
  const jobsByRun = new Map(runs.map(run => [
    run.id,
    REQUIRED_REPAIR_JOBS.filter(item => item.workflow === run.name)
      .map((item, index) => ({
        id: run.id * 10 + index, name: item.name, status: "completed", conclusion: "success"
      }))
  ]));
  return { runs, jobsByRun };
}

test("only an exact-branch and exact-commit five-job release evidence passes", () => {
  const { runs, jobsByRun } = fixture();
  const result = evaluateRepairEvidence(runs, jobsByRun, meta);
  assert.equal(result.status, "passed");
  assert.equal(result.ci_verified, true);
  assert.equal(result.issue_resolution_verified, false);
  assert.equal(result.production_approved, false);
  assert.equal(result.checks.length, 5);
  for (const check of result.checks) assert.equal(check.commit_sha, commitSha);
});

test("other branch, other revision and PR event cannot qualify", () => {
  const { runs, jobsByRun } = fixture();
  runs[0].head_branch = "main";
  assert.equal(evaluateRepairEvidence(runs, jobsByRun, meta).status, "pending");
  runs[0].head_branch = branch;
  runs[0].head_sha = "c".repeat(40);
  assert.equal(evaluateRepairEvidence(runs, jobsByRun, meta).status, "pending");
  runs[0].head_sha = commitSha;
  runs[0].event = "pull_request";
  assert.equal(evaluateRepairEvidence(runs, jobsByRun, meta).status, "pending");
});

test("failed required check, preview deployment or overall workflow blocks repair", () => {
  const a = fixture();
  a.jobsByRun.get(a.runs[1].id)[0].conclusion = "failure";
  assert.match(evaluateRepairEvidence(a.runs, a.jobsByRun, meta).reason, /Job failed/);
  assert.equal(evaluateRepairEvidence(a.runs, a.jobsByRun, meta).status, "failed");
  const b = fixture();
  b.runs[1].conclusion = "failure";
  assert.equal(evaluateRepairEvidence(b.runs, b.jobsByRun, meta).status, "failed");
});

test("missing, unfinished and incorrectly named verification jobs never pass", () => {
  const a = fixture();
  a.jobsByRun.get(a.runs[1].id).splice(0, 1);
  assert.equal(evaluateRepairEvidence(a.runs, a.jobsByRun, meta).status, "pending");
  const b = fixture();
  b.runs[1].status = "in_progress";
  assert.equal(evaluateRepairEvidence(b.runs, b.jobsByRun, meta).status, "pending");
  const c = fixture();
  c.jobsByRun.get(c.runs[1].id)[0].name = "Different preview";
  assert.equal(evaluateRepairEvidence(c.runs, c.jobsByRun, meta).status, "pending");
});

test("latest failing rerun cannot be masked by a previously successful run", () => {
  const { runs, jobsByRun } = fixture();
  const newer = { ...runs[1], id: 999, run_attempt: 2, conclusion: "failure" };
  runs.push(newer);
  jobsByRun.set(newer.id, [...jobsByRun.get(runs[1].id)]);
  const result = evaluateRepairEvidence(runs, jobsByRun, meta);
  assert.equal(result.status, "failed");
  assert.match(result.reason, /Workflow did not pass/);
});

test("invalid expected repair identifiers fail closed", () => {
  const a = fixture();
  assert.throws(() => evaluateRepairEvidence(a.runs, a.jobsByRun, { commitSha: "bad", branch }), /Invalid expected/);
  assert.throws(() => evaluateRepairEvidence(a.runs, a.jobsByRun, { commitSha, branch: "main" }), /Invalid expected/);
});
