/**
 * Safety policy shared by the Cloudflare repair Worker and dependency-free tests.
 * AI may suggest public-facing source fixes but cannot edit the Admin control
 * plane, payment infrastructure, CI, configuration, databases or releases.
 */

const REPAIRABLE_ROOT_FILE = new Set(["app.js"]);
const REPAIRABLE_DIRS = ["free-tools/", "discover/", "listing/", "explore/"];
const SOURCE_EXTENSION = /\.(?:js|mjs|css|html)$/i;
const SAFE_PATH_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
const REPAIR_BRANCH = /^build\/agent\/repair-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{40}$/i;

export function allowedRepairPath(path) {
  if (typeof path !== "string" || path.length === 0 || path.length > 260 ||
      path.includes("\\") || path.startsWith("/") || path.startsWith(".")) return false;

  const segments = path.split("/");
  if (segments.some(segment => !segment || segment === "." || segment === ".." ||
      segment.startsWith(".") || !SAFE_PATH_SEGMENT.test(segment))) return false;

  if (REPAIRABLE_ROOT_FILE.has(path)) return true;
  if (!REPAIRABLE_DIRS.some(prefix => path.startsWith(prefix))) return false;
  if (!SOURCE_EXTENSION.test(path)) return false;
  // Prevent edits to nested repo assets or build/runtime configuration,
  // even if someone places those files under a public source directory.
  if (segments.some(segment => /^(?:wrangler[^/]*|package(?:-lock)?\.json|\.npmrc|\.env(?:\..*)?|_headers|_redirects|robots\.txt|site\.webmanifest)$/i.test(segment))) return false;
  return true;
}

export function assertVerifiedBranchHead({ branch, expectedSha, currentSha }) {
  if (!REPAIR_BRANCH.test(branch) || !SHA.test(expectedSha) || !SHA.test(currentSha) ||
      expectedSha.toLowerCase() !== currentSha.toLowerCase()) {
    throw new Error("Repair branch is not pinned to the exact CI-verified commit; manual investigation required.");
  }
  return { branch, commit_sha: currentSha.toLowerCase(), verified_revision: true };
}

export function assertRepairReplay({ branch, sourceSha, commit, changedPaths, proposedChanges }) {
  if (!REPAIR_BRANCH.test(branch) || !SHA.test(sourceSha) ||
      !commit || !SHA.test(commit.sha) || !SHA.test(commit.tree?.sha) ||
      !Array.isArray(commit.parents) || commit.parents.length !== 1 ||
      commit.parents[0]?.sha !== sourceSha) {
    throw new Error("Existing repair branch does not descend directly from its approved source revision.");
  }
  if (!Array.isArray(changedPaths) || !Array.isArray(proposedChanges) ||
      changedPaths.length !== proposedChanges.length || !proposedChanges.length) {
    throw new Error("Existing repair branch has an unexpected file-change set.");
  }
  const allowed = new Set(proposedChanges.map(change => change.path));
  if (allowed.size !== proposedChanges.length || [...allowed].some(path => !allowedRepairPath(path))) {
    throw new Error("Existing repair branch contains an unauthorized or duplicate path.");
  }
  for (const changed of changedPaths) {
    if (!changed || changed.status !== "modified" || !allowed.delete(changed.filename)) {
      throw new Error("Existing repair branch differs from the approved patch file set.");
    }
  }
  if (allowed.size) throw new Error("Existing repair branch omits an approved patch file.");
  return true;
}

export function assertReceipt({ receipt, jobId, sourceSha, repairSha }) {
  if (!receipt || receipt.job_id !== jobId || !SHA.test(sourceSha) ||
      !SHA.test(repairSha) || receipt.base_commit_sha !== sourceSha ||
      receipt.repair_commit_sha !== repairSha ||
      receipt.purpose !== "CI verification receipt") {
    throw new Error("Existing repair verification receipt does not match this exact job and repair revision.");
  }
  return true;
}
