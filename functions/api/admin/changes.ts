import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";

interface ChangeEvent {
  id: string;
  url: string;
  previous_hash: string | null;
  current_hash: string;
  detected_at: string;
  status: "new" | "reviewed";
  title: string;
  details: string;
}

export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const result = await context.env.DB!.prepare(
    "SELECT id, url, previous_hash, current_hash, detected_at, status, title, details FROM admin_change_events ORDER BY detected_at DESC LIMIT 50"
  ).all<ChangeEvent>();
  return adminJson({ data: result.results });
}
