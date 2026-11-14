import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";

/** Independent outside-in status: authenticated read-only, never a release gate.
 * Cloud-hosted HQ has no local watchdog reader and must say unavailable.
 */
export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const reader = (context.env as unknown as { HQ_WATCHDOG_READ?: () => Promise<unknown> }).HQ_WATCHDOG_READ;
  if (typeof reader !== "function") {
    return adminJson({ source:"independent_local_watchdog", connected:false,
      status:"unavailable", reason:"watchdog_not_connected",
      observations:[], observed_at:null,
      repairs_authorized:false, production_execution_enabled:false },503);
  }
  try {
    const report = await reader() as {
      source?:string;connected?:boolean;status?:string;observations?:unknown[];
      repairs_authorized?:boolean;production_execution_enabled?:boolean;
    };
    if (report?.source !== "independent_local_watchdog" ||
        report.repairs_authorized !== false || report.production_execution_enabled !== false ||
        !Array.isArray(report.observations) || report.observations.length > 5 ||
        !["ready","degraded","unavailable"].includes(report.status || "")) {
      throw Error("Unverified local report");
    }
    const response = adminJson(report,report.connected === true ? 200 : 503);
    response.headers.set("cache-control","no-store");
    return response;
  } catch {
    return adminJson({ source:"independent_local_watchdog",connected:false,
      status:"unavailable",reason:"watchdog_reader_unavailable",
      observations:[],observed_at:null,
      repairs_authorized:false,production_execution_enabled:false },503);
  }
}
