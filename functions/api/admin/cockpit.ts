import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";
import { cockpitSnapshot } from "../../_lib/cockpit.js";

export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const snapshot = await cockpitSnapshot(context.env.DB!);
  return adminJson(snapshot, snapshot.availability === "unavailable" ? 503 : 200);
}
