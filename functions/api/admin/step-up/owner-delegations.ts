import {
  adminJson, isAdminResponse, requireOwnerStepUp, type AdminRequestContext
} from "../../../_lib/admin-auth";
import { releaseEvidenceReady, verifyLiveRepairPR, OWNER_DELEGATION_EXECUTOR_ENABLED } from "../../../_lib/owner-delegation.js";

interface DelegationRow {
  delegation_id: string;
  repair_job_id: string;
  action: "deploy_verified_release";
  commit_sha: string;
  pull_request_number: number;
  preview_url: string;
  reviewed_preview_by: string;
  owner_note: string;
  state: "awaiting_mfa" | "authorized" | "consumed" | "revoked";
  requested_at: string;
  request_expires_at: string;
  authorized_by: string | null;
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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const error = (code: string, message: string, status: number) =>
  adminJson({ error: { code, message }, execution_enabled: false }, status);
const escapeHtml = (text: unknown) => String(text ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function htmlPage(body: string, status = 200): Response {
  const html = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
    "<title>YorpMind · Owner MFA Authorization</title><style>" +
    "*{box-sizing:border-box}body{background:#070e1b;color:#e2e8f0;font-family:system-ui,sans-serif;" +
    "margin:0;padding:30px 16px;line-height:1.65}main{max-width:700px;margin:48px auto;" +
    "border:1px solid #334155;border-radius:14px;padding:25px;background:#101b2e}" +
    "h1{letter-spacing:-.04em;margin:0 0 15px}p{color:#bbcadb}strong{color:#e0fbff}" +
    ".badge{color:#7dd3fc;font-size:12px;letter-spacing:.1em;font-weight:700}" +
    ".notice{border:1px solid #7c5d36;padding:13px;border-radius:9px;color:#fce6bc;background:#2d2419}" +
    "label{display:block;margin-top:14px}textarea{display:block;width:100%;padding:12px;min-height:104px;" +
    "border:1px solid #4b647a;border-radius:8px;background:#0b1626;color:#fff;font:inherit}" +
    "button{background:#0891b2;border:0;border-radius:8px;padding:13px 16px;color:#fff;font-weight:700;" +
    "cursor:pointer;margin-top:18px}a{color:#67e8f9}code{overflow-wrap:anywhere}" +
    "</style></head><body><main>" + body + "</main></body></html>";
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
    }
  });
}

const readDelegation = (context: AdminRequestContext, id: string) => context.env.DB!.prepare(
  "SELECT delegation_id,repair_job_id,action,commit_sha,pull_request_number," +
  "preview_url,reviewed_preview_by,owner_note,state,requested_at,request_expires_at,authorized_by " +
  "FROM yorpmind_owner_delegations WHERE delegation_id=?"
).bind(id).first<DelegationRow>();

const readJob = (context: AdminRequestContext, id: string) => context.env.DB!.prepare(
  "SELECT j.id,j.status,j.branch_name,j.pull_request_url,c.commit_sha AS ci_sha,c.checks_json," +
  "q.commit_sha AS qa_sha,q.reproduction_status,q.fix_status,q.regression_status " +
  "FROM admin_repair_jobs j LEFT JOIN admin_repair_ci_verifications c ON c.job_id=j.id " +
  "LEFT JOIN admin_repair_qa_reports q ON q.job_id=j.id AND q.commit_sha=c.commit_sha WHERE j.id=?"
).bind(id).first<ReleaseJob>();

