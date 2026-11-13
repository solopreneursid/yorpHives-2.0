import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {sameHeadquartersCanonical} from "./staging-preview-check.mjs";
/** Independent, read-only attestation of authenticated staging browser evidence. */
export const REQUIRED_CHECKS=Object.freeze([
"access_identity_resolved","yorpmind_six_managers_real_staging_read",
"yorpmind_manager_scan_no_autonomous_release","yorpmind_owner_approval_only_at_go_live",
"founder_security_revoke_isolated",
"release_evidence_no_implicit_production_approval","release_evidence_private_read_only",
"yorpmind_ci_cannot_pass_mfa_step_up","temporary_permissions_staging_schema_ready_but_access_locked",
"website_proof_real_staging_api","website_proof_real_browser_seven_rows",
"yorpmind_ci_identity_cannot_modify_memory","yorpmind_evolution_ci_cannot_review",
"admin_api_requires_access","website_proof_anonymous_access_denied",
"release_evidence_requires_cloudflare_access","browser_page_errors"
]);
const SHA=/^[a-f0-9]{40}$/,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HOST=/^[a-f0-9]{8}\.yorphives-admin-staging\.pages\.dev$/;
export function attestIndependentReleaseQA({preview,smoke,sha,now=Date.now()}){
 const blockers=[],fail=why=>blockers.push(why);
 if(!SHA.test(sha||""))fail("Exact SHA missing");
 if(preview?.staging_project!=="yorphives-admin-staging"||preview?.verified_commit_sha!==sha||
  preview?.verified_existing_deployment!==true||preview?.access_boundary_verified!==true||
  preview?.database_isolation_verified!==true||
  preview?.no_deployment_created!==true||preview?.no_production_change!==true||
  !sameHeadquartersCanonical(preview?.canonical_before,preview?.canonical_after)||
  !/^[a-f0-9]{40}$/.test(preview?.canonical_before?.sha||"")||
  preview?.canonical_before?.branch!=="build/yorphives-admin-reliability"||
  preview?.owner_mfa_verified!==false||preview?.assistant_grants_created!==0||
  preview?.ai_model_calls!==0||preview?.database_writes!==0||
  !UUID.test(preview?.deployment_id||""))
  fail("Invalid preview provenance or permission boundary");
 let host=null;
 try{
  const u=new URL(preview?.preview_url||"");
  if(u.protocol!=="https:"||!HOST.test(u.hostname)||u.port||u.username||u.password||
     u.pathname!=="/"||u.search||u.hash)throw Error("Unsafe host");
  host=u.hostname;
 }catch{fail("Unapproved private preview origin");}
 // Repeated route records can conceal conflicting Access results.
 const routes=Array.isArray(preview?.anonymous_paths_checked)?preview.anonymous_paths_checked:[];
 if(routes.length!==2||new Set(routes.map(x=>x?.route)).size!==routes.length)
  fail("Ambiguous or duplicate anonymous Access route evidence");
 for(const route of ["/admin/","/api/admin/yorpmind-team"]){
  const proof=Array.isArray(preview?.anonymous_paths_checked)?
   preview.anonymous_paths_checked.find(x=>x.route===route):null;
  const redirect=proof&&[301,302,303,307,308].includes(proof.status);
  const direct=proof&&[401,403].includes(proof.status);
  if(!proof||proof.access_blocked!==true||(!redirect&&!direct)||
     (redirect&&(proof.denial_kind!=="verified_cloudflare_access_redirect"||
      proof.access_redirect_verified!==true))||
     (direct&&(proof.denial_kind!=="http_auth_denial"||
      proof.access_redirect_verified!==false)))
   fail("Anonymous protection or Access denial provenance missing: "+route);
 }
 if(!smoke||smoke.target_host!==host||
  smoke.source_commit!==sha||smoke.deployment_id!==preview?.deployment_id||
  !Number.isSafeInteger(smoke?.summary?.total)||
  smoke.summary.total<REQUIRED_CHECKS.length||smoke.summary.failed!==0||
  smoke.summary.passed!==smoke.summary.total||
  !Array.isArray(smoke.checks)||smoke.checks.length!==smoke.summary.total||
  !smoke.checks.every(x=>x&&x.ok===true&&typeof x.name==="string"))
  fail("Missing, failed or mismatched authenticated browser evidence");
 const names=Array.isArray(smoke?.checks)?smoke.checks.map(x=>x?.name):[];
 if(new Set(names).size!==names.length)
  fail("Duplicate browser assertion names are not independently verifiable");
 const passed=new Set(Array.isArray(smoke?.checks)?smoke.checks.filter(x=>x?.ok).map(x=>x.name):[]);
 for(const name of REQUIRED_CHECKS)if(!passed.has(name))fail("Missing assertion: "+name);
 const fresh=value=>{
  // Accept only explicit UTC timestamps; local or offset-free strings are ambiguous.
  if(typeof value!=="string"||
     !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value))return false;
  const ms=Date.parse(value);
  return Number.isFinite(ms)&&ms<=now&&now-ms<=14400000;
 };
 if(!fresh(preview?.checked_at)||!fresh(smoke?.generated_at))fail("Evidence stale or undated");
 if(fresh(preview?.checked_at)&&fresh(smoke?.generated_at)&&
    Date.parse(smoke.generated_at)<Date.parse(preview.checked_at))
  fail("Smoke run predates the verified preview");
 return Object.freeze({schema_version:1,source_commit:sha,target:"headquarters",
  evidence_verified:blockers.length===0,production_approved:false,
  production_deployed:false,assertions:passed.size,blockers});
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const [previewPath,smokePath]=process.argv.slice(2);
 if(!previewPath||!smokePath)throw Error("Two sanitized evidence files required");
 const result=attestIndependentReleaseQA({
  preview:JSON.parse(await readFile(previewPath,"utf8")),
  smoke:JSON.parse(await readFile(smokePath,"utf8")),
  sha:process.env.RELEASE_EXPECTED_SHA
 });
 console.log(JSON.stringify(result,null,2));
 if(!result.evidence_verified)process.exitCode=1;
}
