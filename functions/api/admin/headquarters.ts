import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";
import {
  headquartersResponse, headquartersSnapshot, mutationGuard, readBoundedJson,
  validMission, uuidPattern, type Mission, type CancelMissionRequest, type MissionMutationResponse
} from "../../_lib/headquarters";

interface MissionService {
  fetch(request: Request): Promise<Response>;
}
type MissionEnvironment = AdminRequestContext["env"] & {
  HQ_ENGINE_SERVICE?: MissionService;
};
interface MissionContext extends AdminRequestContext {
  env: MissionEnvironment;
}
interface DispatchMissionRequest {
  job_id: string;
  action: "dispatch";
  expected_updated_at: string;
}
interface AgentMission {
  job_id: string;
  status: string;
  created_by: string;
  agent_id: string | null;
  autonomy_level: string;
  agent_status: string;
  enabled: number;
}
interface MissionEngineHealth {
  ready?: boolean;
  mode?: string;
  engine?: string;
}
interface MissionDispatchResponse {
  success: boolean;
  job_id: string;
  status: "queued";
  workflow_id: string;
  message: string;
}
const MAX_ACTIVE = 3;
function validAction(value: unknown): value is CancelMissionRequest | DispatchMissionRequest {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (v.action === "cancel" || v.action === "dispatch") &&
    typeof v.job_id === "string" && uuidPattern.test(v.job_id) &&
    typeof v.expected_updated_at === "string" &&
    v.expected_updated_at.length > 0 && v.expected_updated_at.length <= 40;
}
async function markDispatchFailure(context: MissionContext, jobId: string, error: string): Promise<void> {
  await context.env.DB!.prepare(
    "UPDATE agent_jobs SET status='failed',result_json=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')," +
    "completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE job_id=? AND job_type='owner_mission' AND status='queued'"
  ).bind(JSON.stringify({ error: error.slice(0, 300), verified: false }), jobId).run();
}
export async function onRequestGet(context: MissionContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  return headquartersResponse(context.request, await headquartersSnapshot(context.env.DB!, Boolean(context.env.HQ_ENGINE_SERVICE)));
}
export async function onRequestPost(context: MissionContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const blocked = mutationGuard(context.request);
  if (blocked) return blocked;
  let body: unknown;
  try { body = await readBoundedJson(context.request); }
  catch { return adminJson({ error: { message: "Provide valid JSON no larger than 24 KB." } }, 400); }
  if (!validMission(body)) return adminJson({ error: { message: "Provide a UUID, title (3–160 characters), brief (10–4000 characters), specialist and valid priority." } }, 400);
  const db = context.env.DB!;
  const agent = await db.prepare("SELECT agent_id FROM agent_registry WHERE agent_id=?").bind(body.agent_id).first<{ agent_id: string }>();
  if (!agent) return adminJson({ error: { message: "Specialist not found." } }, 404);
  const title = body.title.trim(), brief = body.request_summary.trim();
  const result = await db.prepare(
    "INSERT INTO agent_jobs (job_id,agent_id,job_type,title,request_summary,status,priority,created_by) " +
    "VALUES (?,?,'owner_mission',?,?,'planned',?,?) ON CONFLICT(job_id) DO NOTHING"
  ).bind(body.job_id, body.agent_id, title, brief, body.priority, identity.email).run();
  const saved = await db.prepare(
    "SELECT title,request_summary,agent_id,priority,status,created_by FROM agent_jobs WHERE job_id=?"
  ).bind(body.job_id).first<Mission & { created_by: string }>();
  if (!saved || saved.title !== title || saved.request_summary !== brief || saved.agent_id !== body.agent_id ||
    saved.priority !== body.priority || saved.created_by !== identity.email)
    return adminJson({ error: { message: "This request ID already belongs to another mission." } }, 409);
  const response: MissionMutationResponse = { success: true, job_id: body.job_id, status: saved.status, replayed: result.meta?.changes === 0 };
  return adminJson(response, response.replayed ? 200 : 201);
}
export async function onRequestPatch(context: MissionContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const blocked = mutationGuard(context.request);
  if (blocked) return blocked;
  let body: unknown;
  try { body = await readBoundedJson(context.request); }
  catch { return adminJson({ error: { message: "Provide valid bounded JSON." } }, 400); }
  if (!validAction(body)) return adminJson({ error: { message: "Provide a valid mission ID, current timestamp and supported action." } }, 400);
  const db = context.env.DB!;
  if (body.action === "cancel") {
    const result = await db.prepare(
      "UPDATE agent_jobs SET status='cancelled',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')," +
      "completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') " +
      "WHERE job_id=? AND updated_at=? AND status='planned' AND job_type='owner_mission' AND created_by=?"
    ).bind(body.job_id, body.expected_updated_at, identity.email).run();
    if (!result.meta?.changes) return adminJson({ error: { message: "Mission changed, is not yours, or is no longer planned. Refresh and try again." } }, 409);
    const response: MissionMutationResponse = { success: true, job_id: body.job_id, status: "cancelled" };
    return adminJson(response);
  }
  const engine = context.env.HQ_ENGINE_SERVICE;
  if (!engine) return adminJson({ error: { message: "This environment has no private mission engine configured." } }, 503);
  const job = await db.prepare(
    "SELECT j.job_id,j.status,j.created_by,j.agent_id,a.autonomy_level,a.status AS agent_status,a.enabled " +
    "FROM agent_jobs j JOIN agent_registry a ON a.agent_id=j.agent_id WHERE j.job_id=? AND j.job_type='owner_mission'"
  ).bind(body.job_id).first<AgentMission>();
  if (!job || job.created_by !== identity.email || job.status !== "planned") return adminJson({ error: { message: "Only your planned missions can be started." } }, 409);
  if (job.autonomy_level !== "recommend" || job.enabled !== 1 || job.agent_status !== "ready")
    return adminJson({ error: { message: "This specialist is not enabled for safe recommendation briefs." } }, 409);
  const active = await db.prepare(
    "SELECT COUNT(*) AS count FROM agent_jobs WHERE job_type='owner_mission' AND status IN ('queued','running')"
  ).first<{ count: number }>();
  if (Number(active?.count || 0) >= MAX_ACTIVE)
    return adminJson({ error: { message: "The mission engine is at capacity (3 active jobs). Review running missions first." } }, 429);
  let available = false;
  try {
    const health = await engine.fetch(new Request("https://hq-engine.internal/health", { method: "GET" }));
    const data = await health.json().catch(() => null) as MissionEngineHealth | null;
    available = health.ok && data?.ready === true && data.mode === "bounded_recommendation";
  } catch { available = false; }
  if (!available) return adminJson({ error: { message: "Mission engine is not healthy. No credits were spent and the mission remains planned." } }, 503);
  const updated = await db.prepare(
    "UPDATE agent_jobs SET status='queued',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') " +
    "WHERE job_id=? AND updated_at=? AND status='planned' AND job_type='owner_mission' AND created_by=?"
  ).bind(body.job_id, body.expected_updated_at, identity.email).run();
  if (updated.meta?.changes !== 1) return adminJson({ error: { message: "Mission changed while starting. Refresh and try again." } }, 409);
  try {
    const dispatched = await engine.fetch(new Request("https://hq-engine.internal/missions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "mission_brief", job_id: body.job_id })
    }));
    const receipt = await dispatched.json().catch(() => null) as { workflow_id?: string; error?: string } | null;
    if (dispatched.status !== 202 || !receipt?.workflow_id) throw new Error(receipt?.error || "Engine rejected the mission dispatch.");
    const response: MissionDispatchResponse = {
      success: true, job_id: body.job_id, status: "queued", workflow_id: receipt.workflow_id,
      message: "Bounded AI brief queued. It will require owner review and independent fact verification."
    };
    return adminJson(response, 202);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Mission could not be dispatched.";
    await markDispatchFailure(context, body.job_id, detail);
    return adminJson({ error: { message: "Mission dispatch failed. No release or financial action occurred. " + detail.slice(0, 160) } }, 502);
  }
}
