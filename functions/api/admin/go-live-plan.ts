/* Retired production planning route. Historical monitoring and investigations
 * remain available through dedicated read-only Headquarters endpoints. */
import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";
export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const owner = await requireAdmin(context);
  if (isAdminResponse(owner)) return owner;
  return adminJson({
    error: { code: "MONITOR_ONLY", message: "Headquarters is for monitoring and intelligence, not production planning or publishing." },
    eligible: false, plan: null, production_deployment_enabled: false
  }, 410);
}
