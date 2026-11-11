import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";

interface RepairEnv {
  ADMIN_AGENT_WEBHOOK_URL?: string;
  ADMIN_AGENT_WEBHOOK_TOKEN?: string;
}
interface RepairJobRow {
  id: string; finding_id: string | null; requested_by: string; request_text: string; status: string;
  agent_name: string | null; branch_name: string | null; pull_request_url: string | null;
  result_summary: string | null; created_at: string; updated_at: string;
}
interface CreateRepairJobRequest { finding_id?: string | null; request_text?: string; }
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
async function audit(context: AdminRequestContext, actor: string, action: string, resourceId: string, details: Record<string, unknown>) {
  await context.env.DB!.prepare(
    "INSERT INTO admin_audit_events (id,actor,action,resource_type,resource_id,details_json,created_at) VALUES (?,?,?,?,?,?,?)"
  ).bind(id(), actor, action, "repair_job", resourceId, JSON.stringify(details), now()).run();
}
export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const result = await context.env.DB!.prepare(
    "SELECT id,finding_id,requested_by,request_text,status,agent_name,branch_name,pull_request_url,result_summary,created_at,updated_at FROM admin_repair_jobs ORDER BY created_at DESC LIMIT 50"
  ).all<RepairJobRow>();
  return adminJson({ data: result.results, agentConfigured: Boolean((context.env as RepairEnv).ADMIN_AGENT_WEBHOOK_URL && (context.env as RepairEnv).ADMIN_AGENT_WEBHOOK_TOKEN) });
}
export async function onRequestPost(context: AdminRequestContext & { env: AdminRequestContext["env"] & RepairEnv }): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const origin = context.request.headers.get("origin");
  if (!origin || origin !== new URL(context.request.url).origin) return adminJson({ error: { code: "INVALID_ORIGIN", message: "Admin actions must originate from this site." } }, 403);
  if (!context.request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return adminJson({ error: { code: "INVALID_CONTENT_TYPE", message: "A JSON request body is required." } }, 415);
  const body = await context.request.json().catch(() => null) as CreateRepairJobRequest | null;
  const requestText = (body?.request_text || "").trim();
  if (!requestText || requestText.length > 4000) return adminJson({ error: { code: "INVALID_REQUEST", message: "Describe the repair in 1–4000 characters." } }, 400);
  const findingId = body?.finding_id || null;
  if (findingId) {
    const finding = await context.env.DB!.prepare("SELECT id FROM admin_findings WHERE id = ?").bind(findingId).first<{ id: string }>();
    if (!finding) return adminJson({ error: { code: "FINDING_NOT_FOUND", message: "The selected finding does not exist." } }, 404);
  }
  const jobId = id();
  const timestamp = now();
  await context.env.DB!.prepare(
    "INSERT INTO admin_repair_jobs (id,finding_id,requested_by,request_text,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)"
  ).bind(jobId, findingId, identity.email, requestText, "queued", timestamp, timestamp).run();
  await audit(context, identity.email, "repair_requested", jobId, { finding_id: findingId, request_text: requestText });
  const webhook = context.env.ADMIN_AGENT_WEBHOOK_URL;
  const secret = context.env.ADMIN_AGENT_WEBHOOK_TOKEN;
  if (!webhook || !secret) return adminJson({ job: { id: jobId, status: "queued" }, dispatched: false, message: "Repair request safely queued. Configure an agent webhook to enable autonomous execution." }, 202);
  try {
    const dispatch = await fetch(webhook, {
      method: "POST",
      headers: { authorization: "Bearer " + secret, "content-type": "application/json" },
      body: JSON.stringify({
        event: "yorphives.admin.repair.requested", job_id: jobId, finding_id: findingId,
        callback_url: new URL("/api/admin/agent-callback", context.request.url).toString(),
        requested_by: identity.email, request_text: requestText,
        repository: "solopreneursid/yorpHives-2.0", base_branch: "build/yorphives-admin-reliability",
        required_controls: ["isolated_branch", "tests", "security_scan", "preview_deployment", "pull_request_only", "no_production_deploy"]
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (!dispatch.ok) throw new Error("Agent webhook returned HTTP " + dispatch.status);
    await context.env.DB!.prepare("UPDATE admin_repair_jobs SET status='dispatched',dispatched_at=?,updated_at=? WHERE id=?")
      .bind(now(), now(), jobId).run();
    await audit(context, identity.email, "repair_dispatched", jobId, { status: dispatch.status });
    return adminJson({ job: { id: jobId, status: "dispatched" }, dispatched: true }, 202);
  } catch (error) {
    await context.env.DB!.prepare("UPDATE admin_repair_jobs SET status='failed',result_summary=?,updated_at=? WHERE id=?")
      .bind(error instanceof Error ? error.message : "Agent dispatch failed.", now(), jobId).run();
    await audit(context, identity.email, "repair_dispatch_failed", jobId, {});
    return adminJson({ job: { id: jobId, status: "failed" }, dispatched: false, message: "The request was saved, but the agent could not be reached." }, 202);
  }
}
