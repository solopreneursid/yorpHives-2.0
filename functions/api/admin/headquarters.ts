import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";
import { headquartersResponse, headquartersSnapshot, mutationGuard, readBoundedJson, validMission, uuidPattern, type Mission, type CancelMissionRequest, type MissionMutationResponse } from "../../_lib/headquarters";
export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  return headquartersResponse(context.request, await headquartersSnapshot(context.env.DB!));
}
export async function onRequestPost(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const blocked = mutationGuard(context.request);
  if (blocked) return blocked;
  let body: unknown;
  try { body = await readBoundedJson(context.request); } catch { return adminJson({ error: { message: "Provide valid JSON no larger than 24 KB." } }, 400); }
  if (!validMission(body)) return adminJson({ error: { message: "Provide a UUID, title (3–160 characters), brief (10–4000 characters), specialist and valid priority." } }, 400);
  const db = context.env.DB!;
  const agent = await db.prepare("SELECT agent_id FROM agent_registry WHERE agent_id=?").bind(body.agent_id).first<{ agent_id: string }>();
  if (!agent) return adminJson({ error: { message: "Specialist not found." } }, 404);
  const title = body.title.trim(), brief = body.request_summary.trim();
  const result = await db.prepare("INSERT INTO agent_jobs (job_id,agent_id,job_type,title,request_summary,status,priority,created_by) VALUES (?,?,'owner_mission',?,?,'planned',?,?) ON CONFLICT(job_id) DO NOTHING")
    .bind(body.job_id, body.agent_id, title, brief, body.priority, identity.email).run();
  const saved = await db.prepare("SELECT title,request_summary,agent_id,priority,status,created_by FROM agent_jobs WHERE job_id=?").bind(body.job_id).first<Mission & { created_by: string }>();
  if (!saved || saved.title !== title || saved.request_summary !== brief || saved.agent_id !== body.agent_id || saved.priority !== body.priority || saved.created_by !== identity.email) return adminJson({ error: { message: "This request ID already belongs to another mission." } }, 409);
  const response: MissionMutationResponse = { success: true, job_id: body.job_id, status: saved.status, replayed: result.meta?.changes === 0 };
  return adminJson(response, response.replayed ? 200 : 201);
}
export async function onRequestPatch(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const blocked = mutationGuard(context.request);
  if (blocked) return blocked;
  let body: CancelMissionRequest;
  try { body = await readBoundedJson(context.request) as CancelMissionRequest; } catch { return adminJson({ error: { message: "Provide valid bounded JSON." } }, 400); }
  if (!body || body.action !== "cancel" || typeof body.job_id !== "string" || !uuidPattern.test(body.job_id) || typeof body.expected_updated_at !== "string" || body.expected_updated_at.length > 40) return adminJson({ error: { message: "Provide the mission ID, current timestamp and cancel action." } }, 400);
  const result = await context.env.DB!.prepare("UPDATE agent_jobs SET status='cancelled',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE job_id=? AND updated_at=? AND status='planned' AND job_type='owner_mission' AND created_by=?")
    .bind(body.job_id, body.expected_updated_at, identity.email).run();
  if (!result.meta?.changes) return adminJson({ error: { message: "Mission changed, is not yours, or is no longer planned. Refresh and try again." } }, 409);
  const response: MissionMutationResponse = { success: true, job_id: body.job_id, status: "cancelled" };
  return adminJson(response);
}
