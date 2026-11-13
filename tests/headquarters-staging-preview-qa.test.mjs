import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  validateExistingAdminPreview, verifyAnonymousBoundary,
  locateExactExistingPreview
} from "../scripts/staging-preview-check.mjs";

const sha="a".repeat(40);
const account="69234e51e08d8013980a7ff869746609";
const deploymentId="000982b1-e50e-49e9-93da-3495a2a6e208";
const branch="qa/headquarters-authenticated-preview-rehearsal";
const origin="https://000982b1.yorphives-admin-staging.pages.dev";
const validDeployment={
  id:deploymentId,url:origin,environment:"preview",
  latest_stage:{name:"deploy",status:"success"},
  deployment_trigger:{metadata:{branch,commit_hash:sha}}
};
const expected={project:"yorphives-admin-staging",deploymentId,branch,commitSha:sha};

test("Only a successful exact-SHA branch preview is eligible for private sign-in QA",()=>{
  const valid=validateExistingAdminPreview(validDeployment,expected);
  assert.equal(valid?.url,origin);
  assert.equal(valid?.commitSha,sha);
  assert.equal(valid?.production_change_authorized,false);
  for(const [patch,why] of [
    [{latest_stage:{name:"deploy",status:"active"}},"active is not successful"],
    [{environment:"production"},"production never used"],
    [{url:"https://yorphives.com"},"public hostname"],
    [{url:"https://yorphives-admin-staging.pages.dev"},"project alias"],
    [{url:"https://evil.example"},"unapproved origin"],
    [{url:origin+"/admin/"},"non-root URL"],
    [{url:origin+"?token=secret"},"query credentials"],
    [{deployment_trigger:{metadata:{branch,commit_hash:"b".repeat(40)}}},"wrong SHA"],
    [{deployment_trigger:{metadata:{branch:"main",commit_hash:sha}}},"wrong branch"],
    [{id:"11111111-1111-4111-8111-111111111111"},"wrong deployment"]
  ]) {
    assert.equal(validateExistingAdminPreview({...validDeployment,...patch},expected),null,why);
  }
  assert.equal(validateExistingAdminPreview(validDeployment,{...expected,branch:"main"}),null);
  assert.equal(validateExistingAdminPreview(validDeployment,{...expected,project:"yorphives-2-preview"}),null);
});

test("Cloudflare lookup is a single bounded GET that checks metadata, never creates a preview",async()=>{
  const requests=[];
  const fetcher=async (url,options)=>{
    requests.push({url,options});
    return Response.json({success:true,result:validDeployment});
  };
  const result=await locateExactExistingPreview({
    accountId:account,apiToken:"not-logged",deploymentId,branch,commitSha:sha,fetcher
  });
  assert.equal(result.url,origin);
  assert.equal(requests.length,1);
  assert.equal(requests[0].options.method,"GET");
  assert.equal(requests[0].options.headers.authorization,"Bearer not-logged");
  assert.equal(requests[0].url,
    "https://api.cloudflare.com/client/v4/accounts/"+account+
    "/pages/projects/yorphives-admin-staging/deployments/"+deploymentId);
  await assert.rejects(()=>locateExactExistingPreview({
    accountId:account,apiToken:"token",deploymentId,branch,
    commitSha:sha,fetcher:async()=>Response.json({
      success:true,result:{...validDeployment,latest_stage:{name:"deploy",status:"pending"}}
    })
  }),/does not match/);
  await assert.rejects(()=>locateExactExistingPreview({
    accountId:account,apiToken:"token",deploymentId,branch,
    commitSha:sha,fetcher:async()=>Response.json({success:false},{status:403})
  }),/could not be verified/);
  await assert.rejects(()=>locateExactExistingPreview({
    accountId:account,apiToken:"",deploymentId,branch,commitSha:sha,fetcher
  }),/required/);
});

test("Both private endpoints must deny anonymous requests before auth credentials are used",async()=>{
  const seen=[];
  const fetcher=async (url,options)=>{
    seen.push({url,options});
    return new Response(null,{
      status:url.endsWith("/admin/")?302:403,
      headers:url.endsWith("/admin/")?
        {location:"https://owner.cloudflareaccess.com/cdn-cgi/access/login"}:{}
    });
  };
  const proof=await verifyAnonymousBoundary(origin,fetcher);
  assert.equal(proof.access_boundary_verified,true);
  assert.deepEqual(proof.routes.map(r=>r.route),
    ["/admin/","/api/admin/yorpmind-team"]);
  assert.ok(proof.routes.every(r=>r.access_blocked));
  assert.equal(proof.model_calls,0);
  assert.equal(proof.database_writes,0);
  assert.ok(seen.every(r=>r.options.method==="GET"&&
    r.options.redirect==="manual"&&!r.options.headers.authorization));
});

test("Anonymous HTTP 200, misleading redirects or 5xx halt staging authorization",async()=>{
  await assert.rejects(()=>verifyAnonymousBoundary(origin,
    async()=>new Response("Unprotected",{status:200})),/not securely denied/);
  await assert.rejects(()=>verifyAnonymousBoundary(origin,
    async()=>new Response(null,{status:302,headers:{location:"https://attacker.example/login"}})
  ),/not securely denied/);
  await assert.rejects(()=>verifyAnonymousBoundary(origin,
    async()=>new Response(null,{status:500})),/not securely denied/);
  await assert.rejects(()=>verifyAnonymousBoundary(origin,
    async()=>{throw Error("Private network error");}),/Cannot confirm/);
  await assert.rejects(()=>verifyAnonymousBoundary("https://yorphives.com"),
    /unapproved Headquarters origin/);
});