async function authorize(context: AdminRequestContext, id: string, actor: string, note: string) {
  const delegation = await readDelegation(context, id);
  if (!delegation) return error("NOT_FOUND", "Release authorization request not found.", 404);
  const now = new Date();
  if (delegation.state !== "awaiting_mfa" ||
      delegation.request_expires_at <= now.toISOString() ||
      delegation.reviewed_preview_by !== actor || delegation.action !== "deploy_verified_release") {
    return error("AUTHORIZATION_EXPIRED", "This owner authorization is no longer eligible.", 409);
  }
  const job = await readJob(context, delegation.repair_job_id);
  if (!releaseEvidenceReady(job, delegation.commit_sha)) {
    return error("REVISION_NOT_READY", "The reviewed CI and QA records are missing or no longer match.", 409);
  }
  let pr;
  try { pr = await verifyLiveRepairPR(job, delegation.commit_sha); }
  catch { return error("GITHUB_UNAVAILABLE", "Live GitHub release verification failed.", 503); }
  if (!pr || pr.number !== delegation.pull_request_number) {
    return error("REVISION_CHANGED", "The current GitHub PR is no longer the reviewed revision.", 409);
  }
  const expires = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  const db = context.env.DB!;
  const [result] = await db.batch([
    db.prepare(
      "UPDATE yorpmind_owner_delegations SET state='authorized',authorized_by=?," +
      "authorized_at=?,authorization_expires_at=? " +
      "WHERE delegation_id=? AND state='awaiting_mfa' AND request_expires_at>? AND reviewed_preview_by=?"
    ).bind(actor, now.toISOString(), expires, id, now.toISOString(), actor),
    db.prepare(
      "INSERT INTO admin_audit_events(id,actor,action,resource_type,resource_id,details_json,created_at) " +
      "SELECT ?,?,'yorpmind_owner_mfa_authorization','delegated_admin',?,?,? " +
      "WHERE EXISTS(SELECT 1 FROM yorpmind_owner_delegations WHERE delegation_id=? " +
      "AND state='authorized' AND authorized_by=? AND authorized_at=?)"
    ).bind(crypto.randomUUID(), actor, id,
      JSON.stringify({ commit_sha: delegation.commit_sha, action: delegation.action,
        execution_enabled: OWNER_DELEGATION_EXECUTOR_ENABLED, owner_note: note }),
      now.toISOString(), id, actor, now.toISOString())
  ]);
  if (Number(result?.meta?.changes || 0) !== 1) {
    return error("ALREADY_AUTHORIZED", "Authorization was already completed or expired.", 409);
  }
  return adminJson({
    success: true,
    delegation_id: id,
    authorized_revision: delegation.commit_sha,
    operation: delegation.action,
    scope: "exact_reviewed_release_only",
    authorization_expires_at: expires,
    execution_enabled: OWNER_DELEGATION_EXECUTOR_ENABLED,
    production_deployed: false,
    note: "Fresh MFA authorized only this reviewed operation. Production executor is not connected; no release was performed."
  });
}

