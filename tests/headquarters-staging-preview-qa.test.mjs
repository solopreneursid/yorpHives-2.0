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

test("Actual signed-in workflow cannot deploy or run automatically, and tests real coaching",async()=>{
  const workflow=await readFile(new URL("../.github/workflows/admin-staging-quality.yml",import.meta.url),"utf8");
  const smoke=await readFile(new URL("../scripts/admin-smoke.mjs",import.meta.url),"utf8");
  const verifier=await readFile(new URL("../scripts/verify-existing-admin-preview.mjs",import.meta.url),"utf8");
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/reviewed_commit_sha:/);
  assert.match(workflow,/reviewed_deployment_id:/);
  assert.match(workflow,/PAGES_DEPLOYMENT_ID: \$\{\{ inputs\.reviewed_deployment_id \}\}/);
  assert.match(workflow,/staging-deployments/);
  assert.match(workflow,/verify-existing-admin-preview\.mjs/);
  assert.match(workflow,/CF_ACCESS_CLIENT_ID/);
  assert.match(workflow,/CF_ACCESS_CLIENT_SECRET/);
  assert.doesNotMatch(workflow,/^\s+push:/m);
  assert.doesNotMatch(workflow,/npm run deploy:pages-preview/);
  assert.doesNotMatch(workflow,/wrangler\s+deploy/);
  assert.match(verifier,/await verifyAnonymousBoundary\(preview\.url\)/);
  assert.match(verifier,/GITHUB_ENV/);
  assert.match(verifier,/checkedOut/);
  assert.match(smoke,/website_proof_real_staging_api/);
  assert.match(smoke,/website_proof_real_browser_seven_rows/);
  assert.match(smoke,/website_proof_real_chatgpt_handoff/);
  assert.match(smoke,/website_proof_real_yorpmind_handoff/);
  assert.match(smoke,/website_proof_anonymous_access_denied/);
  assert.match(smoke,/yorpmind_real_coaching_unapproved/);
});
