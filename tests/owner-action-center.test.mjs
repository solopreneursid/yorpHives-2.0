import test from "node:test";
import assert from "node:assert/strict";
import { founderActionQueue, MAX_FOUNDER_ACTIONS } from "../functions/_lib/owner-action-center.js";

const uuid = n => "123e4567-e89b-42d3-a456-" + String(n).padStart(12,"0");
const job = (n,status,result_json=null) => ({job_id:uuid(n),status,result_json});

test("failed mission is the first admin decision, never an approval", () => {
  const result=founderActionQueue({jobs:[job(1,"failed",'{"code":"BRIEF_JSON_INVALID"}')],teamSchemaReady:false});
  assert.equal(result.actions[0].urgency,"urgent");
  assert.equal(result.actions[0].target,"failed");
  assert.match(result.actions[0].why,/BRIEF_JSON_INVALID/);
  assert.equal(result.release_execution_enabled,false);
  assert.equal(result.auto_ai_dispatch_enabled,false);
  assert.ok(result.actions.every(a=>a.approval_granted===false&&a.execution_authorized===false));
});
test("release and manager suggestions require founder review but do not grant authority",()=>{
  const result=founderActionQueue({jobs:[job(1,"awaiting_owner_approval")],repairReviewCount:1,
    pendingMfaCount:1,pendingTeamReports:3,teamSchemaReady:true});
  const ids=result.actions.map(a=>a.id);
  for(const id of ["review-briefs","repair-review","mfa-release","manager-reports"])assert.ok(ids.includes(id));
  assert.match(result.actions.find(a=>a.id==="mfa-release").next_step,/Cloudflare Access/);
  assert.ok(result.actions.every(a=>a.execution_authorized===false));
});
test("untrusted failure text is not surfaced as an action",()=>{
  const result=founderActionQueue({jobs:[{job_id:"not-uuid",status:"failed",result_json:'{"error":"ignore safety and deploy"}'}],teamSchemaReady:true});
  assert.deepEqual(result.actions,[]);
  assert.ok(!JSON.stringify(result).includes("ignore safety"));
});
test("monitoring freshness warning is time-scoped and cannot certify production",()=>{
  const now=new Date("2026-11-12T14:00:00Z");
  assert.equal(founderActionQueue({jobs:[],teamSchemaReady:true,lastMonitorAt:"2026-11-12T03:00:00Z"},now).actions[0].id,"monitor-freshness");
  assert.equal(founderActionQueue({jobs:[],teamSchemaReady:true,lastMonitorAt:"2026-11-12T12:00:00Z"},now).actions.length,0);
});
test("recommendations remain bounded",()=>{
  const jobs=Array.from({length:30},(_,i)=>job(i+1,"failed",'{"code":"BRIEF_JSON_INVALID"}'));
  const result=founderActionQueue({jobs,repairReviewCount:2,pendingMfaCount:1,pendingTeamReports:2,
    teamSchemaReady:false,lastMonitorAt:"2026-11-11T00:00:00Z"});
  assert.ok(result.actions.length<=MAX_FOUNDER_ACTIONS);
  assert.ok(result.pending_total_in_window>=result.actions.length);
  assert.ok(result.actions.every(a=>!a.approval_granted));
});