export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const identity = await requireOwnerStepUp(context);
  if (isAdminResponse(identity)) return identity;
  const id = new URL(context.request.url).searchParams.get("id") || "";
  if (!UUID.test(id)) return error("INVALID_ID", "Valid release authorization ID required.", 400);
  const delegation = await readDelegation(context, id);
  if (!delegation) return error("NOT_FOUND", "Release request was not found.", 404);
  if (delegation.reviewed_preview_by !== identity.email) {
    return error("OWNER_MISMATCH", "The same founder who reviewed the preview must authorize the release.", 403);
  }
  const now = new Date().toISOString();
  const canApprove = delegation.state === "awaiting_mfa" && delegation.request_expires_at > now;
  const markup = "<span class=\"badge\">YORPMIND · SECURE FOUNDER APPROVAL</span>" +
    "<h1>Verify this exact release</h1>" +
    "<p>You've completed the Cloudflare Access step-up sign-in. The OTP was verified by Cloudflare, not provided to YorpMind.</p>" +
    "<p><strong>Reviewed preview:</strong> <a target=\"_blank\" rel=\"noopener noreferrer\" href=\"" +
    escapeHtml(delegation.preview_url) + "\">" + escapeHtml(delegation.preview_url) + "</a></p>" +
    "<p><strong>Repair:</strong> <code>" + escapeHtml(delegation.repair_job_id) + "</code><br>" +
    "<strong>GitHub PR:</strong> #" + delegation.pull_request_number + "<br>" +
    "<strong>Commit:</strong> <code>" + escapeHtml(delegation.commit_sha) + "</code><br>" +
    "<strong>Requested by:</strong> " + escapeHtml(delegation.reviewed_preview_by) + "<br>" +
    "<strong>Review expires:</strong> " + escapeHtml(delegation.request_expires_at) + "</p>" +
    "<p class=\"notice\">This approval is single-operation and expires quickly. The production executor remains disabled until independently released and audited. No admin credentials or OTP are shared with agents.</p>" +
    (canApprove
      ? "<form method=\"post\" action=\"/api/admin/step-up/owner-delegations?id=" + encodeURIComponent(id) + "\">" +
        "<input type=\"hidden\" name=\"delegation_id\" value=\"" + escapeHtml(id) + "\">" +
        "<label><input type=\"checkbox\" name=\"confirm\" value=\"yes\" required> " +
        "I approve only this exact reviewed commit and operation.</label>" +
        "<label>Authorization reason (40–1000 characters)<textarea name=\"reason\" minlength=\"40\" maxlength=\"1000\" required></textarea></label>" +
        "<button type=\"submit\">Authorize this reviewed release</button></form>"
      : "<p><strong>This authorization is unavailable:</strong> " + escapeHtml(delegation.state) + "</p>") +
    "<p><a href=\"/admin/\">Return to Headquarters</a></p>";
  return htmlPage(markup);
}

export async function onRequestPost(context: AdminRequestContext): Promise<Response> {
  const identity = await requireOwnerStepUp(context);
  if (isAdminResponse(identity)) return identity;
  if (context.request.headers.get("origin") !== new URL(context.request.url).origin) {
    return error("INVALID_ORIGIN", "Secure authorization requires same-origin interaction.", 403);
  }
  if (context.request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/x-www-form-urlencoded") {
    return error("INVALID_FORM", "Use the Cloudflare Access protected owner confirmation form.", 415);
  }
  if (Number(context.request.headers.get("content-length") || 0) > 1800) {
    return error("TOO_LARGE", "Owner confirmation form too large.", 413);
  }
  const body = await context.request.text();
  if (new TextEncoder().encode(body).length > 1800) return error("TOO_LARGE", "Owner confirmation form too large.", 413);
  const form = new URLSearchParams(body);
  const id = new URL(context.request.url).searchParams.get("id") || "";
  const note = (form.get("reason") || "").trim();
  if (!UUID.test(id) || form.getAll("delegation_id").length !== 1 ||
      form.get("delegation_id") !== id || form.get("confirm") !== "yes" ||
      form.getAll("confirm").length !== 1 || form.getAll("reason").length !== 1 ||
      note.length < 40 || note.length > 1000 || note.includes("\0")) {
    return error("INVALID_CONFIRMATION", "Choose the exact operation and enter a detailed approval reason.", 400);
  }
  const result = await authorize(context, id, identity.email, note);
  if (context.request.headers.get("accept")?.includes("application/json")) return result;
  const data = await result.json() as { success?: boolean; error?: { message: string } };
  return htmlPage(data.success
    ? "<span class=\"badge\">OWNER MFA VERIFIED</span><h1>Scoped approval recorded</h1>" +
      "<p>Authorization covers the reviewed commit only. This does not mean production has been deployed.</p>" +
      "<p class=\"notice\">Execution is still disabled until the separate production executor passes independent security and deployment tests.</p>" +
      "<p><a href=\"/admin/\">Return to Headquarters</a></p>"
    : "<h1>Authorization blocked</h1><p>" + escapeHtml(data.error?.message) + "</p>" +
      "<p><a href=\"/admin/\">Return to Headquarters</a></p>",
    result.status);
}
