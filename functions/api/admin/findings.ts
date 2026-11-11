import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";
interface FindingRow {
  id: string; severity: string; title: string; details: string; status: string;
  first_detected: string; last_verified: string; resolved_at: string | null;
  monitor_name: string | null; monitor_url: string | null; environment: string | null;
}
export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const status = new URL(context.request.url).searchParams.get("status") || "active";
  if (!["active", "all", "resolved"].includes(status)) return adminJson({ error: { code: "INVALID_STATUS", message: "Status must be active, all, or resolved." } }, 400);
  const where = status === "active" ? "WHERE f.status IN ('open', 'investigating', 'awaiting_approval')" : status === "resolved" ? "WHERE f.status IN ('fixed', 'verified', 'accepted_risk')" : "";
  const result = await context.env.DB!.prepare(`
    SELECT f.id, f.severity, f.title, f.details, f.status, f.first_detected, f.last_verified, f.resolved_at,
      m.name AS monitor_name, m.url AS monitor_url, m.environment
    FROM admin_findings f LEFT JOIN admin_monitors m ON m.id = f.monitor_id
    ${where}
    ORDER BY CASE f.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
      f.last_verified DESC LIMIT 100
  `).all<FindingRow>();
  return adminJson({ data: result.results });
}


interface FindingActionRequest { id?: string; status?: "open" | "investigating" | "accepted_risk"; }
export async function onRequestPatch(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const origin = context.request.headers.get("origin");
  if (!origin || origin !== new URL(context.request.url).origin) return adminJson({ error: { code: "INVALID_ORIGIN", message: "Admin actions must originate from this site." } }, 403);
  if (!context.request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return adminJson({ error: { code: "INVALID_CONTENT_TYPE", message: "A JSON request body is required." } }, 415);
  const body = await context.request.json().catch(() => null) as FindingActionRequest | null;
  if (!body?.id || !["open","investigating","accepted_risk"].includes(body.status || "")) return adminJson({ error: { code: "INVALID_ACTION", message: "Provide a finding id and an allowed triage status." } }, 400);
  const existing = await context.env.DB!.prepare("SELECT id,status FROM admin_findings WHERE id=?").bind(body.id).first<{id:string;status:string}>();
  if (!existing) return adminJson({ error: { code: "FINDING_NOT_FOUND", message: "Finding was not found." } }, 404);
  const timestamp = new Date().toISOString();
  const resolvedAt = body.status === "accepted_risk" ? timestamp : null;
  await context.env.DB!.prepare("UPDATE admin_findings SET status=?,resolved_at=? WHERE id=?")
    .bind(body.status, resolvedAt, body.id).run();
  await context.env.DB!.prepare("INSERT INTO admin_audit_events (id,actor,action,resource_type,resource_id,details_json,created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),identity.email,"finding_status_changed","finding",body.id,
      JSON.stringify({from:existing.status,to:body.status}),timestamp).run();
  return adminJson({ success: true, id: body.id, status: body.status });
}
