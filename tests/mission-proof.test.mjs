import test from "node:test";
import assert from "node:assert/strict";
import { inspectMissionReceipt, MAX_PROOF_EVENTS } from "../functions/_lib/mission-proof.js";

const jobId="123e4567-e89b-42d3-a456-000000000001";
const report={
  kind:"recommendation_brief",model:"@cf/qwen/qwen3.8-27b",verified:false,
  generated_at:"2026-11-13T00:20:00.000Z",
  summary:"Investigate a QR code preview bug",
  recommended_approach:"Run browser tests before proposing a fix.",
  actions:["Review the UI"],
  risks:["Mobile browser variance"],
  assumptions:["The issue still exists"],
  verification_needed:["Reproduce the bug","Compare production separately"]
};
const job=(status="awaiting_owner_approval",input_json=JSON.stringify({model_attempt_started_at:"2026-11-13T00:15:00.000Z"}),
 result_json=JSON.stringify(report))=>({
  job_id:jobId,job_type:"owner_mission",status,agent_id:"product-strategist",
  title:"Review QR preview",updated_at:"2026-11-13T00:25:00.000Z",input_json,result_json
});
const events=[
  "mission_queued","mission_running","mission_awaiting_owner_approval"
].map(event_type=>({job_id:jobId,event_type}));

test("complete persisted event chain permits only founder planning-brief review",()=>{
  const receipt=inspectMissionReceipt(job(),events);
  assert.equal(receipt.evidence_status,"recorded_review_ready");
  assert.equal(receipt.records_sufficient_for_owner_review,true);
  assert.equal(receipt.checks.length,5);
  assert.ok(receipt.checks.every(c=>c.result==="recorded"));
  assert.deepEqual(receipt.verification_checklist,report.verification_needed);
  assert.equal(receipt.provider_execution_attested,false);
  assert.equal(receipt.provider_billing_verified,false);
  assert.equal(receipt.claims_independently_verified,false);
  assert.equal(receipt.release_authorized,false);
  assert.equal(receipt.production_deployed,false);
});
test("missing attempt, duplicate queue and fabricated model claims block readiness",()=>{
  const first=inspectMissionReceipt(job("awaiting_owner_approval","{}"),events);
  assert.equal(first.records_sufficient_for_owner_review,false);
  assert.equal(first.checks.find(c=>c.id==="inference_claim").result,"needs_review");
  const double=inspectMissionReceipt(job(),[...events,events[0]]);
  assert.equal(double.records_sufficient_for_owner_review,false);
  assert.equal(double.checks.find(c=>c.id==="dispatch").result,"needs_review");
  const claim=JSON.stringify({...report,verified:true});
  const bad=inspectMissionReceipt(job("awaiting_owner_approval",job().input_json,claim),events);
  assert.equal(bad.records_sufficient_for_owner_review,false);
});
test("failed records are visible but do not count as a successful AI brief",()=>{
  const failed=inspectMissionReceipt(job("failed","{}",JSON.stringify({
    code:"BRIEF_JSON_INVALID",error:"Model returned malformed JSON",verified:false
  })),events.slice(0,2));
  assert.equal(failed.evidence_status,"recorded_failure");
  assert.equal(failed.failure.code,"BRIEF_JSON_INVALID");
  assert.equal(failed.records_sufficient_for_owner_review,false);
  assert.match(failed.suggested_admin_action,/separate founder dispatch/);
});
test("read-only proof is bounded and ignores foreign events",()=>{
  const overflow=Array.from({length:MAX_PROOF_EVENTS+10},()=>({
    job_id:"123e4567-e89b-42d3-a456-000000000002",event_type:"mission_running"
  }));
  const q=inspectMissionReceipt(job(),overflow);
  assert.equal(q.event_window.inspected,MAX_PROOF_EVENTS);
  assert.equal(q.event_window.truncated,true);
  assert.equal(q.checks.find(c=>c.id==="running").result,"needs_review");
});
test("malformed records fail closed and do not leak their contents",()=>{
  const invalid=inspectMissionReceipt({...job(),job_id:"unsafe"});
  assert.equal(invalid.evidence_status,"unavailable");
  assert.equal(invalid.release_authorized,false);
  assert.ok(!JSON.stringify(invalid).includes("Reproduce the bug"));
  const arbitrary=inspectMissionReceipt({...job(),job_type:"repair"});
  assert.equal(arbitrary.evidence_status,"unavailable");
});
