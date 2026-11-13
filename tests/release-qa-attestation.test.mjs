import test from "node:test";
import assert from "node:assert/strict";
import {REQUIRED_CHECKS,attestIndependentReleaseQA} from "../scripts/release-qa-attestation.mjs";
const sha="a".repeat(40),now=Date.parse("2026-11-13T13:00:00Z");
const host="aaa7346f.yorphives-admin-staging.pages.dev";
const preview={staging_project:"yorphives-admin-staging",verified_commit_sha:sha,
 deployment_id:"aaa7346f-9150-4aa5-81be-2103f76d263d",preview_url:"https://"+host,
 verified_existing_deployment:true,access_boundary_verified:true,
 anonymous_paths_checked:[{route:"/admin/",access_blocked:true,status:302,
  denial_kind:"verified_cloudflare_access_redirect",access_redirect_verified:true},
 {route:"/api/admin/yorpmind-team",access_blocked:true,status:403,
  denial_kind:"http_auth_denial",access_redirect_verified:false}],
 authenticated_browser_test_completed:false,no_deployment_created:true,
 no_production_change:true,
 canonical_before:{id:"77ffbf58-5ff8-4f01-90ba-6e657d9acfc0",sha:"f".repeat(40),branch:"build/yorphives-admin-reliability"},
 canonical_after:{id:"77ffbf58-5ff8-4f01-90ba-6e657d9acfc0",sha:"f".repeat(40),branch:"build/yorphives-admin-reliability"},
 owner_mfa_verified:false,assistant_grants_created:0,
 ai_model_calls:0,database_writes:0,checked_at:"2026-11-13T12:56:00Z"};
const smoke={target_host:host,source_commit:sha,deployment_id:preview.deployment_id,generated_at:"2026-11-13T12:58:00Z",
 summary:{total:REQUIRED_CHECKS.length,passed:REQUIRED_CHECKS.length,failed:0},
 checks:REQUIRED_CHECKS.map(name=>({name,ok:true}))};
const attest=(over={})=>attestIndependentReleaseQA({
 preview:over.preview??preview,smoke:over.smoke??smoke,sha:over.sha??sha,now:over.now??now});
test("real signed-in preview proof can pass without granting production rights",()=>{
 const x=attest();assert.equal(x.evidence_verified,true);
 assert.equal(x.production_deployed,false);assert.equal(x.production_approved,false);
});
test("wrong commit, host, access denial, expired or mutable preview fails",()=>{
 for(const p of [
 {...preview,verified_commit_sha:"b".repeat(40)},
 {...preview,preview_url:"https://yorphives.com"},
 {...preview,access_boundary_verified:false},
 {...preview,no_production_change:false},
 {...preview,canonical_after:{...preview.canonical_after,sha:"e".repeat(40)}},
 {...preview,canonical_before:undefined},
 {...preview,assistant_grants_created:1},
 {...preview,anonymous_paths_checked:[{route:"/admin/",access_blocked:false,status:200}]},
 {...preview,checked_at:"2026-11-12T10:00:00Z"}
 ])assert.equal(attest({preview:p}).evidence_verified,false);
});
test("incomplete or stale browser assertions prevent independent QA",()=>{
 for(const x of [
 {...smoke,target_host:"fake.example"},
 {...smoke,source_commit:"b".repeat(40)},
 {...smoke,deployment_id:"77ffbf58-5ff8-4f01-90ba-6e657d9acfc0"},
 {...smoke,source_commit:undefined},
 {...smoke,deployment_id:undefined},
 {...smoke,checks:smoke.checks.map((v,i)=>i?v:{...v,ok:false})},
 {...smoke,checks:smoke.checks.slice(1)},
 {...smoke,summary:{...smoke.summary,failed:1}},
 {...smoke,generated_at:"2026-11-13T08:00:00Z"},
 {...smoke,generated_at:"2026-11-13T12:40:00Z"}
 ])assert.equal(attest({smoke:x}).evidence_verified,false);
 assert.equal(attest({sha:"c".repeat(40)}).evidence_verified,false);
});

test("duplicate or ambiguous Access and signed-in QA evidence fails closed",()=>{
 const repeatedRoutes={...preview,anonymous_paths_checked:[
  preview.anonymous_paths_checked[0],preview.anonymous_paths_checked[0]
 ]};
 assert.equal(attest({preview:repeatedRoutes}).evidence_verified,false);
 const extraRoute={...preview,anonymous_paths_checked:[
  ...preview.anonymous_paths_checked,
  {route:"/admin/",access_blocked:false,status:200}
 ]};
 assert.equal(attest({preview:extraRoute}).evidence_verified,false);
 const duplicateChecks={...smoke,
  summary:{total:smoke.checks.length+1,passed:smoke.checks.length+1,failed:0},
  checks:[...smoke.checks,smoke.checks[0]]};
 assert.equal(attest({smoke:duplicateChecks}).evidence_verified,false);
});
test("HTTP redirects without verified Cloudflare Access provenance are never accepted",()=>{
 for(const proof of [
  {route:"/admin/",access_blocked:true,status:302},
  {route:"/admin/",access_blocked:true,status:302,denial_kind:"http_auth_denial",access_redirect_verified:false},
  {route:"/admin/",access_blocked:true,status:302,denial_kind:"verified_cloudflare_access_redirect",access_redirect_verified:false},
  {route:"/admin/",access_blocked:true,status:403,denial_kind:"verified_cloudflare_access_redirect",access_redirect_verified:true},
  {route:"/admin/",access_blocked:true,status:403,denial_kind:"http_auth_denial",access_redirect_verified:true}
 ]){
  const changed={...preview,anonymous_paths_checked:[proof,preview.anonymous_paths_checked[1]]};
  assert.equal(attest({preview:changed}).evidence_verified,false,JSON.stringify(proof));
 }
});
test("QA timestamps must be explicit UTC and valid",()=>{
 for(const checked_at of [
  "2026-11-13T12:56:00",
  "2026-11-13 12:56:00",
  "2026-11-13T12:56:00+00:00",
  "not a timestamp"
 ])assert.equal(attest({preview:{...preview,checked_at}}).evidence_verified,false);
 for(const generated_at of [
  "2026-11-13T12:58:00",
  "2026-11-13 12:58:00",
  "2026-11-13T12:58:00+00:00"
 ])assert.equal(attest({smoke:{...smoke,generated_at}}).evidence_verified,false);
});
