import test from "node:test";
import assert from "node:assert/strict";
import { createOrReusePreview, validatePreviewDeployment } from "../scripts/pages-preview-client.mjs";

const base = {
  accountId: "a".repeat(32),
  apiToken: "test-token",
  project: "yorphives-2-preview",
  branch: "build/headquarters-preview-cost-guardrails",
  commitSha: "b".repeat(40),
  commitMessage: "Test preview"
};
const deployment = (changes = {}) => ({
  id: "successful-preview",
  environment: "preview",
  url: "https://abc12345.yorphives-2-preview.pages.dev",
  deployment_trigger: { metadata: { branch: base.branch, commit_hash: base.commitSha } },
  latest_stage: { name: "deploy", status: "success" },
  ...changes
});
const json = (value, status = 200) => Response.json(value, { status });
const notModified = () => new Response(null, { status: 304 });

test("successful preview creation rejects mismatched commit even on HTTP 200", async () => {
  const fetchImpl = async (url, init) => init.method === "POST"
    ? json({ success: true, result: deployment({
      deployment_trigger: { metadata: { branch: base.branch, commit_hash: "c".repeat(40) } }
    }) })
    : json({ success: true, result: [
      deployment({ deployment_trigger: { metadata: { branch: base.branch, commit_hash: "c".repeat(40) } } })
    ] });
  await assert.rejects(createOrReusePreview({ ...base, fetchImpl, delayImpl: async () => {} }),
    /No successful Cloudflare Pages preview matched/);
});

test("duplicate 304 reuses only an exact successful preview from Cloudflare", async () => {
  let calls = 0;
  const fetchImpl = async (url, init) => {
    calls++;
    if (init.method === "POST") return notModified();
    assert.match(url, /env=preview/);
    assert.equal(init.method, "GET");
    return json({ success: true, result: [
      deployment({ id: "unrelated", deployment_trigger: { metadata: { branch: base.branch, commit_hash: "c".repeat(40) } } }),
      deployment()
    ] });
  };
  const result = await createOrReusePreview({ ...base, fetchImpl });
  assert.equal(result.reused, true);
  assert.equal(result.id, "successful-preview");
  assert.equal(result.url, "https://abc12345.yorphives-2-preview.pages.dev");
  assert.equal(calls, 2);
});

test("304 fails closed when only another branch or an unfinished preview exists", async () => {
  const fetchImpl = async (url, init) => init.method === "POST" ? notModified() :
    json({ success: true, result: [
      deployment({ deployment_trigger: { metadata: { branch: "main", commit_hash: base.commitSha } } }),
      deployment({ latest_stage: { name: "deploy", status: "active" } })
    ] });
  await assert.rejects(createOrReusePreview({ ...base, fetchImpl, delayImpl: async () => {} }), /No successful Cloudflare Pages preview matched/);
});

test("rejects production branches, unknown projects, invalid URLs and nonpreview responses", async () => {
  const invalid = [deployment({ environment: "production" }),
    deployment({ url: "https://abc12345.yorphives-2-preview.pages.dev.attacker.example" }),
    deployment({ url: "http://abc12345.yorphives-2-preview.pages.dev" })];
  for (const candidate of invalid) {
    assert.equal(validatePreviewDeployment(candidate, base), null);
  }
  await assert.rejects(createOrReusePreview({ ...base, branch: "main", fetchImpl: async () => { throw Error("unexpected HTTP request"); } }), /feature branches/);
  await assert.rejects(createOrReusePreview({ ...base, project: "public-production", fetchImpl: async () => { throw Error("unexpected HTTP request"); } }), /Unapproved Pages project/);
});

test("valid fresh preview returns exact deployment and no reuse flag", async () => {
  const result = await createOrReusePreview({ ...base, fetchImpl: async (url, init) => {
    assert.equal(init.method, "POST");
    return json({ success: true, result: deployment() });
  } });
  assert.equal(result.reused, false);
  assert.equal(result.output, "SITE_BASE_URL");
});

test("HTTP 200 with temporarily incorrect metadata recovers only via verified GET result", async () => {
  let calls = 0;
  const fetchImpl = async (url, init) => {
    calls++;
    if (init.method === "POST") return json({ success: true, result: deployment({
      deployment_trigger: { metadata: { branch: "build/old-preview", commit_hash: "c".repeat(40) } }
    }) });
    assert.match(url, /per_page=10/);
    return json({ success: true, result: [deployment()] });
  };
  const result = await createOrReusePreview({ ...base, fetchImpl, delayImpl: async () => {} });
  assert.equal(result.reused, true);
  assert.equal(result.id, "successful-preview");
  assert.equal(calls, 2);
});

