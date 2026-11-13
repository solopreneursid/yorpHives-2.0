/**
 * Validate an already deployed, private, exact-SHA Cloudflare Pages preview.
 * Read-only. It never uploads files or changes a deployment.
 *
 * Secrets are used only inside the authenticated GitHub Actions environment.
 * They must never be printed, included in reports or passed to a browser.
 */
import {verifyHeadquartersD1Isolation} from "../functions/_lib/hq-resource-isolation.js";
const PROJECT = "yorphives-admin-staging";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SHA = /^[a-f0-9]{40}$/;
const BRANCH = /^(?:build|design|ops|qa|fix)\/[a-z0-9][a-z0-9-]{2,110}$/;
const DISALLOWED = new Set(["main", "master"]);
const ACCESS_ROUTES = Object.freeze(["/admin/", "/api/admin/yorpmind-team"]);

/** Real, read-only production invariant for private Headquarters staging. */
export function validateHeadquartersCanonical(project){
 const branch="build/yorphives-admin-reliability";
 const d=project?.canonical_deployment;
 if(project?.name!=="yorphives-admin-staging"||
    project?.production_branch!==branch||project?.source?.type!=="github"||
    project.source.config?.owner!=="solopreneursid"||
    project.source.config?.repo_name!=="yorpHives-2.0"||
    project.source.config?.production_branch!==branch||
    d?.environment!=="production"||d.latest_stage?.name!=="deploy"||
    d.latest_stage.status!=="success"||
    d.deployment_trigger?.metadata?.branch!==branch||
    !UUID.test(String(d?.id||""))||
    !SHA.test(String(d?.deployment_trigger?.metadata?.commit_hash||""))) return null;
 return Object.freeze({id:d.id,sha:d.deployment_trigger.metadata.commit_hash,branch});
}
export function sameHeadquartersCanonical(before,after){
 return Boolean(before&&after&&before.id===after.id&&
  before.sha===after.sha&&before.branch===after.branch);
}
/** Read-only Pages project D1 isolation probe. Never lists row data or writes D1. */
export async function readHeadquartersD1Isolation({accountId,apiToken,fetcher=globalThis.fetch}){
 if(!/^[a-f0-9]{32}$/i.test(String(accountId||""))||
    !apiToken||typeof fetcher!=="function")
  throw Error("Read-only Cloudflare D1 isolation verification credentials required.");
 const response=await fetcher(
  "https://api.cloudflare.com/client/v4/accounts/"+accountId+
   "/pages/projects/yorphives-admin-staging",
  {method:"GET",headers:{authorization:"Bearer "+apiToken,accept:"application/json"},
   signal:AbortSignal.timeout(12000)}
 );
 const body=await response.json().catch(()=>null);
 if(response.status!==200||body?.success!==true)
  throw Error("Cloudflare Pages environment bindings could not be verified.");
 const result=verifyHeadquartersD1Isolation(body.result);
 if(!result.isolated)throw Error(result.reason);
 return result;
}

export async function readHeadquartersCanonical({accountId,apiToken,fetcher=globalThis.fetch}){
 if(!/^[a-f0-9]{32}$/i.test(String(accountId||""))||
    !apiToken||typeof fetcher!=="function")
  throw Error("Read-only Cloudflare canonical verification credentials required.");
 const response=await fetcher(
  "https://api.cloudflare.com/client/v4/accounts/"+accountId+
   "/pages/projects/yorphives-admin-staging",
  {method:"GET",headers:{authorization:"Bearer "+apiToken,accept:"application/json"},
   signal:AbortSignal.timeout(12000)}
 );
 const payload=await response.json().catch(()=>null);
 const checked=response.status===200&&payload?.success===true?
  validateHeadquartersCanonical(payload.result):null;
 if(!checked)throw Error("Canonical private Headquarters deployment cannot be independently verified.");
 return checked;
}


export function validateExistingAdminPreview(deployment, expected) {
  if (!expected || expected.project !== PROJECT ||
    !UUID.test(String(expected.deploymentId || "")) ||
    !SHA.test(String(expected.commitSha || "")) ||
    !BRANCH.test(String(expected.branch || "")) ||
    DISALLOWED.has(expected.branch) ||
    !deployment || deployment.id !== expected.deploymentId ||
    deployment.environment !== "preview" ||
    deployment.latest_stage?.name !== "deploy" ||
    deployment.latest_stage?.status !== "success" ||
    deployment.deployment_trigger?.metadata?.branch !== expected.branch ||
    deployment.deployment_trigger?.metadata?.commit_hash !== expected.commitSha) {
    return null;
  }
  let url;
  try { url = new URL(deployment.url); }
  catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password ||
    url.port || url.pathname !== "/" || url.search || url.hash ||
    !/^[a-f0-9]{8}\.yorphives-admin-staging\.pages\.dev$/.test(url.hostname)) {
    return null;
  }
  return Object.freeze({
    id: deployment.id, url: url.origin, branch: expected.branch,
    commitSha: expected.commitSha, environment: "preview",
    verified_successful_build: true, production_change_authorized: false
  });
}

