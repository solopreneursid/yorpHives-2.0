import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";
interface AuditRow { id:string; actor:string; action:string; resource_type:string; resource_id:string|null; details_json:string; created_at:string; }
export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const result = await context.env.DB!.prepare(
    "SELECT id,actor,action,resource_type,resource_id,details_json,created_at FROM admin_audit_events ORDER BY created_at DESC LIMIT 100"
  ).all<AuditRow>();
  return adminJson({ data: result.results });
}
