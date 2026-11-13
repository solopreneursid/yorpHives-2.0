const PROJECTS = Object.freeze({
  "yorphives-2-preview": { output: "SITE_BASE_URL", productionBranch: "main" },
  "yorphives-admin-staging": { output: "ADMIN_BASE_URL", productionBranch: "build/yorphives-admin-reliability" }
});
const APPROVED_BRANCH = /^(?:build|feature|fix|qa|design|ops)\/[a-z0-9][a-z0-9._/-]{1,110}$/;
const isSafePreviewBranch = value => typeof value === "string" &&
  APPROVED_BRANCH.test(value) && !value.includes("..") &&
  !value.includes("//") && !value.endsWith("/") && !value.endsWith(".") &&
  !value.split("/").some(segment => segment.startsWith("."));
const EXPECTED_SOURCE = Object.freeze({ owner: "solopreneursid", repo: "yorpHives-2.0" });

export function validateHeadquartersPreviewProject(data, branch) {
  const config = PROJECTS["yorphives-admin-staging"];
  if (!isSafePreviewBranch(branch) || branch === config.productionBranch ||
      data?.name !== "yorphives-admin-staging" ||
      data?.source?.type !== "github" ||
      data?.source?.config?.owner !== EXPECTED_SOURCE.owner ||
      data?.source?.config?.repo_name !== EXPECTED_SOURCE.repo ||
      data?.production_branch !== config.productionBranch ||
      data?.source?.config?.production_branch !== config.productionBranch ||
      data?.source?.config?.deployments_enabled !== true ||
      data?.canonical_deployment?.environment !== "production" ||
      data?.canonical_deployment?.deployment_trigger?.metadata?.branch !== config.productionBranch ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(data.canonical_deployment?.id || ""))) return null;
  return { canonicalId: data.canonical_deployment.id };
}

export function validatePreviewDeployment(deployment, { project, branch, commitSha, requireSucceeded = false }) {
  if (!deployment || deployment.environment !== "preview") return null;
  if (deployment.deployment_trigger?.metadata?.branch !== branch) return null;
  if (deployment.deployment_trigger?.metadata?.commit_hash !== commitSha) return null;
  if (requireSucceeded && (deployment.latest_stage?.name !== "deploy" || deployment.latest_stage?.status !== "success")) return null;
  let url;
  try { url = new URL(deployment.url); } catch { return null; }
  if (url.protocol !== "https:" ||
      !new RegExp("^[a-f0-9]{8}\\." + project + "\\.pages\\.dev$").test(url.hostname) ||
      url.username || url.password || url.port || url.search || url.hash || url.pathname !== "/") return null;
  return { id: String(deployment.id || ""), url: url.origin, reused: requireSucceeded };
}

export async function findExactSuccessfulPreview({
  endpoint, project, branch, commitSha, headers, fetchImpl = fetch, maxAttempts = 3,
  delayImpl = ms => new Promise(resolve => setTimeout(resolve, ms))
}) {
  // Cloudflare Pages deployments support bounded per_page values. Pagination is
  // required when multiple staging previews are built during development.
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    for (let page = 1; page <= 3; page += 1) {
      const result = await fetchImpl(endpoint + "?env=preview&per_page=10&page=" + page, {
        method: "GET", headers, signal: AbortSignal.timeout(15000)
      });
      const data = await result.json().catch(() => null);
      if (!result.ok || data?.success !== true || !Array.isArray(data.result)) {
        throw new Error("Cloudflare preview lookup failed; refusing to trust a mismatched deployment.");
      }
      for (const candidate of data.result) {
        const exact = validatePreviewDeployment(candidate, {
          project, branch, commitSha, requireSucceeded: true
        });
        if (exact) return exact;
      }
      if (data.result.length < 10) break;
    }
    if (attempt < maxAttempts) await delayImpl(1500);
  }
  throw new Error("No successful Cloudflare Pages preview matched the exact requested branch and commit.");
}

