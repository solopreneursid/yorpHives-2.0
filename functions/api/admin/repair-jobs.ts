import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";

interface AgentService {
  fetch(request: Request): Promise<Response>;
}
interface RepairEnv {
  ADMIN_AGENT_SERVICE?: AgentService;
}
interface RepairJobRow {
  id: string;
  finding_id: string | null;
  requested_by: string;
  request_text: string;
  status: string;
  agent_name: string | null;
  branch_name: string | null;
  pull_request_url: string | null;
  result_summary: string | null;
  created_at: string;
  updated_at: string;
}
interface CreateRepairJobRequest {
  finding_id?: string | null;
  request_text?: string;
}
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
  const configured = Boolean((context.env as RepairEnv).ADMIN_AGENT_SERVICE);
  return adminJson({ data: result.results, agentConfigured: configured });
}

export async function onRequestPost(context: AdminRequestContext & { env: AdminRequestContext["env"] & RepairEnv }): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const origin = context.request.headers.get("origin");
  if (!origin || origin !== new URL(context.request.url).origin) {
    return adminJson({ error: { code: "INVALID_ORIGIN", message: "Admin actions must originate from this site." } }, 403);
  }
  if (!context.request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return adminJson({ error: { code: "INVALID_CONTENT_TYPE", message: "A JSON request body is required." } }, 415);
  }

  const body = await context.request.json().catch(() => null) as CreateRepairJobRequest | null;
  const requestText = (body?.request_text || "").trim();
  if (!requestText || requestText.length > 4000) {
    return adminJson({ error: { code: "INVALID_REQUEST", message: "Describe the repair in 1–4000 characters." } }, 400);
  }
  const findingId = body?.finding_id || null;
  if (findingId) {
    const finding = await context.env.DB!.prepare("SELECT id FROM admin_findings WHERE id = ?").bind(findingId).first<{ id: string }>();
    if (!finding) return adminJson({ error: { code: "FINDING_NOT_FOUND", message: "The selected finding does not exist." } }, 404);
  }

  const agent = context.env.ADMIN_AGENT_SERVICE;
  if (!agent) {
    return adminJson({ error: { code: "AGENT_NOT_CONFIGURED", message: "The isolated repair workflow service binding is not configured." } }, 503);
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = await context.env.DB!.prepare(
    "SELECT COUNT(*) AS count FROM admin_repair_jobs WHERE created_at >= ?"
  ).bind(cutoff).first<{ count: number }>();
  if ((recent?.count || 0) >= 2) {
    return adminJson({ error: { code: "AGENT_DAILY_LIMIT", message: "The staging repair agent is limited to two jobs per 24 hours to protect the free inference allowance." } }, 429);
  }

  const jobId = id();
  const timestamp = now();
  await context.env.DB!.prepare(
    "INSERT INTO admin_repair_jobs (id,finding_id,requested_by,request_text,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)"
  ).bind(jobId, findingId, identity.email, requestText, "queued", timestamp, timestamp).run();
  await audit(context, identity.email, "repair_requested", jobId, { finding_id: findingId, request_text: requestText });

  try {
    const dispatch = await agent.fetch(new Request("https://admin-agent.internal/instances", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        job_id: jobId,
        finding_id: findingId,
        requested_by: identity.email,
        request_text: requestText,
        repository: "solopreneursid/yorpHives-2.0",
        base_branch: "build/yorphives-admin-reliability"
      })
    }));
    const result = await dispatch.json().catch(() => null) as { id?: string; status?: string; error?: string } | null;
    if (!dispatch.ok || !result?.id) throw new Error(result?.error || "The repair workflow could not be started.");

    await context.env.DB!.prepare("UPDATE admin_repair_jobs SET status='dispatched',result_summary=?,updated_at=? WHERE id=?")
      .bind("Durable Cloudflare repair workflow accepted. The agent is preparing an isolated branch and CI-verified draft PR.", now(), jobId).run();
    await audit(context, identity.email, "repair_dispatched", jobId, { workflow_instance_id: result.id });
    return adminJson({ job: { id: jobId, status: "dispatched" }, dispatched: true }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Repair workflow dispatch failed.";
    await context.env.DB!.prepare("UPDATE admin_repair_jobs SET status='failed',result_summary=?,updated_at=? WHERE id=?")
      .bind(message.slice(0, 3500), now(), jobId).run();
    await audit(context, identity.email, "repair_dispatch_failed", jobId, {});
    return adminJson({ job: { id: jobId, status: "failed" }, dispatched: false, message: "The request was saved, but the repair workflow could not be started." }, 202);
  }
}
