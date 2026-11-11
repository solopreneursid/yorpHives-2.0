import { runAdminHealthChecks } from "./admin-health.js";

export default {
  async scheduled(controller, env) {
    try {
      const result = await runAdminHealthChecks(env.DB, "scheduled");
      console.log(JSON.stringify({
        event: "scheduled_health_check_completed",
        scheduled_time: new Date(controller.scheduledTime).toISOString(),
        run_id: result.run.id,
        monitors: result.run.monitor_count,
        passed: result.run.passed_count,
        failed: result.run.failed_count,
      }));
    } catch (error) {
      console.error(JSON.stringify({
        event: "scheduled_health_check_failed",
        scheduled_time: new Date(controller.scheduledTime).toISOString(),
        error: error instanceof Error ? error.message : "Unknown health check failure",
      }));
      throw error;
    }
  },
  async fetch() {
    return new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  },
};
