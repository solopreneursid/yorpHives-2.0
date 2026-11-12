const PROJECTS = Object.freeze({
  "yorphives-2-preview": { output: "SITE_BASE_URL", productionBranch: "main" },
  "yorphives-admin-staging": { output: "ADMIN_BASE_URL", productionBranch: "build/yorphives-admin-reliability" }
});

export function validatePreviewDeployment(deployment, { project, branch, commitSha, requireSucceeded = false }) {
  if (!deployment || deployment.environment !== "preview") return null;
  if (deployment.deployment_trigger?.metadata?.branch !== branch) return null;
  if (deployment.deployment_trigger?.metadata?.commit_hash !== commitSha) return null;
  if (requireSucceeded && (deployment.latest_stage?.name !== "deploy" || deployment.latest_stage?.status !== "success")) return null;
  let url;
  try { url = new URL(deployment.url); } catch { return null; }
  if (url.protocol !== "https:" || url.hostname === "" ||
      !url.hostname.endsWith("." + project + ".pages.dev") ||
      url.username || url.password || url.port || url.search || url.hash) return null;
  return { id: String(deployment.id || ""), url: url.origin, reused: requireSucceeded };
}

export async function createOrReusePreview({
  accountId, apiToken, project, branch, commitSha, commitMessage, fetchImpl = fetch
}) {
  const config = PROJECTS[project];
  if (!config) throw new Error("Unapproved Pages project.");
  if (!accountId || !apiToken || !commitSha || !branch) throw new Error("Missing required deployment setting.");
  if (!/^[a-f0-9]{40}$/i.test(commitSha)) throw new Error("Invalid commit SHA.");
  if (!branch.startsWith("build/") || branch === config.productionBranch) {
    throw new Error("Only isolated feature branches may be deployed by this workflow.");
  }
  const endpoint = "https://api.cloudflare.com/client/v4/accounts/" +
    encodeURIComponent(accountId) + "/pages/projects/" + encodeURIComponent(project) + "/deployments";
  const headers = { authorization: "Bearer " + apiToken };
  const form = new FormData();
  form.append("branch", branch);
  form.append("commit_hash", commitSha);
  form.append("commit_message", String(commitMessage || "Automated isolated preview deployment").slice(0, 500));
  form.append("commit_dirty", "false");
  const response = await fetchImpl(endpoint, {
    method: "POST", headers, body: form, signal: AbortSignal.timeout(45000)
  });
  if (response.status === 304) {
    const lookup = await fetchImpl(endpoint + "?env=preview&per_page=50", {
      method: "GET", headers, signal: AbortSignal.timeout(15000)
    });
    const payload = await lookup.json().catch(() => null);
    if (!lookup.ok || payload?.success !== true || !Array.isArray(payload.result)) {
      throw new Error("Cloudflare returned 304 and the existing preview could not be verified.");
    }
    const matched = payload.result.map(item => validatePreviewDeployment(item, {
      project, branch, commitSha, requireSucceeded: true
    })).find(Boolean);
    if (!matched) throw new Error("Cloudflare returned 304 without an exact successful branch-and-commit preview; refusing to reuse another deployment.");
    return { ...matched, output: config.output };
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true || !payload?.result) {
    const problems = Array.isArray(payload?.errors)
      ? payload.errors.map(item => String(item.message || "Cloudflare API error")).join("; ")
      : "Cloudflare Pages deployment request failed.";
    throw new Error("Cloudflare Pages preview deployment failed (HTTP " + response.status + "): " + problems.slice(0, 500));
  }
  const deployed = validatePreviewDeployment(payload.result, { project, branch, commitSha });
  if (!deployed) {
    throw new Error("Cloudflare response was not an exact isolated preview for the requested branch and commit.");
  }
  return { ...deployed, output: config.output };
}
