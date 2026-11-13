import test from "node:test";
import assert from "node:assert/strict";
import {diagnoseHeadquartersDrift} from "../functions/_lib/hq-release-drift.js";

const served="a".repeat(40),source="b".repeat(40);
const name="build/yorphives-admin-reliability";
const branch={name,commit:{sha:source}};
const deploy={id:"77ffbf58-5ff8-4f01-90ba-6e657d9acfc0",environment:"production",
 latest_stage:{name:"deploy",status:"success"},
 deployment_trigger:{metadata:{branch:name,commit_hash:served}}};
const project={name:"yorphives-admin-staging",production_branch:name,
 source:{type:"github",config:{owner:"solopreneursid",repo_name:"yorpHives-2.0",production_branch:name}},
 canonical_deployment:deploy};
const comparison={status:"ahead",ahead_by:2,behind_by:0,
 base_commit:{sha:served},merge_base_commit:{sha:served}};
const args={branch,project,comparison,compareBase:served,compareHead:source};

test("detects source ahead of served Cloudflare without enabling a release",()=>{
 const result=diagnoseHeadquartersDrift(args);
 assert.equal(result.status,"source_ahead_of_served");
 assert.equal(result.ahead_by,2);
 assert.equal(result.served_sha,served);
 assert.equal(result.source_sha,source);
 assert.equal(result.previous_deployment_id,deploy.id);
 assert.equal(result.release_safe,false);
 assert.equal(result.reconciled,false);
 assert.equal(result.production_deployment_enabled,false);
});
test("aligned deployment is not by itself Go Live approval",()=>{
 const aligned={...args,branch:{...branch,commit:{sha:served}}};
 const result=diagnoseHeadquartersDrift(aligned);
 assert.equal(result.status,"aligned");
 assert.equal(result.reconciled,true);
 assert.equal(result.release_safe,false);
 assert.equal(result.production_deployment_enabled,false);
});
test("rejects divergent or substituted source and canonical evidence",()=>{
 const bad=[
  {comparison:{...comparison,status:"diverged"}},
  {comparison:{...comparison,behind_by:1}},
  {comparison:{...comparison,merge_base_commit:{sha:"c".repeat(40)}}},
  {compareBase:"c".repeat(40)},
  {compareHead:"c".repeat(40)},
  {project:{...project,canonical_deployment:{...deploy,latest_stage:{name:"deploy",status:"failure"}}}},
  {project:{...project,canonical_deployment:{...deploy,id:"invalid"}}},
  {project:{...project,source:{type:"github",config:{...project.source.config,repo_name:"YorpHives"}}}},
  {branch:{...branch,commit:{sha:"invalid"}}},
  {project:{...project,canonical_deployment:{...deploy,deployment_trigger:{metadata:{branch:name,commit_hash:"invalid"}}}}}
 ];
 for(const overrides of bad){
  const result=diagnoseHeadquartersDrift({...args,...overrides});
  assert.equal(result.release_safe,false);
  assert.equal(result.reconciled,false);
  assert.notEqual(result.status,"source_ahead_of_served");
 }
});