test("Automatic staging preview search matches exact branch and SHA; never writes",async()=>{
  const seen=[];
  const matching={...validDeployment};
  const wrong={...validDeployment,
    deployment_trigger:{metadata:{branch,commit_hash:"b".repeat(40)}}};
  const fetcher=async (url,opts)=>{
    seen.push({url,opts});
    return Response.json({success:true,result:[wrong,matching]});
  };
  const {locateMatchingAdminPreview}=await import("../scripts/staging-preview-check.mjs");
  const actual=await locateMatchingAdminPreview({
    accountId:account,apiToken:"read-token",branch,commitSha:sha,fetcher
  });
  assert.equal(actual?.url,origin);
  assert.equal(actual?.commitSha,sha);
  assert.equal(seen.length,1);
  assert.equal(seen[0].opts.method,"GET");
  assert.match(seen[0].url,/env=preview&per_page=10&page=1/);
  assert.ok(!JSON.stringify(actual).includes("read-token"));
  await assert.rejects(()=>locateMatchingAdminPreview({
    accountId:account,apiToken:"read-token",branch,commitSha:sha,
    fetcher:async()=>Response.json({success:true,result:[wrong]})
  }),/No successful, matching-code/);
});

test("Signed-in QA is non-deploying and needs no founder approval before release",async()=>{
  const workflow=await readFile(new URL("../.github/workflows/admin-staging-quality.yml",import.meta.url),"utf8");
  const smoke=await readFile(new URL("../scripts/admin-smoke.mjs",import.meta.url),"utf8");
  const verifier=await readFile(new URL("../scripts/verify-existing-admin-preview.mjs",import.meta.url),"utf8");
  assert.match(workflow,/workflow_dispatch:/);
  assert.doesNotMatch(workflow,/confirm_preview_reviewed:/);
  assert.doesNotMatch(workflow,/CONFIRM_PREVIEW_REVIEWED/);
  assert.match(workflow,/Verify isolated staging revision without founder approval/);
  assert.match(workflow,/Only isolated development branches can be tested here/);
  assert.match(workflow,/PAGES_COMMIT_SHA:/);
  assert.match(workflow,/staging-deployments/);
  assert.match(workflow,/verify-existing-admin-preview\.mjs/);
  assert.match(workflow,/CF_ACCESS_CLIENT_ID/);
  assert.match(workflow,/CF_ACCESS_CLIENT_SECRET/);
  assert.doesNotMatch(workflow,/^\s+push:/m);
  assert.doesNotMatch(workflow,/npm run deploy:pages-preview/);
  assert.doesNotMatch(workflow,/wrangler\s+deploy/);
  assert.match(verifier,/await verifyAnonymousBoundary\(preview\.url\)/);
  assert.match(verifier,/locateMatchingAdminPreview/);
  assert.match(verifier,/GITHUB_ENV/);
  assert.match(verifier,/checkedOut/);
  assert.match(smoke,/website_proof_real_staging_api/);
  assert.match(smoke,/website_proof_real_browser_seven_rows/);
  assert.match(smoke,/website_proof_real_chatgpt_handoff/);
  assert.match(smoke,/website_proof_real_yorpmind_handoff/);
  assert.match(smoke,/website_proof_anonymous_access_denied/);
  assert.match(smoke,/yorpmind_real_coaching_unapproved/);
});

test("Cloudflare canonical production state is really inspected before trusting no-change evidence",async()=>{
 const {readHeadquartersCanonical,validateHeadquartersCanonical,sameHeadquartersCanonical}=
  await import("../scripts/staging-preview-check.mjs");
 const branch="build/yorphives-admin-reliability";
 const canonical={id:"77ffbf58-5ff8-4f01-90ba-6e657d9acfc0",environment:"production",
  latest_stage:{name:"deploy",status:"success"},
  deployment_trigger:{metadata:{branch,commit_hash:sha}}};
 const project={name:"yorphives-admin-staging",production_branch:branch,
  source:{type:"github",config:{owner:"solopreneursid",repo_name:"yorpHives-2.0",production_branch:branch}},
  canonical_deployment:canonical};
 const valid=validateHeadquartersCanonical(project);
 assert.equal(valid.sha,sha);
 assert.equal(sameHeadquartersCanonical(valid,{...valid}),true);
 assert.equal(sameHeadquartersCanonical(valid,{...valid,id:"123e4567-e89b-42d3-a456-000000000009"}),false);
 for(const wrong of [
  {...project,production_branch:"main"},
  {...project,source:{...project.source,config:{...project.source.config,repo_name:"YorpHives"}}},
  {...project,canonical_deployment:{...canonical,latest_stage:{name:"deploy",status:"failure"}}},
  {...project,canonical_deployment:{...canonical,environment:"preview"}}
 ])assert.equal(validateHeadquartersCanonical(wrong),null);
 const calls=[];
 const fetcher=async(url,options)=>{calls.push({url,method:options.method});
  return Response.json({success:true,result:project});};
 const actual=await readHeadquartersCanonical({accountId:account,apiToken:"read-only",fetcher});
 assert.deepEqual(actual,valid);
 assert.equal(calls.length,1);
 assert.equal(calls[0].method,"GET");
 assert.match(calls[0].url,/pages\/projects\/yorphives-admin-staging$/);
 await assert.rejects(()=>readHeadquartersCanonical({accountId:account,apiToken:"read-only",
  fetcher:async()=>Response.json({success:true,result:{...project,canonical_deployment:{...canonical,id:null}}})}),
  /cannot be independently verified/);
});
