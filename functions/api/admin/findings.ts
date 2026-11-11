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
