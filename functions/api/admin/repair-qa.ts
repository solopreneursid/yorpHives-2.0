import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";

type ReproductionStatus = "reproduced" | "not_reproduced";
type FixStatus = "passed" | "failed" | "inconclusive";
type RegressionStatus = "passed" | "failed" | "not_run";
type RevisionStatus = "current" | "changed" | "unavailable" | "not_reviewed";

interface QaRequest {
  job_id?: string;
  reproduction_status?: ReproductionStatus;
  fix_status?: FixStatus;
  regression_status?: RegressionStatus;
  evidence?: string;
}
interface RepairJob {
  id: string;
  status: string;
  branch_name: string | null;
  pull_request_url: string | null;
}
interface QaRow {
  job_id: string;
  commit_sha: string;
  pr_number: number;
  reproduction_status: ReproductionStatus;
  fix_status: FixStatus;
  regression_status: RegressionStatus;
  evidence: string;
  reviewed_by: string;
  created_at: string;
  updated_at: string;
}
interface QaResponse {
  job_id: string;
  qa: QaRow | null;
  revision_status: RevisionStatus;
  issue_specific_qa_complete: boolean;
  production_approved: false;
  note: string;
}
interface GithubPull {
  number?: number;
  state?: string;
  draft?: boolean;
  head?: { ref?: string; sha?: string; repo?: { full_name?: string } };
  base?: { ref?: string; repo?: { full_name?: string } };
}

const REPOSITORY = "solopreneursid/yorpHives-2.0";
const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{40}$/i;
const valid = <T extends string>(value: unknown, choices: readonly T[]): value is T =>
  typeof value === "string" && choices.includes(value as T);

function pullNumber(url: string | null): number | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "github.com" ||
        parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) return null;
    const match = /^\/solopreneursid\/yorpHives-2\.0\/pull\/([1-9][0-9]*)\/?$/.exec(parsed.pathname);
    const result = match ? Number(match[1]) : null;
    return result && Number.isSafeInteger(result) ? result : null;
  } catch {
    return null;
  }
}

async function getJob(context: AdminRequestContext, jobId: string): Promise<RepairJob | null> {
  return context.env.DB!.prepare(
    "SELECT id,status,branch_name,pull_request_url FROM admin_repair_jobs WHERE id=? AND id!='github-permission-probe-singleton'"
  ).bind(jobId).first<RepairJob>();
}

async function githubHead(job: RepairJob): Promise<{ sha: string; number: number } | null> {
  const number = pullNumber(job.pull_request_url);
  if (!number || job.branch_name !== "build/agent/repair-" + job.id) return null;
  const response = await fetch("https://api.github.com/repos/" + REPOSITORY + "/pulls/" + number, {
    headers: {
      "accept": "application/vnd.github+json",
      "user-agent": "YorpHives-Headquarters-QA/1.0",
      "x-github-api-version": "2022-11-28"
    },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error("GitHub pull-request verification unavailable (HTTP " + response.status + ").");
  const pr = await response.json() as GithubPull;
  if (pr.number !== number || pr.head?.ref !== job.branch_name ||
      pr.head?.repo?.full_name !== REPOSITORY || pr.base?.repo?.full_name !== REPOSITORY ||
      !pr.base?.ref?.startsWith("build/headquarters-") ||
      pr.state !== "open" || !SHA.test(pr.head.sha || "")) {
    throw new Error("GitHub pull request no longer matches the authorized isolated repair branch.");
  }
  return { sha: pr.head.sha!.toLowerCase(), number };
}

function responseFor(jobId: string, qa: QaRow | null, head: { sha: string } | null): QaResponse {
  const revision_status: RevisionStatus = !qa ? "not_reviewed" :
    !head ? "unavailable" :
    qa.commit_sha.toLowerCase() === head.sha ? "current" : "changed";
  const issue_specific_qa_complete = revision_status === "current" &&
    qa?.reproduction_status === "reproduced" &&
    qa.fix_status === "passed" && qa.regression_status === "passed";
  return {
    job_id: jobId,
    qa,
    revision_status,
    issue_specific_qa_complete,
    production_approved: false,
    note: issue_specific_qa_complete
      ? "Issue-specific QA was recorded for the current PR revision. Independent release review and founder approval remain required."
      : "A repair cannot be marked resolved or released without current revision-specific QA evidence."
  };
}

function asMarkdown(data: QaResponse): Response {
  const qa = data.qa;
  const lines = [
    "# YorpHives repair quality review",
    "",
    "Repair: " + data.job_id,
    "Revision status: " + data.revision_status,
    "Issue-specific QA complete: " + (data.issue_specific_qa_complete ? "yes" : "no"),
    "Production approved: NO",
    "",
    ...(qa ? [
      "Reviewed commit: " + qa.commit_sha,
      "Reproduction: " + qa.reproduction_status,
      "Fix: " + qa.fix_status,
      "Regression: " + qa.regression_status,
      "Reviewed by: " + qa.reviewed_by,
      "Updated: " + qa.updated_at,
      "",
      "## Evidence",
      qa.evidence,
      ""
    ] : ["No recorded QA evidence.", ""]),
    data.note, ""
  ];
  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
  });
}

