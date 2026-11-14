import test from "node:test";
import assert from "node:assert/strict";
import {
 WORKFORCE_POLICY, OWNED_BOT_REGISTRY, authorizeYorpMindOperation, registrySummary
} from "../hq-intelligence/workforce-policy.js";

test("YorpMind cannot authorize code, deployment or third-party agent interfaces",()=>{
 assert.equal(WORKFORCE_POLICY.mcp_enabled,false);
 assert.equal(WORKFORCE_POLICY.external_ai_apis_enabled,false);
 assert.equal(WORKFORCE_POLICY.repository_writes,false);
 assert.equal(WORKFORCE_POLICY.agent_deployments,false);
 for (const operation of [
  "modify_code","write_repository","create_pull_request","merge","deploy",
  "publish","change_infrastructure","change_secrets","grant_permissions",
  "execute_shell","dispatch_repair","install_package","approve_release",
  "request_otp","invoke_external_ai","connect_mcp","arbitrary_new_action"
 ]) assert.equal(authorizeYorpMindOperation(operation).allowed,false,operation);
});
test("Only observational and evidence-recording operations are permitted",()=>{
 for(const operation of ["monitor","research","analyze","recommend","record_evidence",
  "read_evidence","track_versions","review_findings","record_founder_feedback"])
  assert.equal(authorizeYorpMindOperation(operation).allowed,true,operation);
 assert.equal(authorizeYorpMindOperation(null).allowed,false);
 assert.equal(authorizeYorpMindOperation("Monitor").allowed,false);
});
test("Registered first-party bots are proposals, not falsely asserted installations",()=>{
 const entries=registrySummary();
 assert.equal(entries.length,OWNED_BOT_REGISTRY.length);
 assert.ok(entries.every(e=>e.state==="planned" && e.version==="0.0.0"));
 assert.ok(entries.every(e=>e.source_audit==="required_before_adaptation"));
 assert.equal(new Set(entries.map(x=>x.id)).size,entries.length);
});
test("Registry rejects privileged or duplicate entries",()=>{
 const base=OWNED_BOT_REGISTRY[0];
 assert.throws(()=>registrySummary([base,{...base,id:"other",privileges:["deploy"]}]));
 assert.throws(()=>registrySummary([base,base]));
 assert.throws(()=>registrySummary([{...base,version:"latest"}]));
});
