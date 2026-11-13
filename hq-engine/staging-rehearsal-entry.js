/**
 * Isolated Workflow staging harness. No public HTTP mission endpoint.
 * The ONLY executable entrypoint is the Cloudflare-authenticated Workflow API.
 * This module intentionally does not export the production Worker fetch handler.
 */
export { MissionWorkflow } from "./worker.js";

export default {
  async fetch() {
    return new Response("Not found", {
      status: 404,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      }
    });
  }
};
