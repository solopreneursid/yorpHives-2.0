import { parseCiEvidence } from "./release-evidence.js";

export const DELEGATION_ACTION = "deploy_verified_release";
export const REPO = "solopreneursid/yorpHives-2.0";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[a-f0-9]{40}$/i;
const PREVIEW_PROJECTS = Object.freeze(["yorphives-2-preview", "yorphives-admin-staging"]);
const CHECKS = Object.freeze(["preview_inspected", "functional_tested", "mobile_tested", "qa_reviewed", "security_reviewed", "rollback_reviewed"]);

export function validateOwnerDelegationInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if (!UUID.test(body.repair_job_id || "") || !SHA.test(body.commit_sha || "") ||
      body.action !== DELEGATION_ACTION) return null;
  if (typeof body.owner_note !== "string" || body.owner_note.trim().length < 40 ||
      body.owner_note.length > 1200 || body.owner_note.includes("\0")) return null;
  if (!body.checklist || typeof body.checklist !== "object" ||
      CHECKS.some(key => body.checklist[key] !== true)) return null;
  const url = validatePreviewUrl(body.preview_url);
  if (!url) return null;
  return {
    repair_job_id: body.repair_job_id.toLowerCase(),
    commit_sha: body.commit_sha.toLowerCase(),
    action: DELEGATION_ACTION,
    preview_url: url,
    owner_note: body.owner_note.trim(),
    checklist: Object.fromEntries(CHECKS.map(key => [key, true]))
  };
}

export function validatePreviewUrl(value) {
  if (typeof value !== "string" || value.length > 240) return null;
  try {
    const url = new URL(value);
    const good = PREVIEW_PROJECTS.some(project =>
      url.hostname.endsWith("." + project + ".pages.dev") ||
      url.hostname === project + ".pages.dev");
    if (!good || url.protocol !== "https:" || url.username || url.password ||
        url.port || url.hash || url.search || url.pathname !== "/") return null;
    return url.origin;
  } catch { return null; }
}

export function releaseEvidenceReady(job, sha) {
  if (!job || job.status !== "needs_review" || !SHA.test(sha || "") ||
      job.ci_sha !== sha || job.qa_sha !== sha || !parseCiEvidence(job.checks_json, sha).verified ||
      job.reproduction_status !== "reproduced" || job.fix_status !== "passed" ||
      job.regression_status !== "passed" ||
      job.branch_name !== "build/agent/repair-" + job.id) return false;
  return true;
}

export function parsePullNumber(value) {
  try {
    const url = new URL(value);
    const match = /^\/solopreneursid\/yorpHives-2\.0\/pull\/([1-9][0-9]*)\/?$/.exec(url.pathname);
    if (url.protocol !== "https:" || url.hostname !== "github.com" ||
      url.username || url.password || url.port || url.search || url.hash || !match) return null;
    const number = Number(match[1]);
    return Number.isSafeInteger(number) ? number : null;
  } catch { return null; }
}

export async function verifyLiveRepairPR(job, sha, fetcher = fetch) {
  if (!releaseEvidenceReady(job, sha)) return null;
  const number = parsePullNumber(job.pull_request_url);
  if (!number) return null;
  const response = await fetcher("https://api.github.com/repos/" + REPO + "/pulls/" + number, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "YorpHives-owner-delegation/1.0",
      "x-github-api-version": "2022-11-28"
    }, signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) return null;
  const pr = await response.json();
  if (pr.number !== number || pr.state !== "open" || pr.head?.sha?.toLowerCase() !== sha ||
      pr.head?.ref !== job.branch_name || pr.head?.repo?.full_name !== REPO ||
      pr.base?.repo?.full_name !== REPO || !pr.base?.ref?.startsWith("build/headquarters-")) return null;
  return { number, sha, branch: job.branch_name };
}

export const OWNER_DELEGATION_EXECUTOR_ENABLED = false;
