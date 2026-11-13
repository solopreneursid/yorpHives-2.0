import { adminJson,isAdminResponse,requireAdmin,type AdminRequestContext } from "../../_lib/admin-auth";
import { REPO,RELEASE_PROJECT,evaluateReleaseReadiness } from "../../_lib/go-live-readiness.js";
type Env=AdminRequestContext["env"]&{
 HQ_RELEASE_GITHUB_READ_TOKEN?:string;
 HQ_RELEASE_CLOUDFLARE_READ_TOKEN?:string;
 HQ_RELEASE_CLOUDFLARE_ACCOUNT_ID?:string;
};
type Context=AdminRequestContext&{env:Env};
async function readJson(url:string,token:string,provider:"github"|"cloudflare"){
 const r=await fetch(url,{method:"GET",headers:{
  authorization:"Bearer "+token,
  accept:provider==="github"?"application/vnd.github+json":"application/json",
  ...(provider==="github"?{"x-github-api-version":"2022-11-28"}:{})
 },signal:AbortSignal.timeout(9000)});
 if(!r.ok)throw Error("Release metadata unavailable");
 const obj:any=await r.json();
 if(provider==="cloudflare"){
  if(obj?.success!==true||!Array.isArray(obj.result))throw Error("Invalid Pages metadata");
  return obj.result;
 }
 return obj;
}
export async function onRequestGet(context:Context):Promise<Response>{
 const identity=await requireAdmin(context);
 if(isAdminResponse(identity))return identity;
 const target=new URL(context.request.url).searchParams.get("target")||"website";
 if(target!=="website"&&target!=="headquarters")
  return adminJson({error:{code:"INVALID_TARGET",message:"Select website or headquarters."},
   production_deployment_enabled:false},400);
 const locked=(message:string)=>adminJson({target,status:"verification_unavailable",
  ready_for_preview:false,candidate:null,preview:null,blockers:[message],
  production_approved:false,production_deployment_enabled:false});
 const gh=String(context.env.HQ_RELEASE_GITHUB_READ_TOKEN||"");
 const cf=String(context.env.HQ_RELEASE_CLOUDFLARE_READ_TOKEN||"");
 const account=String(context.env.HQ_RELEASE_CLOUDFLARE_ACCOUNT_ID||"");
 if(gh.length<20||cf.length<20||!/^[0-9a-f]{32}$/i.test(account))
  return locked("Read-only GitHub and Cloudflare release inspection is not configured.");
 try{
  const pulls=await readJson("https://api.github.com/repos/"+REPO+
   "/pulls?state=open&per_page=100",gh,"github");
  if(!Array.isArray(pulls))return locked("GitHub candidate inventory is invalid.");
  const chosen=evaluateReleaseReadiness({pulls,checkRuns:[],deployments:[],target});
  if(!chosen.candidate)return adminJson(chosen);
  const checks:any=await readJson("https://api.github.com/repos/"+REPO+
   "/commits/"+chosen.candidate.sha+"/check-runs?per_page=100",gh,"github");
  if(!Array.isArray(checks?.check_runs)||!Number.isSafeInteger(checks.total_count)||
    checks.total_count>checks.check_runs.length)
   return locked("Complete GitHub Actions evidence is unavailable.");
  const endpoint="https://api.cloudflare.com/client/v4/accounts/"+account+
    "/pages/projects/"+RELEASE_PROJECT[target]+"/deployments";
  const deployments:any[]=[];
  for(let page=1;page<=5;page++){
   const values=await readJson(endpoint+"?env=preview&per_page=25&page="+page,cf,"cloudflare");
   deployments.push(...values);
   if(values.length<25)break;
  }
  return adminJson(evaluateReleaseReadiness({
   pulls,checkRuns:checks.check_runs,deployments,target
  }));
 }catch{
  return locked("Live verification failed; development may continue but publishing stays locked.");
 }
}