export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const jobId = new URL(context.request.url).searchParams.get("job_id") || "";
  if (!JOB_ID.test(jobId)) return adminJson({ error: { code: "INVALID_JOB", message: "A valid repair job ID is required." } }, 400);
  const job = await getJob(context, jobId);
  if (!job) return adminJson({ error: { code: "NOT_FOUND", message: "Repair job was not found." } }, 404);

  const hasSchema = await context.env.DB!.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='admin_repair_qa_reports'"
  ).first<{ name: string }>();
  if (!hasSchema) return adminJson({ error: { code: "QA_MIGRATION_REQUIRED", message: "Repair QA records require migration 0023." } }, 503);

  const qa = await context.env.DB!.prepare(
    "SELECT job_id,commit_sha,pr_number,reproduction_status,fix_status,regression_status,evidence,reviewed_by,created_at,updated_at " +
    "FROM admin_repair_qa_reports WHERE job_id=? ORDER BY updated_at DESC LIMIT 1"
  ).bind(jobId).first<QaRow>();

  let head: { sha: string } | null = null;
  if (qa && job.pull_request_url) {
    try { head = await githubHead(job); } catch { head = null; }
  }
  const data = responseFor(jobId, qa, head);
  return context.request.headers.get("accept")?.includes("text/markdown") ? asMarkdown(data) : adminJson(data);
}

export async function onRequestPost(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  if (context.request.headers.get("origin") !== new URL(context.request.url).origin) {
    return adminJson({ error: { code: "INVALID_ORIGIN", message: "QA reviews require a same-origin owner session." } }, 403);
  }
  if (!context.request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return adminJson({ error: { code: "INVALID_CONTENT_TYPE", message: "Expected application/json." } }, 415);
  }
  if (Number(context.request.headers.get("content-length") || 0) > 6000) {
    return adminJson({ error: { code: "TOO_LARGE", message: "QA evidence is too large." } }, 413);
  }
  const raw = await context.request.text();
  if (raw.length > 6000) return adminJson({ error: { code: "TOO_LARGE", message: "QA evidence is too large." } }, 413);
  let body: QaRequest | null = null;
  try { body = JSON.parse(raw) as QaRequest; } catch { /* Invalid JSON handled below. */ }
  const evidence = typeof body?.evidence === "string" ? body.evidence.trim() : "";
  if (!body || !JOB_ID.test(body.job_id || "") ||
      !valid(body.reproduction_status, ["reproduced", "not_reproduced"]) ||
      !valid(body.fix_status, ["passed", "failed", "inconclusive"]) ||
      !valid(body.regression_status, ["passed", "failed", "not_run"]) ||
      evidence.length < 30 || evidence.length > 3000 || evidence.includes("\0")) {
    return adminJson({ error: { code: "INVALID_QA_EVIDENCE", message: "Provide the repair ID, test results, and 30–3000 characters of evidence." } }, 400);
  }
  const job = await getJob(context, body.job_id!);
  if (!job) return adminJson({ error: { code: "NOT_FOUND", message: "Repair job was not found." } }, 404);
  if (job.status !== "needs_review") {
    return adminJson({ error: { code: "NOT_REVIEWABLE", message: "Only draft repairs awaiting owner review accept QA evidence." } }, 409);
  }
  const hasSchema = await context.env.DB!.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='admin_repair_qa_reports'"
  ).first<{ name: string }>();
  if (!hasSchema) return adminJson({ error: { code: "QA_MIGRATION_REQUIRED", message: "Repair QA records require migration 0023." } }, 503);

  let head: { sha: string; number: number } | null;
  try { head = await githubHead(job); } catch (error) {
    return adminJson({ error: { code: "GITHUB_VERIFICATION_FAILED",
      message: error instanceof Error ? error.message : "GitHub verification unavailable." } }, 503);
  }
  if (!head) return adminJson({ error: { code: "UNVERIFIED_BRANCH", message: "No authorized repair pull request exists." } }, 409);

  if (body.fix_status === "passed" && body.reproduction_status !== "reproduced") {
    return adminJson({ error: { code: "REPRODUCTION_REQUIRED", message: "A fix cannot pass before the original issue is reproduced." } }, 400);
  }

  const timestamp = new Date().toISOString();
  const insert = context.env.DB!.prepare(
    "INSERT INTO admin_repair_qa_reports(job_id,commit_sha,pr_number,reproduction_status,fix_status,regression_status,evidence,reviewed_by,created_at,updated_at) " +
    "VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(job_id,commit_sha) DO UPDATE SET " +
    "reproduction_status=excluded.reproduction_status,fix_status=excluded.fix_status,regression_status=excluded.regression_status," +
    "evidence=excluded.evidence,reviewed_by=excluded.reviewed_by,updated_at=excluded.updated_at"
  ).bind(job.id, head.sha, head.number, body.reproduction_status, body.fix_status, body.regression_status, evidence, identity.email, timestamp, timestamp);

  const audit = context.env.DB!.prepare(
    "INSERT INTO admin_audit_events(id,actor,action,resource_type,resource_id,details_json,created_at) VALUES (?,?,?,?,?,?,?)"
  ).bind(crypto.randomUUID(), identity.email, "repair_qa_reviewed", "repair_job", job.id,
    JSON.stringify({ commit_sha: head.sha, pr_number: head.number,
      reproduction_status: body.reproduction_status, fix_status: body.fix_status, regression_status: body.regression_status }), timestamp);
  await context.env.DB!.batch([insert, audit]);

  const qa = await context.env.DB!.prepare(
    "SELECT job_id,commit_sha,pr_number,reproduction_status,fix_status,regression_status,evidence,reviewed_by,created_at,updated_at " +
    "FROM admin_repair_qa_reports WHERE job_id=? AND commit_sha=?"
  ).bind(job.id, head.sha).first<QaRow>();
  return adminJson(responseFor(job.id, qa, head), 201);
}
