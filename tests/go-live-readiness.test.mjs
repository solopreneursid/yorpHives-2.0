import test from "node:test";
import assert from "node:assert/strict";
import {REPO,RELEASE_BASE_BRANCH,PUBLISH_DESTINATION,requiresIndependentPromotion,verifyHeadquartersCanonicalBranch,REQUIRED_RELEASE_CHECKS,HEADQUARTERS_REQUIRED_RELEASE_CHECKS,
 requiredChecksForTarget,chooseReleaseCandidate,verifyRequiredChecks,exactPreview,evaluateReleaseReadiness}
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
 assert.equal(yes.ready_for_preview,false);
 assert.equal(yes.preview,null);
 assert.ok(yes.blockers.some(x=>x.includes("separate GitHub repository")));
 assert.equal(yes.production_approved,false);
 assert.equal(yes.production_deployment_enabled,false);
 const no=evaluateReleaseReadiness({pulls:[pr],checkRuns:checks.slice(1),deployments:[deployment],target:"website"});
 assert.equal(no.ready_for_preview,false);
 assert.equal(no.preview,null);
});

test("Headquarters requires its real browser/visual check names, never website-only checks",()=>{
 const hqChecks=HEADQUARTERS_REQUIRED_RELEASE_CHECKS.map((name,i)=>({
  name,id:i+30,head_sha:sha,app:{slug:"github-actions"},status:"completed",
  conclusion:"success",started_at:"2026-11-13T10:00:00Z",completed_at:"2026-11-13T10:01:00Z"
 }));
 assert.ok(requiredChecksForTarget("headquarters").includes("Authenticated Admin browser smoke tests"));
 assert.ok(!requiredChecksForTarget("headquarters").includes("Lighthouse performance audit"));
 assert.equal(verifyRequiredChecks(hqChecks,sha,"headquarters").verified,true);
 assert.equal(verifyRequiredChecks(checks,sha,"headquarters").verified,false);
 assert.equal(verifyRequiredChecks(hqChecks,sha,"website").verified,false);
 assert.equal(verifyRequiredChecks(hqChecks,sha,"unknown").verified,false);
});
test("the latest failed rerun blocks an older passing check for the same revision",()=>{
 const first=checks[0];
 const recent={...first,id:999,started_at:"2026-11-13T11:00:00Z",
  completed_at:"2026-11-13T11:03:00Z",conclusion:"failure"};
 assert.equal(verifyRequiredChecks([...checks,recent],sha).verified,false);
});

test("public website main and private HQ staging canonical are distinct release targets",()=>{
 assert.equal(RELEASE_BASE_BRANCH.website,"main");
 assert.equal(RELEASE_BASE_BRANCH.headquarters,"build/yorphives-admin-reliability");
 const hq={...pr,number:90,
  labels:[{name:"release-candidate"},{name:"scope:headquarters"}],
  base:{ref:RELEASE_BASE_BRANCH.headquarters,repo:{full_name:REPO}}};
 assert.equal(chooseReleaseCandidate([hq],"headquarters").candidate.sha,sha);
 assert.equal(chooseReleaseCandidate([hq],"website").candidate,null);
 assert.equal(chooseReleaseCandidate([{...hq,base:{ref:"main",repo:{full_name:REPO}}}],"headquarters").candidate,null);
 assert.equal(chooseReleaseCandidate([{...pr,base:{ref:RELEASE_BASE_BRANCH.headquarters,repo:{full_name:REPO}}}],"website").candidate,null);
});

test("a website preview in the development repository is never a deployable public site release",()=>{
 assert.equal(requiresIndependentPromotion("website"),true);
 assert.equal(requiresIndependentPromotion("headquarters"),false);
 assert.equal(PUBLISH_DESTINATION.website.project,"yorphives");
 assert.equal(PUBLISH_DESTINATION.website.repository,"solopreneursid/YorpHives");
 assert.equal(PUBLISH_DESTINATION.website.branch,"main");
 assert.equal(PUBLISH_DESTINATION.headquarters.repository,REPO);
 assert.equal(PUBLISH_DESTINATION.headquarters.branch,RELEASE_BASE_BRANCH.headquarters);
});
test("headquarters can verify a candidate in the same repository without cross-repo promotion",()=>{
 const hq={...pr,number:101,
  labels:[{name:"release-candidate"},{name:"scope:headquarters"}],
  base:{ref:RELEASE_BASE_BRANCH.headquarters,repo:{full_name:REPO}}};
 const values=HEADQUARTERS_REQUIRED_RELEASE_CHECKS.map((name,i)=>({
  name,id:100+i,head_sha:sha,app:{slug:"github-actions"},status:"completed",conclusion:"success",
  started_at:"2026-11-13T11:00:00Z",completed_at:"2026-11-13T11:01:00Z"
 }));
 const exact={...deployment,url:"https://8c21d1ed.yorphives-admin-staging.pages.dev/",
  deployment_trigger:{metadata:{branch:hq.head.ref,commit_hash:sha}}};
 const ready=evaluateReleaseReadiness({pulls:[hq],checkRuns:values,deployments:[exact],target:"headquarters"});
 assert.equal(ready.status,"verified_preview");
 assert.equal(ready.ready_for_preview,true);
 assert.equal(ready.preview.url,"https://8c21d1ed.yorphives-admin-staging.pages.dev");
 assert.equal(ready.production_deployment_enabled,false);
});

test("a Git branch two commits ahead of the deployed canonical HEAD is a release blocker",()=>{
 const base=RELEASE_BASE_BRANCH.headquarters,source="d".repeat(40),canonical="e".repeat(40);
 const project={
  name:"yorphives-admin-staging",production_branch:base,
  source:{type:"github",config:{owner:"solopreneursid",repo_name:"yorpHives-2.0",production_branch:base}},
  canonical_deployment:{id:"77ffbf58-5ff8-4f01-90ba-6e657d9acfc0",
   environment:"production",latest_stage:{name:"deploy",status:"success"},
   deployment_trigger:{metadata:{branch:base,commit_hash:canonical}}}
 };
 const branch={name:base,commit:{sha:source}};
 const drift=verifyHeadquartersCanonicalBranch(branch,project);
 assert.equal(drift.verified,false);
 assert.match(drift.reason,/drifted/);
 assert.equal(verifyHeadquartersCanonicalBranch({name:base,commit:{sha:canonical}},project).verified,true);
 assert.equal(verifyHeadquartersCanonicalBranch(branch,{...project,production_branch:"main"}).verified,false);
 assert.equal(verifyHeadquartersCanonicalBranch(branch,{...project,source:{type:"github",config:{owner:"attacker",repo_name:"yorpHives-2.0",production_branch:base}}}).verified,false);
});
