/**
 * Prepare a founder-release plan, NEVER execute it.
 * No AI permissions, no Git ref writes, no Cloudflare rollback calls.
 */
import {validatedReleaseBinding} from "./go-live-otp-core.js";
import {verifyHeadquartersCanonicalBranch,PUBLISH_DESTINATION,REPO} from "./go-live-readiness.js";
const SHA=/^[a-f0-9]{40}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function planHeadquartersFastForward({
 readiness,branch,project,comparison,compareBase,compareHead
}){
 const error=why=>({eligible:false,reason:why,plan:null,
  production_deployment_enabled:false});
 if(readiness?.target!=="headquarters")return error("Public website publishing requires separate verified cross-repository artifact promotion.");
 const c=readiness?.candidate;
 if(!c||!SHA.test(String(c.sha||""))||
    !Number.isSafeInteger(c.number)||c.number<1||typeof c.branch!=="string")
  return error("No exact, eligible Headquarters release candidate exists.");
 const bound=validatedReleaseBinding(readiness,"headquarters",c.sha,
  readiness.preview?.deploymentId);
 if(!bound)return error("The reviewed preview and all release checks are not verified.");
 const canonical=verifyHeadquartersCanonicalBranch(branch,project);
 if(!canonical.verified)return error(canonical.reason);
 if(compareBase!==canonical.sourceSha||compareHead!==c.sha)
  return error("The GitHub ancestry query did not match the exact branch and revision.");
 if(!comparison||comparison.status!=="ahead"||
    !Number.isSafeInteger(comparison.ahead_by)||comparison.ahead_by<1||
    comparison.behind_by!==0||
    comparison.base_commit?.sha!==canonical.sourceSha||
    comparison.merge_base_commit?.sha!==canonical.sourceSha)
  return error("The candidate must be a strict fast-forward of the unchanged production branch.");
 if(!UUID.test(canonical.canonicalDeploymentId))
  return error("The previous canonical deployment is not a verified rollback anchor.");
 const plan=Object.freeze({
  schema_version:1,target:"headquarters",
  source_repository:REPO,
  pages_project:PUBLISH_DESTINATION.headquarters.project,
  production_branch:PUBLISH_DESTINATION.headquarters.branch,
  operation:"fast_forward_to_exact_previewed_sha",
  target_sha:c.sha,expected_previous_branch_sha:canonical.sourceSha,
  preview_deployment_id:bound.deployment_id,
  previous_canonical_deployment_id:canonical.canonicalDeploymentId,
  previous_canonical_sha:canonical.canonicalSha,
  rollback_operation:"restore_previous_canonical_pages_deployment",
  approved:false,production_deployment_enabled:false
 });
 return {eligible:true,reason:null,plan,production_deployment_enabled:false};
}
