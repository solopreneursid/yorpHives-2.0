import {adminJson,isAdminResponse,requireAdmin,type AdminRequestContext}
 from "../../_lib/admin-auth";
import {readLiveGoLiveReadiness} from "../../_lib/go-live-live.js";
import {planHeadquartersFastForward} from "../../_lib/hq-go-live-plan.js";
import {diagnoseHeadquartersDrift} from "../../_lib/hq-release-drift.js";
import {verifyHeadquartersD1Isolation} from "../../_lib/hq-resource-isolation.js";
import {REPO,RELEASE_BASE_BRANCH,RELEASE_PROJECT} from "../../_lib/go-live-readiness.js";
const blocked=(reason:string)=>adminJson({eligible:false,plan:null,
 production_deployment_enabled:false,blockers:[reason]});
async function remote(url:string,token:string,cloudflare:boolean):Promise<any>{
 const response=await fetch(url,{method:"GET",headers:{
  authorization:"Bearer "+token,
  accept:cloudflare?"application/json":"application/vnd.github+json",
  ...(!cloudflare?{"x-github-api-version":"2022-11-28"}:{})
 },signal:AbortSignal.timeout(9000)});
 if(!response.ok)throw Error("Could not read a required release control.");
 const body:any=await response.json();
 if(cloudflare){
  if(body?.success!==true||!body.result||typeof body.result!=="object")throw Error("Invalid Pages project.");
  return body.result;
 }
 return body;
}
export async function onRequestGet(context:AdminRequestContext):Promise<Response>{
 const owner=await requireAdmin(context);
 if(isAdminResponse(owner))return owner;
 const env=context.env as AdminRequestContext["env"] & {
  FOUNDER_OWNER_EMAIL?:string;HQ_RELEASE_GITHUB_READ_TOKEN?:string;
  HQ_RELEASE_CLOUDFLARE_READ_TOKEN?:string;HQ_RELEASE_CLOUDFLARE_ACCOUNT_ID?:string;
 };
 if(owner.serviceToken||!env.FOUNDER_OWNER_EMAIL||
    owner.email?.toLowerCase()!==env.FOUNDER_OWNER_EMAIL.toLowerCase())
  return adminJson({eligible:false,plan:null,production_deployment_enabled:false,
   blockers:["Only the verified founder may inspect production release plans."]},403);
 const ready=await readLiveGoLiveReadiness(context.env,"headquarters");
 const gh=String(env.HQ_RELEASE_GITHUB_READ_TOKEN||"");
 const cf=String(env.HQ_RELEASE_CLOUDFLARE_READ_TOKEN||"");
 const account=String(env.HQ_RELEASE_CLOUDFLARE_ACCOUNT_ID||"");
 if(!gh||!cf||!/^[a-f0-9]{32}$/i.test(account))
  return blocked("Read-only credentials not configured.");
 try{
  const github="https://api.github.com/repos/"+REPO;
  const [previous,project]=await Promise.all([
   remote(github+"/branches/"+RELEASE_BASE_BRANCH.headquarters,gh,false),
   remote("https://api.cloudflare.com/client/v4/accounts/"+account+
    "/pages/projects/"+RELEASE_PROJECT.headquarters,cf,true)
  ]);
  const sourceSha=String(previous?.commit?.sha||"");
  const liveSha=String(project?.canonical_deployment?.deployment_trigger?.metadata?.commit_hash||"");
  // The comparison only inspects Git history; no ref or deployment changes.
  const ancestry=/^[a-f0-9]{40}$/.test(sourceSha)&&/^[a-f0-9]{40}$/.test(liveSha)&&
   sourceSha!==liveSha?
    await remote(github+"/compare/"+liveSha+"..."+sourceSha,gh,false):null;
  const drift=diagnoseHeadquartersDrift({
   branch:previous,project,comparison:ancestry,compareBase:liveSha,compareHead:sourceSha
  });
  const isolation=verifyHeadquartersD1Isolation(project);
  if(!ready.ready_for_preview||!drift.reconciled||!isolation.isolated)
   return adminJson({
    eligible:false,plan:null,drift,database_isolation:isolation,
    production_deployment_enabled:false,
    blockers:[...(ready.blockers||[]),
      ...(drift.reconciled?[]:[drift.reason]),
      ...(isolation.isolated?[]:[isolation.reason])]
   });
  const comparison=await remote(github+"/compare/"+sourceSha+"..."+ready.candidate.sha,gh,false);
  const result=planHeadquartersFastForward({
   readiness:ready,branch:previous,project,comparison,
   compareBase:sourceSha,compareHead:ready.candidate.sha
  });
  return adminJson({...result,drift,database_isolation:isolation});
 }catch{return blocked("Exact production ancestry or canonical rollback inspection is unavailable.");}
}