test("lookup waits for exact deployment success and never trusts an active preview", async () => {
  let lookupCalls = 0;
  const fetchImpl = async (url, init) => {
    if (init.method === "POST") return notModified();
    lookupCalls++;
    return json({ success: true, result: [
      lookupCalls === 1 ? deployment({ latest_stage: { name: "deploy", status: "active" } }) : deployment()
    ] });
  };
  const result = await createOrReusePreview({ ...base, fetchImpl, delayImpl: async () => {} });
  assert.equal(result.reused, true);
  assert.equal(lookupCalls, 2);
});

test("lookup scans a bounded additional page and still validates exact branch and SHA", async () => {
  const fetchImpl = async (url, init) => {
    if (init.method === "POST") return notModified();
    const page = Number(new URL(url).searchParams.get("page"));
    if (page === 1) return json({ success: true, result: Array.from({ length: 10 }, () => deployment({
      deployment_trigger: { metadata: { branch: "build/unrelated", commit_hash: base.commitSha } }
    })) });
    if (page === 2) return json({ success: true, result: [deployment()] });
    throw Error("Unbounded pagination");
  };
  const result = await createOrReusePreview({ ...base, fetchImpl, delayImpl: async () => {} });
  assert.equal(result.id, "successful-preview");
});

test("Cloudflare lookup errors fail closed rather than accepting stale POST metadata", async () => {
  const fetchImpl = async (url, init) => init.method === "POST"
    ? json({ success: true, result: deployment({ environment: "production" }) })
    : Response.json({ success: false, result: null }, { status: 500 });
  await assert.rejects(createOrReusePreview({ ...base, fetchImpl, delayImpl: async () => {} }),
    /preview lookup failed/);
});


const adminBase={...base,project:"yorphives-admin-staging",
 branch:"fix/founder-approval-at-production-only"};
const adminProject={
 name:"yorphives-admin-staging",
 source:{type:"github",config:{
  owner:"solopreneursid",repo_name:"yorpHives-2.0",
  production_branch:"build/yorphives-admin-reliability",deployments_enabled:true
 }},
 production_branch:"build/yorphives-admin-reliability",
 canonical_deployment:{
  id:"77ffbf58-5ff8-4f01-90ba-6e657d9acfc0",
  environment:"production",
  deployment_trigger:{metadata:{branch:"build/yorphives-admin-reliability"}}
 }
};
test("Headquarters preview uses explicit multipart fix branch and keeps canonical unchanged", async()=>{
 const seen=[];
 const fake=async(url,init)=>{
  seen.push({url,method:init.method,form:init.body});
  if(init.method==="GET")return json({success:true,result:adminProject});
  assert.equal(init.method,"POST");
  assert.ok(init.body instanceof FormData);
  assert.equal(init.body.get("branch"),adminBase.branch);
  assert.equal(init.body.get("commit_hash"),adminBase.commitSha);
  assert.equal(init.body.get("commit_dirty"),"false");
  return json({success:true,result:deployment({
   url:"https:/" + "/aaa7346f.yorphives-admin-staging.pages.dev",
   deployment_trigger:{metadata:{branch:adminBase.branch,commit_hash:adminBase.commitSha}}
  })});
 };
 const result=await createOrReusePreview({...adminBase,fetchImpl:fake});
 assert.equal(result.output,"ADMIN_BASE_URL");
 assert.equal(result.reused,false);
 assert.equal(seen.map(x=>x.method).join(","),"GET,POST,GET");
 assert.ok(seen.filter(x=>x.method==="POST").every(x=>x.url.endsWith("/yorphives-admin-staging/deployments")));
});
test("unsafe HQ project identity or changed canonical forbids or fails release",async()=>{
 const calls=[];
 const wrong=async(url,init)=>{
  calls.push(init.method);
  return json({success:true,result:{...adminProject,production_branch:"main"}});
 };
 await assert.rejects(createOrReusePreview({...adminBase,fetchImpl:wrong}),/safe allowlist/);
 assert.deepEqual(calls,["GET"]);
 let reads=0;
 const changed=async(url,init)=>{
  if(init.method==="GET"){
   reads++;
   return json({success:true,result:reads===1?adminProject:{
    ...adminProject,canonical_deployment:{...adminProject.canonical_deployment,
     id:"123e4567-e89b-42d3-a456-000000000002"}
   }});
  }
  return json({success:true,result:deployment({
   url:"https:/" + "/aaa7346f.yorphives-admin-staging.pages.dev",
   deployment_trigger:{metadata:{branch:adminBase.branch,commit_hash:adminBase.commitSha}}
  })});
 };
 await assert.rejects(createOrReusePreview({...adminBase,fetchImpl:changed}),/canonical deployment changed/);
});
test("HQ production default branch and malformed branch names cannot reach API",async()=>{
 for(const badBranch of ["build/yorphives-admin-reliability","main",
  "fix/../main","fix/Unsafe","feature/", "hotfix/patch"]){
  let called=false;
  await assert.rejects(createOrReusePreview({...adminBase,branch:badBranch,
   fetchImpl:async()=>{called=true;throw Error("unexpected HTTP");}
  }),/feature branches/);
  assert.equal(called,false);
 }
});
