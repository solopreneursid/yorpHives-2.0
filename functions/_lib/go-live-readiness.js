/** Read-only, exact-revision production preview checks. Never publishes. */
export const REPO="solopreneursid/yorpHives-2.0";
export const RELEASE_PROJECT=Object.freeze({website:"yorphives-2-preview",headquarters:"yorphives-admin-staging"});
/** Actual Cloudflare Pages production sources, independently inspected.
 * Public YorpHives uses another repository; preview != deployable artifact.
 */
export const PUBLISH_DESTINATION=Object.freeze({
 website:Object.freeze({
  project:"yorphives",repository:"solopreneursid/YorpHives",
  branch:"main",promotion:"cross_repository_verified_artifact"
 }),
 headquarters:Object.freeze({
  project:"yorphives-admin-staging",repository:"solopreneursid/yorpHives-2.0",
  branch:"build/yorphives-admin-reliability",promotion:"same_repository_fast_forward"
 })
});
export function requiresIndependentPromotion(target){
 return target==="website"&&PUBLISH_DESTINATION.website.repository!==REPO;
}
// The public site publishes from main; the existing private Headquarters
// staging Pages project deploys its canonical version from a different branch.
// Never use the public main branch as a Headquarters release base.
export const RELEASE_BASE_BRANCH=Object.freeze({
 website:"main",headquarters:"build/yorphives-admin-reliability"
});
const COMMON_RELEASE_CHECKS=Object.freeze(["contract-tests","Independent release QA","Release recovery and rollback"]);
export const REQUIRED_RELEASE_CHECKS=Object.freeze([
...COMMON_RELEASE_CHECKS,"Deploy isolated Cloudflare Pages preview",
"Browser smoke tests and SEO crawl","Code review","Lighthouse performance audit"
]);
export const HEADQUARTERS_REQUIRED_RELEASE_CHECKS=Object.freeze([
...COMMON_RELEASE_CHECKS,
"Screenshot and safe interaction tests (no live API)",
"Authenticated Admin browser smoke tests"
]);
export function requiredChecksForTarget(target){
 return target==="website"?REQUIRED_RELEASE_CHECKS:
  target==="headquarters"?HEADQUARTERS_REQUIRED_RELEASE_CHECKS:null;
}
const SHA=/^[0-9a-f]{40}$/i;
const BRANCH=/^(?:build|feature|fix|qa|design|ops)\/[a-z0-9][a-z0-9._/-]{1,110}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const labelsOf=value=>new Set(Array.isArray(value)?value.map(x=>typeof x?.name==="string"?x.name:""):[]);
export function chooseReleaseCandidate(pulls,target){
 if(!Object.hasOwn(RELEASE_PROJECT,target))return {candidate:null,reason:"Unknown release target."};
 if(!Array.isArray(pulls))return {candidate:null,reason:"GitHub candidates could not be verified."};
 const list=pulls.filter(pr=>{
  const labels=labelsOf(pr?.labels);
  return pr?.state==="open"&&pr?.draft===false&&labels.has("release-candidate")&&
   labels.has("scope:"+target)&&pr?.base?.ref===RELEASE_BASE_BRANCH[target]&&pr?.base?.repo?.full_name===REPO&&
   pr?.head?.repo?.full_name===REPO&&SHA.test(pr?.head?.sha||"")&&
   BRANCH.test(pr?.head?.ref||"")&&Number.isSafeInteger(pr.number)&&pr.number>0;
 });
 if(list.length!==1)return {candidate:null,reason:list.length>1?
  "Multiple candidates exist. Keep exactly one reviewed release per target.":
  "No non-draft, labeled production candidate exists for this target."};
 const pr=list[0];return {candidate:{
  number:pr.number,sha:pr.head.sha.toLowerCase(),branch:pr.head.ref,target,
  title:typeof pr.title==="string"?pr.title.slice(0,180):"YorpHives release"
 },reason:null};
}
export function verifyRequiredChecks(checkRuns,sha,target="website"){
 const required=requiredChecksForTarget(target);
 if(!required)return {verified:false,missing:["Unknown release target."]};
 if(!Array.isArray(checkRuns)||!SHA.test(sha||""))
  return {verified:false,missing:[...required]};
 const missing=[];
 for(const name of required){
  const runs=checkRuns.filter(r=>r?.name===name&&String(r.head_sha||"").toLowerCase()===sha.toLowerCase()&&
   r?.app?.slug==="github-actions").sort((a,b)=>
    String(b.started_at||"").localeCompare(String(a.started_at||""))||
    Number(b.id||0)-Number(a.id||0));
  const last=runs[0];
  if(!last||last.status!=="completed"||last.conclusion!=="success"||
   typeof last.completed_at!=="string"||!last.completed_at)missing.push(name);
 }
 return {verified:missing.length===0,missing};
}
export function exactPreview(deployments,candidate){
 if(!candidate||!Array.isArray(deployments)||!Object.hasOwn(RELEASE_PROJECT,candidate.target))return null;
 const project=RELEASE_PROJECT[candidate.target];
 for(const d of deployments){
  if(d?.environment!=="preview"||d?.latest_stage?.name!=="deploy"||
   d.latest_stage?.status!=="success"||d?.deployment_trigger?.metadata?.branch!==candidate.branch||
   String(d?.deployment_trigger?.metadata?.commit_hash||"").toLowerCase()!==candidate.sha||
   !UUID.test(String(d?.id||"")))continue;
  try{
   const u=new URL(d.url);
   if(u.protocol!=="https:"||!u.hostname.endsWith("."+project+".pages.dev")||
    u.hostname.split(".").length!==4||!/^[a-z0-9-]+$/.test(u.hostname.split(".")[0])||
    u.username||u.password||u.port||u.search||u.hash||u.pathname!=="/")continue;
   return {url:u.origin,deploymentId:d.id};
  }catch{/* Discard unsafe URLs. */}
 }
 return null;
}
export function evaluateReleaseReadiness({pulls,checkRuns,deployments,target}){
 const selected=chooseReleaseCandidate(pulls,target);
 if(!selected.candidate)return {target,status:"working",ready_for_preview:false,
  candidate:null,preview:null,blockers:[selected.reason],
  production_approved:false,production_deployment_enabled:false};
 const candidate=selected.candidate,ci=verifyRequiredChecks(checkRuns,candidate.sha,target);
 const preview=exactPreview(deployments,candidate),blockers=[];
 if(!ci.verified)blockers.push("Missing or failing release checks: "+ci.missing.join(", ")+".");
 if(!preview)blockers.push("No successful preview matches the exact source branch and SHA.");
 // No code currently promotes an immutable artifact between the development
 // repo and the SEPARATE public YorpHives repo. Never claim website release
 // readiness from a preview built in yorpHives-2.0 alone.
 if(requiresIndependentPromotion(target))
  blockers.push("Public website publishes from a separate GitHub repository. Verified cross-repository artifact promotion and target verification are not implemented.");
 return {target,status:blockers.length?"verifying":"verified_preview",
  ready_for_preview:!blockers.length,candidate,
  preview:blockers.length?null:preview,blockers,
  production_approved:false,production_deployment_enabled:false};
}
