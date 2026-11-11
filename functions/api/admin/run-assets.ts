import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";
import { runAssetIntelligence } from "../../../admin-monitor/asset-intelligence.js";

interface RunAssetsRequest { confirm?: boolean; }
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
  const body = await context.request.json().catch(() => ({})) as RunAssetsRequest;
  if (body.confirm !== true) return adminJson({ error: { code: "CONFIRMATION_REQUIRED", message: "Send { confirm: true } to run the approved asset checks." } }, 400);
  try {
    return adminJson(await runAssetIntelligence(context.env.DB!));
  } catch (error) {
    return adminJson({ error: { code: "ASSET_SCAN_FAILED", message: error instanceof Error ? error.message : "Asset intelligence scan failed." } }, 500);
  }
}
