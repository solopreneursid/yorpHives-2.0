/**
 * First-party, read-only release evidence projection.
 * Never elevates source records into a production authorization.
 */
export const EXPECTED_CI_CHECKS = Object.freeze([
  "contract-tests",
  "staging-deployment",
  "browser-and-seo",
  "code-review",
  "lighthouse"
]);

const SHA = /^[0-9a-f]{40}$/i;

export function parseCiEvidence(value, commitSha) {
  if (!SHA.test(commitSha || "")) return { verified: false, completed: [], reason: "Missing verified commit SHA." };
  let records;
  try { records = JSON.parse(value); } catch {
    return { verified: false, completed: [], reason: "Invalid CI evidence format." };
  }
  if (!Array.isArray(records) || records.length !== EXPECTED_CI_CHECKS.length) {
    return { verified: false, completed: [], reason: "All five independent CI checks are required." };
  }
  const completed = new Set();
  for (const record of records) {
    if (!record || !EXPECTED_CI_CHECKS.includes(record.key) || completed.has(record.key) ||
      record.conclusion !== "success" || record.commit_sha !== commitSha ||
      !Number.isSafeInteger(record.workflow_run_id) || record.workflow_run_id < 1 ||
      !Number.isSafeInteger(record.job_id) || record.job_id < 1) {
      return { verified: false, completed: [...completed], reason: "CI receipt contains invalid or mismatched evidence." };
    }
    completed.add(record.key);
  }
  return { verified: completed.size === EXPECTED_CI_CHECKS.length, completed: [...completed], reason: null };
}

export function summarizeRepairRelease(row) {
  const ci = parseCiEvidence(row.checks_json || "", row.commit_sha);
  const qaRecorded = ci.verified &&
    row.qa_commit_sha === row.commit_sha &&
    row.reproduction_status === "reproduced" &&
    row.fix_status === "passed" &&
    row.regression_status === "passed";

  const blockers = [];
  if (!ci.verified) blockers.push("Five exact-commit CI checks have not been attested.");
  if (!qaRecorded) blockers.push("Reproduction, fix and regression QA are not all evidenced for that CI commit.");
  blockers.push("Current GitHub PR HEAD and target branch have not been reverified in this inventory.");
  blockers.push("Cumulative security and dependency review against production main is outstanding.");
  blockers.push("Cloudflare staging restore and rollback drill require independent verification.");
  blockers.push("Actual infrastructure spending has not been reconciled to Cloudflare billing.");
  blockers.push("Founder authorization for the exact production revision has not been granted.");

  return {
    job_id: row.id,
    job_status: row.status,
    title: typeof row.request_text === "string" ? row.request_text.slice(0, 220) : "Repair investigation",
    branch_name: row.branch_name || null,
    pull_request_url: row.pull_request_url || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ci_verified: ci.verified,
    ci_commit_sha: ci.verified ? row.commit_sha : null,
    ci_checks_completed: ci.completed,
    qa_recorded_for_ci_revision: qaRecorded,
    qa_reviewed_by: qaRecorded ? row.reviewed_by : null,
    qa_updated_at: qaRecorded ? row.qa_updated_at : null,
    live_revision_verified: false,
    production_approved: false,
    blockers
  };
}

export function summarizeReleaseBoard(rows) {
  const repairs = rows.map(summarizeRepairRelease);
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    scope: "most_recent_25_repairs",
    environment: "private_headquarters",
    production_deployment_enabled: false,
    production_approved: false,
    source_note: "Private D1 evidence only. PR HEAD, release authorization, Cloudflare invoices and live recovery were not checked.",
    counts: {
      repairs: repairs.length,
      ci_attested: repairs.filter(r => r.ci_verified).length,
      qa_recorded: repairs.filter(r => r.qa_recorded_for_ci_revision).length,
      production_authorized: 0
    },
    repairs
  };
}
