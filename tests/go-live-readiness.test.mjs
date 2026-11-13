import test from "node:test";
import assert from "node:assert/strict";
import {REPO,REQUIRED_RELEASE_CHECKS,chooseReleaseCandidate,verifyRequiredChecks,exactPreview,evaluateReleaseReadiness}
 from "../functions/_lib/go-live-readiness.js";
const sha="a".repeat(40);
const pr={number:48,title:"Website release",state:"open",draft:false,
 labels:[{name:"release-candidate"},{name:"scope:website"}],
 base:{ref:"main",repo:{full_name:REPO}},
 head:{sha,ref:"fix/production-ready-update",repo:{full_name:REPO}}};
const checks=REQUIRED_RELEASE_CHECKS.map((name,i)=>({
 name,id:i+1,head_sha:sha,app:{slug:"github-actions"},status:"completed",conclusion:"success",
 started_at:"2026-11-13T10:00:00Z",completed_at:"2026-11-13T10:01:00Z"
}));
const deployment={id:"123e4567-e89b-42d3-a456-000000000001",environment:"preview",
 latest_stage:{name:"deploy",status:"success"},
 deployment_trigger:{metadata:{branch:pr.head.ref,commit_hash:sha}},
 url:"https://8c21d1ed.yorphives-2-preview.pages.dev/"};
test("only a unique, labeled, non-draft, exact-repo candidate is eligible",()=>{
 assert.equal(chooseReleaseCandidate([pr],"website").candidate.sha,sha);
 assert.equal(chooseReleaseCandidate([{...pr,draft:true}],"website").candidate,null);
 assert.equal(chooseReleaseCandidate([{...pr,base:{ref:"develop",repo:{full_name:REPO}}}],"website").candidate,null);
 assert.equal(chooseReleaseCandidate([pr,{...pr,number:49}],"website").candidate,null);
 assert.equal(chooseReleaseCandidate([pr],"headquarters").candidate,null);
});
test("exact SHA and all independent GitHub Actions checks are required",()=>{
 assert.equal(verifyRequiredChecks(checks,sha).verified,true);
 assert.equal(verifyRequiredChecks(checks.slice(1),sha).verified,false);
 assert.equal(verifyRequiredChecks(checks.map(x=>({...x,app:{slug:"other"}})),sha).verified,false);
 assert.equal(verifyRequiredChecks(checks.map(x=>({...x,head_sha:"b".repeat(40)})),sha).verified,false);
 assert.equal(verifyRequiredChecks(checks.map((x,i)=>i?x:{...x,conclusion:"skipped"}),sha).verified,false);
});
test("preview rejects production, mismatched branch, failed deployments, and hostile URLs",()=>{
 const c=chooseReleaseCandidate([pr],"website").candidate;
 assert.equal(exactPreview([deployment],c).deploymentId,deployment.id);
 assert.equal(exactPreview([{...deployment,environment:"production"}],c),null);
 assert.equal(exactPreview([{...deployment,latest_stage:{name:"deploy",status:"failure"}}],c),null);
 assert.equal(exactPreview([{...deployment,url:"https://attacker.example/"}],c),null);
 assert.equal(exactPreview([{...deployment,url:"https://user:pass@8c21d1ed.yorphives-2-preview.pages.dev/"}],c),null);
 assert.equal(exactPreview([{...deployment,deployment_trigger:{metadata:{branch:"main",commit_hash:sha}}}],c),null);
});
test("verified preview never constitutes founder approval or release execution",()=>{
 const yes=evaluateReleaseReadiness({pulls:[pr],checkRuns:checks,deployments:[deployment],target:"website"});
 assert.equal(yes.ready_for_preview,true);
 assert.equal(yes.preview.url,"https://8c21d1ed.yorphives-2-preview.pages.dev");
 assert.equal(yes.production_approved,false);
 assert.equal(yes.production_deployment_enabled,false);
 const no=evaluateReleaseReadiness({pulls:[pr],checkRuns:checks.slice(1),deployments:[deployment],target:"website"});
 assert.equal(no.ready_for_preview,false);
 assert.equal(no.preview,null);
});
