import test from "node:test";
import assert from "node:assert/strict";
import { readLiveGoLiveReadiness } from "../functions/_lib/go-live-live.js";
import { REPO,requiredChecksForTarget } from "../functions/_lib/go-live-readiness.js";

const sha="3".repeat(40),target="website";
const env={
 HQ_RELEASE_GITHUB_READ_TOKEN:"g".repeat(30),
 HQ_RELEASE_CLOUDFLARE_READ_TOKEN:"c".repeat(30),
 HQ_RELEASE_CLOUDFLARE_ACCOUNT_ID:"a".repeat(32)
};
const candidate={number:77, title:"Website release",
 state:"open",draft:false,
 labels:[{name:"release-candidate"},{name:"scope:website"}],
 base:{ref:"main",repo:{full_name:REPO}},
 head:{sha,ref:"build/verified-release",repo:{full_name:REPO}}
};
const runs=requiredChecksForTarget("website").map((name,i)=>({
 id:i+1,name,head_sha:sha,app:{slug:"github-actions"},
 status:"completed",conclusion:"success",
 started_at:"2026-11-13T00:00:00Z",completed_at:"2026-11-13T00:01:00Z"
}));
const deployment={id:"000982b1-e50e-49e9-93da-3495a2a6e208",
 environment:"preview",url:"https://000982b1.yorphives-2-preview.pages.dev",
 latest_stage:{name:"deploy",status:"success"},
 deployment_trigger:{metadata:{branch:candidate.head.ref,commit_hash:sha}}
};
const stub=(options={})=>{
 const calls=[];
 const fetchImpl=async(url,opts)=>{
  calls.push({url,method:opts?.method});
  if(url.includes("/pulls?"))return Response.json(options.pulls||[candidate]);
  if(url.includes("/check-runs?"))return Response.json({
   total_count:options.count??(options.runs||runs).length,check_runs:options.runs||runs
  });
  if(url.includes("/deployments?"))return Response.json({
   success:true,result:options.deployments||[deployment]
  });
  return new Response("not found",{status:404});
 };
 return {calls,fetchImpl};
};
test("readiness fetches only provider GET data and never enables production",async()=>{
 const s=stub();
 const response=await readLiveGoLiveReadiness(env,target,s.fetchImpl);
 assert.equal(response.status,"verified_preview");
 assert.equal(response.ready_for_preview,true);
 assert.equal(response.preview.deploymentId,deployment.id);
 assert.equal(response.production_deployment_enabled,false);
 assert.equal(response.production_approved,false);
 assert.equal(s.calls.length,3);
 assert.ok(s.calls.every(call=>call.method==="GET"));
});
test("missing credentials, pending QA, incomplete checks or absent previews fail closed",async()=>{
 assert.equal((await readLiveGoLiveReadiness({},target,stub().fetchImpl)).ready_for_preview,false);
 assert.equal((await readLiveGoLiveReadiness(env,target,stub({runs:runs.slice(1)}).fetchImpl)).ready_for_preview,false);
 assert.equal((await readLiveGoLiveReadiness(env,target,stub({count:101}).fetchImpl)).ready_for_preview,false);
 assert.equal((await readLiveGoLiveReadiness(env,target,stub({deployments:[{...deployment,environment:"production"}]}).fetchImpl)).ready_for_preview,false);
});
test("a draft or conflicting release candidate never progresses to checkout",async()=>{
 const a=stub({pulls:[{...candidate,draft:true}]});
 const result=await readLiveGoLiveReadiness(env,target,a.fetchImpl);
 assert.equal(result.ready_for_preview,false);
 assert.equal(a.calls.length,1);
 const b=stub({pulls:[candidate,{...candidate,number:78}]});
 assert.equal((await readLiveGoLiveReadiness(env,target,b.fetchImpl)).candidate,null);
});
