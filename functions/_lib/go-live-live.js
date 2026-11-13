/** Live, read-only GitHub and Cloudflare checks for a release candidate.
 * This is the SINGLE source for both the founder's Preview and future OTP
 * revalidation. It never sends email, spends AI credits, publishes or writes D1.
 */
import { REPO, RELEASE_PROJECT, RELEASE_BASE_BRANCH, verifyHeadquartersCanonicalBranch, evaluateReleaseReadiness } from "./go-live-readiness.js";

const invalid=(target,message)=>({
 target,status:"verification_unavailable",ready_for_preview:false,
 candidate:null,preview:null,blockers:[message],
 production_approved:false,production_deployment_enabled:false
});

async function readJson(url, token, provider, fetchImpl){
 const response=await fetchImpl(url,{
  method:"GET",
  headers:{
   authorization:"Bearer "+token,
   accept:provider==="github"?"application/vnd.github+json":"application/json",
   ...(provider==="github"?{"x-github-api-version":"2022-11-28"}:{})
  },
  signal:AbortSignal.timeout(9000)
 });
 if(!response.ok)throw Error("Provider verification unavailable.");
 const body=await response.json();
 if(provider==="cloudflare"){
  if(body?.success!==true||!Array.isArray(body.result))throw Error("Invalid Pages evidence.");
  return body.result;
 }
 if(provider==="cloudflare-project"){
  if(body?.success!==true||!body.result||
     typeof body.result!=="object"||Array.isArray(body.result))
   throw Error("Invalid canonical Pages metadata.");
  return body.result;
 }
 return body;
}

export async function readLiveGoLiveReadiness(env,target,fetchImpl=fetch){
 if(!Object.hasOwn(RELEASE_PROJECT,target))return invalid(target,"Unknown release target.");
 const github=String(env?.HQ_RELEASE_GITHUB_READ_TOKEN||"");
 const cloudflare=String(env?.HQ_RELEASE_CLOUDFLARE_READ_TOKEN||"");
 const account=String(env?.HQ_RELEASE_CLOUDFLARE_ACCOUNT_ID||"");
 if(github.length<20||cloudflare.length<20||!/^[a-f0-9]{32}$/i.test(account))
  return invalid(target,"Read-only release verification credentials are not configured.");
 try{
  const pulls=await readJson("https://api.github.com/repos/"+REPO+
   "/pulls?state=open&per_page=100",github,"github",fetchImpl);
  if(!Array.isArray(pulls))return invalid(target,"GitHub candidate inventory invalid.");
  const chosen=evaluateReleaseReadiness({pulls,checkRuns:[],deployments:[],target});
  if(!chosen.candidate)return chosen;
  // Read-only canonical branch vs actual served deployment consistency check.
  // An old deploy can lag GitHub's branch. That makes an automatic rollback
  // ambiguous even when CI is green, so block the founder release workflow.
  if(target==="headquarters"){
   const branch=await readJson("https://api.github.com/repos/"+REPO+
    "/branches/"+RELEASE_BASE_BRANCH.headquarters,github,"github",fetchImpl);
   const project=await readJson("https://api.cloudflare.com/client/v4/accounts/"+
    account+"/pages/projects/"+RELEASE_PROJECT.headquarters,
    cloudflare,"cloudflare-project",fetchImpl);
   const consistent=verifyHeadquartersCanonicalBranch(branch,project);
   if(!consistent.verified)return {
    target,status:"canonical_drift",candidate:chosen.candidate,
    ready_for_preview:false,preview:null,
    blockers:[consistent.reason],production_approved:false,
    production_deployment_enabled:false
   };
  }
  const checks=await readJson("https://api.github.com/repos/"+REPO+
   "/commits/"+chosen.candidate.sha+"/check-runs?per_page=100",
   github,"github",fetchImpl);
  if(!Array.isArray(checks?.check_runs)||
     !Number.isSafeInteger(checks.total_count)||
     checks.total_count>checks.check_runs.length)
   return invalid(target,"Complete exact-revision GitHub Actions evidence unavailable.");
  const deployments=[];
  const endpoint="https://api.cloudflare.com/client/v4/accounts/"+account+
   "/pages/projects/"+RELEASE_PROJECT[target]+"/deployments";
  for(let page=1;page<=5;page++){
   const rows=await readJson(endpoint+"?env=preview&per_page=25&page="+page,
    cloudflare,"cloudflare",fetchImpl);
   deployments.push(...rows);
   if(rows.length<25)break;
  }
  // All values come from live provider data, never a browser-supplied SHA or URL.
  return evaluateReleaseReadiness({
   pulls,checkRuns:checks.check_runs,deployments,target
  });
 }catch{
  return invalid(target,
   "Live release verification failed. Development may continue; production remains locked.");
 }
}
