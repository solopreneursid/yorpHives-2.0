/* Headquarters is monitoring-only. This retired endpoint cannot issue or verify
 * release OTPs, even when legacy configuration flags or tables exist. */
import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";
export async function onRequestPost(context: AdminRequestContext): Promise<Response> {
  const owner = await requireAdmin(context);
  if (isAdminResponse(owner)) return owner;
  return adminJson({
    error: { code: "MONITOR_ONLY", message: "Headquarters cannot authorize production releases. Make and publish changes outside Headquarters." },
    production_deployment_enabled: false
  }, 410);
}
