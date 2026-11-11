import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";
import { captureProductionSnapshots } from "../../../admin-monitor/change-monitor.js";

interface SnapshotRequest { confirm?: boolean; }
interface SnapshotResponse {
  checked_at: string;
  targets: number;
  changed: number;
  results: Array<{ url: string; ok: boolean; changed?: boolean; reason?: string }>;
}

export async function onRequestPost(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const origin = context.request.headers.get("origin");
  if (!origin || origin !== new URL(context.request.url).origin) {
    return adminJson({ error: { code: "INVALID_ORIGIN", message: "Admin actions must originate from this site." } }, 403);
  }
  if (!context.request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return adminJson({ error: { code: "INVALID_CONTENT_TYPE", message: "A JSON request body is required." } }, 415);
  }
  const body = await context.request.json().catch(() => ({})) as SnapshotRequest;
  if (body.confirm !== true) {
    return adminJson({ error: { code: "CONFIRMATION_REQUIRED", message: "Send { confirm: true } to capture the approved production snapshots." } }, 400);
  }
  try {
    const result = await captureProductionSnapshots(context.env.DB!) as SnapshotResponse;
    return adminJson(result);
  } catch (error) {
    return adminJson({
      error: {
        code: "SNAPSHOT_FAILED",
        message: error instanceof Error ? error.message : "The production snapshot could not be completed."
      }
    }, 500);
  }
}
