import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";
import { runAdminHealthChecks } from "../../../admin-monitor/admin-health.js";

interface RunChecksRequest { confirm?: boolean; }
interface RunChecksResponse {
  run: {
    id: string;
    status: "completed";
    started_at: string;
    completed_at: string;
    monitor_count: number;
    passed_count: number;
    failed_count: number;
  };
  results: Array<{
    monitor_id: string;
    ok: boolean;
    status_code: number | null;
    duration_ms: number;
    error_message: string | null;
  }>;
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
  const body = await context.request.json().catch(() => ({})) as RunChecksRequest;
  if (body.confirm !== true) {
    return adminJson({ error: { code: "CONFIRMATION_REQUIRED", message: "Send { confirm: true } to run the approved read-only HTTP checks." } }, 400);
  }
  try {
    const result = await runAdminHealthChecks(context.env.DB!, "manual") as RunChecksResponse;
    return adminJson(result, result.run.failed_count > 0 ? 207 : 200);
  } catch (error) {
    return adminJson({
      error: {
        code: "HEALTH_CHECK_FAILED",
        message: error instanceof Error ? error.message : "The health check could not be completed.",
      },
    }, 500);
  }
}
