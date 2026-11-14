/**
 * Read-only Cloudflare topology audit for private YorpHives Headquarters.
 *
 * Cloudflare Pages projects can share D1 and privileged Worker services even
 * when branches are different. This inventory is explicitly provider-specific,
 * while the HQ product stays portable via its read-only HTTP adapter.
 *
 * No network calls unless explicitly run by auditPagesTopology(). Never read
 * private database contents, print IDs/credentials, deploy or mutate resources.
 */
import {verifyHeadquartersD1Isolation} from "../functions/_lib/hq-resource-isolation.js";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

const PROJECTS=Object.freeze(["yorphives-admin-staging","yorphives-2-preview"]);
const SECRET_KEYS=new Set(["FOUNDER_EMAIL_API_TOKEN","FOUNDER_OTP_HMAC_KEY",
 "FOUNDER_OTP_FROM","FOUNDER_OTP_ENABLED"]);
const check=(name,ok,reason)=>Object.freeze({name,passed:ok===true,detail:reason});

export function evaluatePagesTopology(primary,archive) {
 const app=primary?.deployment_configs;
 const canonical=app?.production;
 const preview=app?.preview;
 const retired=archive?.deployment_configs;
 const ownerOK=primary?.name==="yorphives-admin-staging" &&
    primary?.source?.type==="github" &&
    primary?.source?.config?.owner==="solopreneursid" &&
    primary?.source?.config?.repo_name==="yorpHives-2.0" &&
    primary?.production_branch==="build/yorphives-admin-reliability";
 const archiveOwnerOK=archive?.name==="yorphives-2-preview" &&
    archive?.source?.type==="github" &&
    archive?.source?.config?.owner==="solopreneursid" &&
    archive?.source?.config?.repo_name==="yorpHives-2.0";
 const evidence=verifyHeadquartersD1Isolation(primary);
 const services=Object.keys(preview?.services||{});
 const prodServices=Object.keys(canonical?.services||{});
 const activePreviewEnv=Object.keys(preview?.env_vars||{});
 const checks=[
  check("canonical_identity",ownerOK,"Canonical HQ repository, project and production branch must be identified."),
  check("future_preview_db_isolated",ownerOK && evidence.isolated,
    "Current Pages preview and canonical D1 bindings must identify different physical databases."),
  check("preview_execution_bindings_removed",services.length===0,
    "Preview must not bind privileged repair/AI/research Worker services."),
  check("preview_otp_retired",!activePreviewEnv.some(name=>SECRET_KEYS.has(name)),
    "Retired founder OTP secrets/flags must be absent from the preview runtime configuration."),
  check("archive_identity",archiveOwnerOK,
    "The legacy experimental Pages project must belong to the expected separate HQ repo."),
  check("archive_automatic_builds_disabled",
    archiveOwnerOK && archive?.source?.config?.preview_deployment_setting==="none" &&
    archive?.source?.config?.production_deployments_enabled===false,
    "The legacy experimental project must not create automatic preview or canonical deployments."),
  check("archive_database_unbound",
    archiveOwnerOK && Object.keys(retired?.preview?.d1_databases||{}).length===0 &&
    Object.keys(retired?.production?.d1_databases||{}).length===0,
    "The legacy experimental project must not bind any current D1 database."),
  // The canonical old runtime still has this Worker service. Until a
  // monitoring-only canonical release is independently authenticated and
  // functional, we must never declare the topology fully hardened.
  check("canonical_execution_service_retired",
    ownerOK && prodServices.length===0,
    "Existing canonical HQ still binds a privileged Worker service; replace it only after a verified monitor-only release and rollback review.")
 ];
 return Object.freeze({
   schema_version:1,source:"live_pages_configuration_read_only",
   archived_preview_d1_isolated:evidence.isolated && 
     Object.keys(retired?.preview?.d1_databases||{}).length===0,
   historical_deployments_independently_audited:false,
   staging_schema_verified:false,
   live_owner_access_verified:false,
   original_database_untouched_by_audit:true,
   production_deployment_authorized:false,
   no_current_canonical_release_assumed:true,
   topology_hardened:checks.every(x=>x.passed),
   checks,blockers:checks.filter(x=>!x.passed)
 });
}

export async function auditPagesTopology({
 accountId,apiToken,fetcher=globalThis.fetch
}={}) {
 if(!/^[a-f0-9]{32}$/i.test(String(accountId||""))||
    typeof apiToken!=="string"||apiToken.length<4||
    typeof fetcher!=="function")
   throw Error("Read-only provider credentials required");
 const results=[];
 for(const project of PROJECTS) {
  const url="https://api.cloudflare.com/client/v4/accounts/"+accountId+
    "/pages/projects/"+project;
  let response,payload;
  try{
   response=await fetcher(url,{method:"GET",redirect:"manual",
    headers:{authorization:"Bearer "+apiToken,accept:"application/json"},
    signal:AbortSignal.timeout(10000)});
   if(response.status!==200||response.redirected)
     throw Error("Provider metadata unavailable");
   payload=await response.json();
  }catch{throw Error("Provider topology could not be independently read");}
  if(payload?.success!==true||!payload.result)
    throw Error("Provider topology could not be independently read");
  results.push(payload.result);
 }
 return evaluatePagesTopology(...results);
}

async function main(){
 let result;
 try{result=await auditPagesTopology({
  accountId:process.env.CF_ACCOUNT_ID,apiToken:process.env.CF_API_TOKEN
 });}
 catch{console.error("HQ provider topology unavailable; blocked");process.exitCode=1;return;}
 const output=resolve(process.cwd(),"artifacts/headquarters-readiness");
 await mkdir(output,{recursive:true});
 await writeFile(resolve(output,"live-topology.json"),
  JSON.stringify(result,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify({
  source:result.source,topology_hardened:result.topology_hardened,
  blocked:result.blockers.map(x=>x.name),production_deployment_authorized:false
 }));
 if(!result.topology_hardened)process.exitCode=1;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))
 await main();
