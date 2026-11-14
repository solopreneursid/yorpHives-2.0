/**
 * Retired HQ preview containment audit.
 * Verifies real Access applications have *no* allow policies, so old public
 * Pages preview aliases receive provider-level default-deny protection.
 * A configured Access rule is NOT an external HTTP proof of denial.
 *
 * Read-only: GET Access apps + GET policies for exactly two approved domains.
 */
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

const BASE="yorphives-2-preview.pages.dev";
const HOSTS=[BASE,"*."+BASE];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function evaluateRetiredAccessApps(apps, policyResults) {
 const checked=HOSTS.map(host=>{
  const matches=Array.isArray(apps)?apps.filter(a=>a?.domain===host):[];
  const app=matches.length===1?matches[0]:null;
  const rows=app && policyResults && Array.isArray(policyResults[app.id])
   ? policyResults[app.id]:null;
  return Object.freeze({
   host_type:host===BASE?"apex":"wildcard",
   configured:matches.length===1 && app?.type==="self_hosted" &&
      UUID.test(String(app?.id||"")) && rows!==null && rows.length===0,
   // no policy (or no Allow policy) is required; do not treat a generic
   // service token, bypass selector or policy metadata as authorized.
   allow_policy_detected:rows?.some(x=>['allow','bypass','non_identity'].includes(x?.decision))===true
  });
 });
 return Object.freeze({
  source:"cloudflare_access_configuration_read_only",
  schema_version:1,retired_preview_hostname_default_denied:checked.every(x=>x.configured),
  anonymous_http_denial_verified:false,owner_login_verified:false,
  pages_deployment_history_audited:false,
  checks:checked,cloudflare_resources_modified:false
 });
}
export async function inspectRetiredAccess({
 accountId,apiToken,fetcher=globalThis.fetch
}={}){
 if(!/^[0-9a-f]{32}$/i.test(String(accountId||""))||
   !apiToken||typeof fetcher!=="function")throw Error("Access read-only credentials required");
 const prefix="https://api.cloudflare.com/client/v4/accounts/"+accountId;
 async function read(url) {
  let response,data;
  try{
   response=await fetcher(url,{method:"GET",redirect:"manual",
    headers:{authorization:"Bearer "+apiToken,accept:"application/json"},
    signal:AbortSignal.timeout(10000)});
   if(response.status!==200||response.redirected)throw Error("Invalid status");
   data=await response.json();
  }catch{throw Error("Access evidence unavailable; deny-by-default audit failed");}
  if(data?.success!==true)throw Error("Access evidence unavailable; deny-by-default audit failed");
  return data.result;
 }
 const apps=await read(prefix+"/access/apps");
 if(!Array.isArray(apps))throw Error("Access evidence unavailable; deny-by-default audit failed");
 const policies={};
 for(const host of HOSTS){
  const found=apps.filter(x=>x?.domain===host);
  if(found.length!==1||found[0]?.type!=="self_hosted"||!UUID.test(found[0]?.id))
   return evaluateRetiredAccessApps(apps,policies);
  policies[found[0].id]=await read(prefix+"/access/apps/"+found[0].id+"/policies");
 }
 return evaluateRetiredAccessApps(apps,policies);
}
async function main(){
 let r;
 try{r=await inspectRetiredAccess({
  accountId:process.env.CF_ACCOUNT_ID,apiToken:process.env.CF_API_TOKEN
 });}
 catch{console.error("Retired preview Access evidence unavailable; review blocked");process.exitCode=1;return;}
 const directory=resolve(process.cwd(),"artifacts/headquarters-readiness");
 await mkdir(directory,{recursive:true});
 await writeFile(resolve(directory,"legacy-access.json"),JSON.stringify(r,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify({source:r.source,retired_default_denied:r.retired_preview_hostname_default_denied,
  anonymous_http_denial_verified:false}));
 if(!r.retired_preview_hostname_default_denied)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 await main();