export async function createOrReusePreview({
  accountId, apiToken, project, branch, commitSha, commitMessage, fetchImpl = fetch,
  delayImpl = ms => new Promise(resolve => setTimeout(resolve, ms))
}) {
  const config = PROJECTS[project];
  if (!config) throw new Error("Unapproved Pages project.");
  if (!accountId || !apiToken || !commitSha || !branch) throw new Error("Missing required deployment setting.");
  if (!/^[a-f0-9]{40}$/i.test(commitSha)) throw new Error("Invalid commit SHA.");
  if (!isSafePreviewBranch(branch) || branch === config.productionBranch) {
    throw new Error("Only isolated feature branches may be deployed by this workflow.");
  }

  const endpoint = "https://api.cloudflare.com/client/v4/accounts/" +
    encodeURIComponent(accountId) + "/pages/projects/" + encodeURIComponent(project) + "/deployments";
  const headers = { authorization: "Bearer " + apiToken };
  // Cloudflare Pages defaults to the production branch if branch is omitted.
  // Explicitly inspect this Git-connected HQ project before any multipart POST.
  const projectEndpoint = endpoint.slice(0, -"/deployments".length);
  let guardedCanonical = null;
  if (project === "yorphives-admin-staging") {
    const readProject = async () => {
      const response = await fetchImpl(projectEndpoint, {
        method: "GET", headers, signal: AbortSignal.timeout(12000)
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.success !== true) {
        throw Error("Headquarters preview project safety preflight unavailable.");
      }
      return payload.result;
    };
    const previous = await readProject();
    const validated = validateHeadquartersPreviewProject(previous, branch);
    if (!validated) throw Error("Headquarters staging project or production branch did not match the safe allowlist.");
    guardedCanonical = validated.canonicalId;
  }
  const form = new FormData();
  form.append("branch", branch);
  form.append("commit_hash", commitSha);
  form.append("commit_message", String(commitMessage || "Automated isolated preview deployment").slice(0, 500));
  form.append("commit_dirty", "false");

  const response = await fetchImpl(endpoint, {
    method: "POST", headers, body: form, signal: AbortSignal.timeout(45000)
  });
  const verifyCanonicalUnchanged = async () => {
    if (!guardedCanonical) return;
    const latest = await fetchImpl(projectEndpoint, {
      method: "GET", headers, signal: AbortSignal.timeout(12000)
    });
    const payload = await latest.json().catch(() => null);
    if (!latest.ok || payload?.success !== true ||
        payload?.result?.canonical_deployment?.id !== guardedCanonical) {
      throw Error("Headquarters canonical deployment changed or could not be verified; investigate before continuing.");
    }
  };
  if (response.status === 304) {
    const found = await findExactSuccessfulPreview({
      endpoint, project, branch, commitSha, headers, fetchImpl, delayImpl
    });
    await verifyCanonicalUnchanged();
    return { ...found, output: config.output };
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success !== true || !data?.result) {
    const errors = Array.isArray(data?.errors)
      ? data.errors.map(item => String(item.message || "Cloudflare API error")).join("; ")
      : "Cloudflare Pages deployment request failed.";
    throw new Error("Cloudflare Pages preview deployment failed (HTTP " + response.status + "): " + errors.slice(0, 500));
  }
  const direct = validatePreviewDeployment(data.result, { project, branch, commitSha });
  if (direct) {
    await verifyCanonicalUnchanged();
    return { ...direct, output: config.output };
  }

  // Some accepted Cloudflare Pages responses temporarily return stale or
  // incomplete metadata. This path never trusts the POST payload alone.
  const verified = await findExactSuccessfulPreview({
    endpoint, project, branch, commitSha, headers, fetchImpl, delayImpl
  });
  await verifyCanonicalUnchanged();
  return { ...verified, output: config.output };
}
