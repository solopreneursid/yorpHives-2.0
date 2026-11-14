/**
 * One-purpose live provider read-only preflight.
 * Validates Headquarters Pages account metadata and D1 isolation, never
 * uses SQL, changes Cloudflare configuration or prints authentication tokens.
 */
import { readHeadquartersD1Isolation } from "./staging-preview-check.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function inspectLiveHeadquartersIsolation({
  accountId,apiToken,fetcher=globalThis.fetch,clock=()=>new Date()
}) {
  const at=clock();
  if(!(at instanceof Date) || !Number.isFinite(at.getTime()))throw Error("Invalid review time");
  let isolated=false, reason="Cloudflare metadata unavailable; no deployment permitted.";
  try{
    const result=await readHeadquartersD1Isolation({accountId,apiToken,fetcher});
    isolated=result.isolated === true;
    reason=isolated ? "Distinct D1 identities verified; migrations and deployment remain blocked pending independent recovery and staging evidence." :
      "Verified isolation was not established.";
  }catch{
    // Never surface raw HTTP errors or Cloudflare token-bearing exceptions.
    reason="Cloudflare metadata unavailable OR preview/canonical D1 not independently isolated; deployment blocked.";
  }
  return Object.freeze({
    schema_version:1,
    subject:"YorpHives Headquarters",
    source:"live_cloudflare_pages_project_metadata",
    verified_at:at.toISOString(),
    d1_isolated:isolated,
    // A new empty and physically isolated database is NOT schema-ready,
    // authenticated, restored or eligible for a functional launch rehearsal.
    staging_binding_safe:isolated,
    staging_safe_to_test:false,
    schema_verified:false,
    recovery_verified:false,
    migration_allowed:false,
    cloud_resources_modified:false,
    production_deployment_authorized:false,
    report_type:"read_only_isolation_preflight",
    reason
  });
}
async function main(){
  const result=await inspectLiveHeadquartersIsolation({
    accountId:process.env.CF_ACCOUNT_ID||"",apiToken:process.env.CF_API_TOKEN||""
  });
  const output=resolve(process.cwd(),"artifacts/headquarters-readiness");
  await mkdir(output,{recursive:true});
  await writeFile(resolve(output,"live-provider-isolation.json"),
    JSON.stringify(result,null,2)+"\n",{encoding:"utf8",mode:0o600});
  console.log(JSON.stringify({
    source:result.source,verified_at:result.verified_at,
    d1_isolated:result.d1_isolated,
    staging_safe_to_test:false,
    production_deployment_authorized:false,
    note:result.reason
  }));
  if(!result.d1_isolated)process.exitCode=1;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))
  await main().catch(()=>{console.error("Live D1 preflight failed closed.");process.exitCode=1;});
