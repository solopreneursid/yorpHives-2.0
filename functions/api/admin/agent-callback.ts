import { adminJson, type AdminRequestContext } from "../../_lib/admin-auth";

interface AgentCallbackEnv { ADMIN_AGENT_WEBHOOK_TOKEN?: string; }
interface AgentCallbackPayload {
  job_id?: string;
  status?: "running" | "needs_review" | "completed" | "failed";
  agent_name?: string;
  branch_name?: string;
  pull_request_url?: string;
  result_summary?: string;
}
const timestamp = () => new Date().toISOString();
const validBranch = (value: string) => /^(agent|repair)\/[a-z0-9._/-]{1,180}$/.test(value);
const validPullRequest = (value: string) => /^https:\/\/github\.com\/solopreneursid\/yorpHives-2\.0\/pull\/[1-9][0-9]*$/.test(value);

export async function onRequestPost(context: AdminRequestContext & { env: AdminRequestContext["env"] & AgentCallbackEnv }): Promise<Response> {
  const expected = context.env.ADMIN_AGENT_WEBHOOK_TOKEN;
  const supplied = (context.request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || !supplied || supplied !== expected) return adminJson({ error: { code: "UNAUTHORIZED_AGENT", message: "A valid agent callback token is required." } }, 401);
  if (!context.request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return adminJson({ error: { code: "INVALID_CONTENT_TYPE", message: "A JSON request body is required." } }, 415);
  const body = await context.request.json().catch(() => null) as AgentCallbackPayload | null;
  if (!body?.job_id || !body.status) return adminJson({ error: { code: "INVALID_CALLBACK", message: "job_id and status are required." } }, 400);
  if (!["running","needs_review","completed","failed"].includes(body.status)) return adminJson({ error: { code: "INVALID_STATUS", message: "Unsupported agent job status." } }, 400);
  if (body.branch_name && !validBranch(body.branch_name)) return adminJson({ error: { code: "INVALID_BRANCH", message: "Agent branches must use agent/ or repair/ prefixes." } }, 400);
  if (body.pull_request_url && !validPullRequest(body.pull_request_url)) return adminJson({ error: { code: "INVALID_PULL_REQUEST", message: "Only pull requests in the YorpHives repository are accepted." } }, 400);
  const db = context.env.DB!;
  const existing = await db.prepare("SELECT id,status FROM admin_repair_jobs WHERE id=?").bind(body.job_id).first<{id:string;status:string}>();
  if (!existing) return adminJson({ error: { code: "JOB_NOT_FOUND", message: "Repair job was not found." } }, 404);
  const updatedAt = timestamp();
  const completedAt = ["completed","failed"].includes(body.status) ? updatedAt : null;
  await db.prepare(`UPDATE admin_repair_jobs SET status=?,agent_name=COALESCE(?,agent_name),branch_name=COALESCE(?,branch_name),
    pull_request_url=COALESCE(?,pull_request_url),result_summary=COALESCE(?,result_summary),updated_at=?,completed_at=COALESCE(?,completed_at) WHERE id=?`)
    .bind(body.status, body.agent_name?.slice(0,100) || null, body.branch_name || null, body.pull_request_url || null,
      body.result_summary?.slice(0,4000) || null, updatedAt, completedAt, body.job_id).run();
  await db.prepare("INSERT INTO admin_audit_events (id,actor,action,resource_type,resource_id,details_json,created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),"agent-webhook","agent_status_updated","repair_job",body.job_id,
      JSON.stringify({status:body.status,branch_name:body.branch_name || null,pull_request_url:body.pull_request_url || null}),updatedAt).run();
  return adminJson({ success: true, job_id: body.job_id, status: body.status });
}
