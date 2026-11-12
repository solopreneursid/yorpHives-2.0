import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";
import {
  validateOwnerDelegationInput, releaseEvidenceReady, verifyLiveRepairPR,
  OWNER_DELEGATION_EXECUTOR_ENABLED
} from "../../_lib/owner-delegation.js";

interface DelegationRequest {
  action: "deploy_verified_release";
  repair_job_id: string;
  commit_sha: string;
  preview_url: string;
  owner_note: string;
  checklist: Record<string, true>;
}
interface ReleaseJob {
  id: string;
  status: string;
  branch_name: string | null;
  pull_request_url: string | null;
  ci_sha: string | null;
  checks_json: string | null;
  qa_sha: string | null;
  reproduction_status: string | null;
  fix_status: string | null;
  regression_status: string | null;
}
interface DelegationRow {
  delegation_id: string;
  repair_job_id: string;
  action: string;
  commit_sha: string;
  pull_request_number: number;
  preview_url: string;
  state: string;
  requested_at: string;
  request_expires_at: string;
  authorized_at: string | null;
  authorization_expires_at: string | null;
  consumed_at: string | null;
}
const error = (code: string, message: string, status: number): Response =>
  adminJson({ error: { code, message }, execution_enabled: false }, status);

const releaseJob = (context: AdminRequestContext, id: string) => context.env.DB!.prepare(
  "SELECT j.id,j.status,j.branch_name,j.pull_request_url,c.commit_sha AS ci_sha,c.checks_json," +
  "q.commit_sha AS qa_sha,q.reproduction_status,q.fix_status,q.regression_status " +
  "FROM admin_repair_jobs j LEFT JOIN admin_repair_ci_verifications c ON c.job_id=j.id " +
  "LEFT JOIN admin_repair_qa_reports q ON q.job_id=j.id AND q.commit_sha=c.commit_sha WHERE j.id=?"
).bind(id).first<ReleaseJob>();

export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const migrated = await context.env.DB!.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='yorpmind_owner_delegations'"
  ).first<{ name: string }>();
  if (!migrated) return error("DELEGATION_MIGRATION_REQUIRED", "Private migration 0026 is required.", 503);

  const rows = await context.env.DB!.prepare(
    "SELECT delegation_id,repair_job_id,action,commit_sha,pull_request_number," +
    "preview_url,state,requested_at,request_expires_at,authorized_at,authorization_expires_at,consumed_at " +
    "FROM yorpmind_owner_delegations ORDER BY requested_at DESC LIMIT 20"
  ).all<DelegationRow>();
  return adminJson({
    name: "YorpMind",
    mechanism: "preview_review_then_owner_mfa_then_scoped_delegation",
    execution_enabled: OWNER_DELEGATION_EXECUTOR_ENABLED,
    mfa_endpoint: "/api/admin/step-up/owner-delegations",
    step_up_configured: Boolean(context.env.CF_ACCESS_STEP_UP_AUD &&
      context.env.CF_ACCESS_STEP_UP_MFA_POLICY_CONFIRMED === "yes" &&
      !(context.env.CF_ACCESS_AUD || "").split(",").map(value => value.trim())
        .includes(context.env.CF_ACCESS_STEP_UP_AUD.trim())),
    delegations: rows.results || []
  });
}

export async function onRequestPost(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const request = context.request;
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return error("ORIGIN_REQUIRED", "Prepare an authorization only through same-origin Headquarters.", 403);
  }
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return error("INVALID_TYPE", "Use application/json.", 415);
  }
  if (Number(request.headers.get("content-length") || 0) > 3600) {
    return error("TOO_LARGE", "Request body exceeds 3,600 bytes.", 413);
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 3600) {
    return error("TOO_LARGE", "Request body exceeds 3,600 bytes.", 413);
  }
  let body: unknown;
  try { body = JSON.parse(raw); }
  catch { return error("BAD_JSON", "Invalid JSON request.", 400); }
  const input = validateOwnerDelegationInput(body) as DelegationRequest | null;
  if (!input) return error("INVALID_REVIEW", "Exact repair SHA, approved preview URL, all six reviews and detailed owner notes are required.", 400);
  const db = context.env.DB!;
  const migrated = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='yorpmind_owner_delegations'"
  ).first<{ name: string }>();
  if (!migrated) return error("DELEGATION_MIGRATION_REQUIRED", "Private migration 0026 is required.", 503);

  const job = await releaseJob(context, input.repair_job_id);
  if (!releaseEvidenceReady(job, input.commit_sha)) {
    return error("RELEASE_NOT_VERIFIED", "Exact-commit CI and issue-specific QA must be complete before requesting MFA authorization.", 409);
  }
  let live;
  try { live = await verifyLiveRepairPR(job, input.commit_sha); }
  catch { return error("GITHUB_UNAVAILABLE", "GitHub PR head could not be verified.", 503); }
  if (!live) return error("STALE_REVISION", "Live GitHub PR no longer matches the exact reviewed CI commit.", 409);

  const createdAt = new Date();
  const requested = createdAt.toISOString();
  const expiry = new Date(createdAt.getTime() + 15 * 60 * 1000).toISOString();
  const id = crypto.randomUUID();
  try {
    await db.batch([
      db.prepare(
        "INSERT INTO yorpmind_owner_delegations(delegation_id,repair_job_id,action,target_environment," +
        "commit_sha,pull_request_number,preview_url,reviewed_preview_by,reviewed_preview_at," +
        "owner_checklist_json,owner_note,state,requested_at,request_expires_at) " +
        "VALUES(?,?,?,'production',?,?,?,?,?,?,?,'awaiting_mfa',?,?)"
      ).bind(id, input.repair_job_id, input.action, input.commit_sha, live.number,
        input.preview_url, identity.email, requested, JSON.stringify(input.checklist),
        input.owner_note, requested, expiry),
      db.prepare(
        "INSERT INTO admin_audit_events(id,actor,action,resource_type,resource_id,details_json,created_at) " +
        "VALUES(?,?,'yorpmind_owner_delegation_requested','delegated_admin',?,?,?)"
      ).bind(crypto.randomUUID(), identity.email, id,
        JSON.stringify({ job_id: input.repair_job_id, commit_sha: input.commit_sha,
          action: input.action, executor_enabled: false }), requested)
    ]);
  } catch {
    return error("ALREADY_REQUESTED", "This release commit already has a delegation request. Review its current state.", 409);
  }
  return adminJson({
    delegation_id: id,
    status: "awaiting_mfa",
    requested_at: requested,
    request_expires_at: expiry,
    step_up_url: "/api/admin/step-up/owner-delegations?id=" + encodeURIComponent(id),
    execution_enabled: false,
    production_deployed: false,
    note: "Open the secure Cloudflare Access MFA approval page. Never enter or share an OTP inside YorpMind."
  }, 201);
}
