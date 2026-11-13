/** Read-only, founder-visible diagnosis. Never moves a GitHub ref or deploys. */
import {verifyHeadquartersCanonicalBranch} from "./go-live-readiness.js";
const SHA=/^[a-f0-9]{40}$/;
const SAFE_ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const blocked=(reason)=>Object.freeze({
 status:"unverified",reconciled:false,requires_manual_recovery_review:true,
 release_safe:false,production_deployment_enabled:false,reason
});
export function diagnoseHeadquartersDrift({branch,project,comparison,compareBase,compareHead}={}){
 const source=branch?.commit?.sha,live=project?.canonical_deployment?.deployment_trigger?.metadata?.commit_hash;
 const deploy=project?.canonical_deployment;
 if(branch?.name!=="build/yorphives-admin-reliability"||!SHA.test(source||"")||
    project?.name!=="yorphives-admin-staging"||
    project.production_branch!==branch.name||
    project.source?.type!=="github"||
    project.source.config?.owner!=="solopreneursid"||
    project.source.config?.repo_name!=="yorpHives-2.0"||
    project.source.config?.production_branch!==branch.name||
    deploy?.environment!=="production"||
    deploy.latest_stage?.name!=="deploy"||deploy.latest_stage?.status!=="success"||
    deploy.deployment_trigger?.metadata?.branch!==branch.name||
    !SHA.test(live||"")||!SAFE_ID.test(deploy.id||""))
  return blocked("The branch or actually served private deployment cannot be independently verified.");
 const same=verifyHeadquartersCanonicalBranch(branch,project);
 if(same.verified)return Object.freeze({
  status:"aligned",reconciled:true,requires_manual_recovery_review:false,
  source_sha:source,served_sha:live,previous_deployment_id:deploy.id,
  release_safe:false,production_deployment_enabled:false,
  reason:"Canonical source and served deployment match. Other independent release gates still apply."
 });
 // Never accept a comparison against a different branch/deployment pair.
 if(compareBase!==live||compareHead!==source||
    comparison?.base_commit?.sha!==live||
    comparison?.merge_base_commit?.sha!==live||
    comparison?.status!=="ahead"||
    !Number.isSafeInteger(comparison?.ahead_by)||comparison.ahead_by<1||
    comparison?.behind_by!==0)
  return Object.freeze({
   ...blocked("The GitHub history from the served deployment to the source branch is unverified or divergent."),
   source_sha:source,served_sha:live,previous_deployment_id:deploy.id
  });
 return Object.freeze({
  status:"source_ahead_of_served",reconciled:false,requires_manual_recovery_review:true,
  source_sha:source,served_sha:live,previous_deployment_id:deploy.id,
  ahead_by:comparison.ahead_by,behind_by:0,
  release_safe:false,production_deployment_enabled:false,
  reason:"GitHub source is ahead of the actually served Cloudflare deployment. Preserve the served deployment for rollback and verify recovery before any promotion."
 });
}