export async function verifyAnonymousBoundary(origin, fetcher = globalThis.fetch) {
  if (typeof origin !== "string" ||
    !/^https:\/\/[a-f0-9]{8}\.yorphives-admin-staging\.pages\.dev$/.test(origin)) {
    throw new Error("Refusing to test an unapproved Headquarters origin.");
  }
  if (typeof fetcher !== "function") throw new TypeError("Fetch is required.");
  const results = [];
  for (const route of ACCESS_ROUTES) {
    let response;
    try {
      response = await fetcher(origin + route, {
        method: "GET",
        redirect: "manual",
        headers: { accept: route.startsWith("/api/") ? "application/json" : "text/html" },
        signal: AbortSignal.timeout(8000)
      });
    } catch {
      throw new Error("Cannot confirm the anonymous Access boundary.");
    }
    const status = response.status;
    // An access redirect must point into Cloudflare's Access login flow.
    // A redirect to an unrelated page can conceal a missing protection rule.
    const location = response.headers.get("location") || "";
    let safeRedirect = false;
    if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
      try {
        const destination = new URL(location, origin);
        const accessPath = destination.pathname.startsWith("/cdn-cgi/access/");
        const trustedHost = destination.hostname === new URL(origin).hostname ||
          destination.hostname.endsWith(".cloudflareaccess.com");
        safeRedirect = destination.protocol === "https:" && !destination.username &&
          !destination.password && !destination.port && trustedHost && accessPath;
      } catch { safeRedirect = false; }
    }
    await response.body?.cancel().catch(() => {});
    if (status !== 401 && status !== 403 && !safeRedirect) {
      throw new Error("Anonymous access was not securely denied for " + route +
        " (HTTP " + status + "). Release checks stopped.");
    }
    // A bare 401/403 proves denial, not Cloudflare's specific identity.
    // A redirect proves the Access path only when its HTTPS destination
    // belongs to this verified origin or an actual cloudflareaccess.com host.
    const redirect = [301,302,303,307,308].includes(status);
    results.push({
      route, status, access_blocked: true,
      denial_kind: redirect ? "verified_cloudflare_access_redirect" : "http_auth_denial",
      access_redirect_verified: redirect ? safeRedirect : false
    });
  }
  return Object.freeze({
    access_boundary_verified: true, routes: results,
    credentials_exposed: false, user_permissions_modified: false,
    model_calls: 0, database_writes: 0
  });
}

export async function locateExactExistingPreview({
  accountId, apiToken, deploymentId, branch, commitSha,
  fetcher = globalThis.fetch
}) {
  if (!/^[a-f0-9]{32}$/.test(String(accountId || "")) ||
    !UUID.test(String(deploymentId || "")) ||
    !SHA.test(String(commitSha || "")) ||
    !BRANCH.test(String(branch || "")) || !apiToken) {
    throw new Error("A reviewed preview, branch and read-only Cloudflare token are required.");
  }
  const endpoint = "https://api.cloudflare.com/client/v4/accounts/" + accountId +
    "/pages/projects/" + PROJECT + "/deployments/" + deploymentId;
  const response = await fetcher(endpoint, {
    method: "GET",
    headers: { authorization: "Bearer " + apiToken, accept: "application/json" },
    signal: AbortSignal.timeout(12000)
  });
  const json = await response.json().catch(() => null);
  if (response.status !== 200 || json?.success !== true) {
    throw new Error("The existing staging deployment could not be verified through Cloudflare.");
  }
  const candidate = validateExistingAdminPreview(json.result, {
    project: PROJECT, deploymentId, branch, commitSha
  });
  if (!candidate) {
    throw new Error("Staging deployment does not match the reviewed branch, exact SHA or successful preview.");
  }
  return candidate;
}

/**
 * Founder-friendly one-click discovery. Only successful private deployments
 * whose exact SHA and branch match the checked-out GitHub revision are eligible.
 * Bounded to 3 pages / 30 items; never creates deployments or trusts a
 * branch-name-only match.
 */
export async function locateMatchingAdminPreview({
  accountId, apiToken, branch, commitSha, fetcher = globalThis.fetch
}) {
  if (!/^[a-f0-9]{32}$/.test(String(accountId || "")) ||
    !SHA.test(String(commitSha || "")) ||
    !BRANCH.test(String(branch || "")) ||
    !apiToken || typeof fetcher !== "function") {
    throw new Error("A reviewed feature branch and read-only Cloudflare token are required.");
  }
  const endpoint = "https://api.cloudflare.com/client/v4/accounts/" + accountId +
    "/pages/projects/" + PROJECT + "/deployments";
  const headers = { authorization: "Bearer " + apiToken, accept: "application/json" };
  for (let page = 1; page <= 3; page++) {
    const result = await fetcher(endpoint + "?env=preview&per_page=10&page=" + page, {
      method: "GET", headers, signal: AbortSignal.timeout(12000)
    });
    const body = await result.json().catch(() => null);
    if (result.status !== 200 || body?.success !== true || !Array.isArray(body.result)) {
      throw new Error("Cloudflare could not confirm the existing private preview.");
    }
    for (const item of body.result) {
      const matched = validateExistingAdminPreview(item, {
        project: PROJECT, deploymentId: item.id,
        branch, commitSha
      });
      if (matched) return matched;
    }
    if (body.result.length < 10) break;
  }
  throw new Error("No successful, matching-code Headquarters preview exists. Build and review a private preview before running signed-in tests.");
}
