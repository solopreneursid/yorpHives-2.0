import { WorkflowEntrypoint } from "cloudflare:workers";

/**
 * Legacy service contract: read-only diagnostics and issue evidence.
 * No source-writing implementation, GitHub mutation endpoint, repair dispatch,
 * AI inference, or release action is permitted in this Worker.
 *
 * Deployed credential permissions must still be audited and reduced separately.
 */
const REPOSITORY = "solopreneursid/yorpHives-2.0";
const HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};
const json = (value, status = 200) => Response.json(value, { status, headers: HEADERS });

function safeText(value, max) {
  return String(value ?? "").slice(0, max);
}

async function readGithub(env, resource) {
  if (!env.GITHUB_TOKEN) throw new Error("GitHub read credential unavailable");
  const response = await fetch("https://api.github.com/repos/" + REPOSITORY + resource, {
    method: "GET",
    headers: {
      authorization: "Bearer " + env.GITHUB_TOKEN,
      "user-agent": "YorpHives-Headquarters-ReadOnly/1.0",
      accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error("GitHub read failed (" + response.status + ")");
  return response.json();
}

export class AdminRepairWorkflow extends WorkflowEntrypoint {
  async run() {
    // Compatibility only: old queued workflow instances must not repair code.
    throw new Error("MONITOR_ONLY: Headquarters never executes code repairs.");
  }
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET") {
      return json({
        error: "MONITOR_ONLY",
        monitoring_only: true,
        dispatch_performed: false,
        github_issue_created: false,
        production_deployed: false
      }, 405);
    }
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      const dependencies = {
        github_read_credential_present: Boolean(env.GITHUB_TOKEN),
        database: Boolean(env.DB),
        legacy_ai_binding_present: Boolean(env.AI),
        legacy_repair_workflow_binding_present: Boolean(env.ADMIN_REPAIR_WORKFLOW)
      };
      // Presence of a token does not prove it is scoped read-only.
      // A privileged token must be rotated by the infrastructure owner.
      return json({
        ready: false,
        status: "retired_pending_cloudflare_cleanup",
        mode: "monitor_only",
        github: {
          repository: REPOSITORY,
          credential_scope_verified_read_only: false,
          credential_present_is_not_authorization: true,
          repository_write: null
        },
        dependencies,
        workflow_dispatch_enabled: false,
        model_inference_enabled: false,
        deployment_enabled: false,
        production_approved: false
      }, 503);
    }
    if (url.pathname !== "/issue-inbox") return json({error: "Not found"}, 404);
    if (request.headers.get("x-yorphives-internal-inbox") !== "1") {
      return json({error: "Private service-binding operation."}, 403);
    }
    try {
      const data = await readGithub(env, "/issues?state=open&per_page=40&sort=updated&direction=desc");
      if (!Array.isArray(data)) throw new Error("Unexpected issue list");
      const issues = data
        .filter(item => !item.pull_request && Number.isSafeInteger(item.number) &&
          item.number > 0 && item.number <= 100000000)
        .slice(0, 20)
        .map(item => ({
          number: item.number,
          title: safeText(item.title, 160),
          body_excerpt: safeText(item.body, 1200),
          updated_at: safeText(item.updated_at, 40),
          state: "open",
          url: "https://github.com/" + REPOSITORY + "/issues/" + item.number,
          labels: (Array.isArray(item.labels) ? item.labels : [])
            .map(label => safeText(label?.name, 48)).slice(0, 6)
        }));
      return json({
        repository: REPOSITORY,
        issues,
        inspected_limit: 40,
        returned_limit: 20,
        read_only: true,
        new_model_calls: 0,
        production_approved: false
      });
    } catch (error) {
      console.warn(JSON.stringify({
        event: "issue_inbox_read_failed",
        reason: safeText(error instanceof Error ? error.message : error, 120)
      }));
      return json({error: "Read-only GitHub issue listing unavailable."}, 503);
    }
  }
};
