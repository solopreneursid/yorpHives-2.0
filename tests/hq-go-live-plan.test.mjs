import test from "node:test";
import assert from "node:assert/strict";
import {planHeadquartersFastForward} from "../functions/_lib/hq-go-live-plan.js";
const sha="a".repeat(40),base="b".repeat(40),pr=94;
const branch={name:"build/yorphives-admin-reliability",commit:{sha:base}};
const project={name:"yorphives-admin-staging",production_branch:branch.name,
 source:{type:"github",config:{owner:"solopreneursid",repo_name:"yorpHives-2.0",production_branch:branch.name}},
 canonical_deployment:{id:"77ffbf58-5ff8-4f01-90ba-6e657d9acfc0",
  environment:"production",latest_stage:{name:"deploy",status:"success"},
  deployment_trigger:{metadata:{branch:branch.name,commit_hash:base}}}};
const ready={target:"headquarters",status:"verified_preview",ready_for_preview:true,
 production_approved:false,production_deployment_enabled:false,blockers:[],
 candidate:{target:"headquarters",number:pr,sha,branch:"fix/proposed-release",title:"Release"},
 preview:{url:"https://3c1e6315.yorphives-admin-staging.pages.dev",
  deploymentId:"3c1e6315-40b6-419d-83ef-81d77559df80"}};
const compare={status:"ahead",ahead_by:3,behind_by:0,base_commit:{sha:base},merge_base_commit:{sha:base}};
const args={readiness:ready,branch,project,comparison:compare,compareBase:base,compareHead:sha};
test("HQ can plan an exact fast-forward with an immutable rollback identity, never publish",()=>{
 const result=planHeadquartersFastForward(args);
 assert.equal(result.eligible,true);
 assert.equal(result.production_deployment_enabled,false);
 assert.equal(result.plan.approved,false);
 assert.equal(result.plan.target_sha,sha);
 assert.equal(result.plan.expected_previous_branch_sha,base);
 assert.equal(result.plan.previous_canonical_deployment_id,"77ffbf58-5ff8-4f01-90ba-6e657d9acfc0");
 assert.equal(result.plan.pages_project,"yorphives-admin-staging");
 assert.equal(result.plan.source_repository,"solopreneursid/yorpHives-2.0");
});
test("never prepare a public website plan from the HQ repository",()=>{
 const result=planHeadquartersFastForward({...args,readiness:{...ready,target:"website"}});
 assert.equal(result.eligible,false);
 assert.match(result.reason,/separate/);
});
test("rollback and base revision must match the actually served canonical deployment",()=>{
 for(const change of [
  {project:{...project,canonical_deployment:{...project.canonical_deployment,
   deployment_trigger:{metadata:{branch:branch.name,commit_hash:"c".repeat(40)}}}}},
  {project:{...project,canonical_deployment:{...project.canonical_deployment,
   latest_stage:{name:"deploy",status:"failure"}}}},
  {branch:{...branch,commit:{sha:"c".repeat(40)}}},
  {comparison:{...compare,behind_by:1}},
  {comparison:{...compare,merge_base_commit:{sha:"c".repeat(40)}}},
  {comparison:{...compare,status:"diverged"}},
  {compareHead:"c".repeat(40)},
  {compareBase:"c".repeat(40)},
  {readiness:{...ready,ready_for_preview:false}},
  {readiness:{...ready,preview:{...ready.preview,deploymentId:"wrong"}}}
 ])assert.equal(planHeadquartersFastForward({...args,...change}).eligible,false);
});
