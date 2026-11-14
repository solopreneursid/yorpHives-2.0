/* No release controls exist in Headquarters. Do not revive a preview or
 * publishing workflow based on legacy release metadata. */
import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";
export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const owner = await requireAdmin(context);
  if (isAdminResponse(owner)) return owner;
  return adminJson({
    error: { code: "MONITOR_ONLY", message: "Headquarters observes changes. The founder handles implementation and production releases separately." },
    ready_for_preview: false, production_approved: false, production_deployment_enabled: false
  }, 410);
}
