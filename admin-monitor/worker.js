import { runAdminHealthChecks } from "./admin-health.js";
import { captureProductionSnapshots } from "./change-monitor.js";
import { runAssetIntelligence } from "./asset-intelligence.js";

export default {
  async scheduled(controller, env) {
    const scheduledTime = new Date(controller.scheduledTime).toISOString();
    try {
      const health = await runAdminHealthChecks(env.DB, "scheduled");
      const changes = await captureProductionSnapshots(env.DB);
      const assets = await runAssetIntelligence(env.DB);
      console.log(JSON.stringify({
        event: "scheduled_reliability_cycle_completed",
        scheduled_time: scheduledTime,
        run_id: health.run.id,
        monitors: health.run.monitor_count,
        passed: health.run.passed_count,
        failed: health.run.failed_count,
        snapshot_targets: changes.targets,
        changed_pages: changes.changed,
        assets_checked: assets.assets,
        assets_healthy: assets.healthy,
        assets_degraded: assets.degraded,
        assets_unavailable: assets.unavailable,
        dependency_observations: assets.dependencies
      }));
      if (health.run.failed_count > 0 || changes.results.some(result => !result.ok) || assets.unavailable > 0 || assets.degraded > 0 || assets.manifest_error) {
        console.warn(JSON.stringify({ event: "reliability_cycle_warnings", health_failures: health.run.failed_count, snapshot_results: changes.results, asset_results: assets.results, manifest_error: assets.manifest_error }));
      }
    } catch (error) {
      console.error(JSON.stringify({
        event: "scheduled_reliability_cycle_failed",
        scheduled_time: scheduledTime,
        error: error instanceof Error ? error.message : "Unknown reliability failure"
      }));
      throw error;
    }
  },
  async fetch() {
    return new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }
    });
  }
};
