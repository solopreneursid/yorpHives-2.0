import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import {
  validGrantInput, grantAllows, grantDisplayState, securityReady, permissionLabels
} from "../functions/_lib/founder-permissions.js";

const ID="123e4567-e89b-42d3-a456-000000000031";
const base=()=>({
  assistant:"yorpmind",scope:"both",permission:"prepare_fixes",
  duration_minutes:15,
  purpose:"Investigate reported issues in the test environment and prepare reviewable changes.",
  confirm:true
});
const now=new Date("2026-11-13T12:00:00.000Z");
const allowed=()=>({
  grant_id:ID,assistant:"yorpmind",scope:"both",permission:"prepare_fixes",
  owner_email:"owner@example.com",state:"active",max_actions:3,used_actions:0,
  active_expires_at:"2026-11-13T12:15:00.000Z"
});
test("the owner chooses a named assistant, target and short expiration",()=>{
  assert.deepEqual(validGrantInput(base()),{
    assistant:"yorpmind",scope:"both",permission:"prepare_fixes",
    duration_minutes:15,purpose:base().purpose
  });
  for(const patch of [
    {assistant:"worker-bot"},{permission:"owner_admin"},{scope:"all_accounts"},
    {duration_minutes:10080},{duration_minutes:0},{confirm:false},
    {purpose:"Please do it"},{purpose:"Bad\u0000input"}]) {
    assert.equal(validGrantInput({...base(),...patch}),null);
  }
  assert.equal(permissionLabels(allowed()).assistant,"YorpMind");
});
test("retired grants never authorize actions, even when old records appear active",()=>{
  const grant=allowed();
  assert.equal(grantAllows(grant,"yorpmind","create_issue","website",now),false);
  assert.equal(grantAllows(grant,"chatgpt","create_issue","website",now),false);
  assert.equal(grantAllows(grant,"yorpmind","deploy_production","website",now),false);
  assert.equal(grantAllows({...grant,permission:"review_findings"},
    "yorpmind","create_issue","website",now),false);
  assert.equal(grantAllows({...grant,scope:"headquarters"},
    "yorpmind","create_issue","website",now),false);
  assert.equal(grantAllows({...grant,used_actions:3},
    "yorpmind","create_issue","website",now),false);
  assert.equal(grantAllows({...grant,state:"revoked"},
    "yorpmind","create_issue","website",now),false);
  assert.equal(grantAllows(grant,"yorpmind","create_issue","website",
    new Date("2026-11-13T12:15:00.000Z")),false);
});
test("expired permissions are shown as ended even if no scheduled cleanup ran",()=>{
  assert.equal(grantDisplayState({...allowed(),state:"active"},now),"active");
  assert.equal(grantDisplayState({...allowed(),state:"active"},new Date("2026-11-13T13:00:00Z")),"expired");
  assert.equal(grantDisplayState({...allowed(),state:"revoked"},now),"revoked");
  assert.equal(grantDisplayState({...allowed(),state:"awaiting_mfa",
    request_expires_at:"2026-11-13T12:04:00Z"},now),"awaiting_security_check");
  assert.equal(grantDisplayState({...allowed(),state:"awaiting_mfa",
    request_expires_at:"2026-11-13T11:59:00Z"},now),"expired");
});
test("MFA readiness requires a separate owner security application",()=>{
  const config={CF_ACCESS_AUD:"owner-audience",CF_ACCESS_AGENT_AUD:"agents-audience",
    CF_ACCESS_STEP_UP_AUD:"mfa-audience",CF_ACCESS_STEP_UP_MFA_POLICY_CONFIRMED:"yes"};
  assert.equal(securityReady(config),true);
  assert.equal(securityReady({...config,CF_ACCESS_STEP_UP_AUD:"owner-audience"}),false);
  assert.equal(securityReady({...config,CF_ACCESS_STEP_UP_AUD:"agents-audience"}),false);
  assert.equal(securityReady({...config,CF_ACCESS_STEP_UP_MFA_POLICY_CONFIRMED:"no"}),false);
});
test("database prevents changing a grant target or simultaneous active grants",async()=>{
  const db=new DatabaseSync(":memory:");
  try {
    db.exec(await readFile(new URL("../migrations/0028_founder_temporary_grants.sql",import.meta.url),"utf8"));
    const insert=db.prepare(
      "INSERT INTO founder_temporary_grants "+
      "(grant_id,assistant,scope,permission,duration_minutes,purpose,owner_email,state,created_at,request_expires_at) "+
      "VALUES(?,?,?,?,?,?,?,'awaiting_mfa',?,?)"
    );
    insert.run(ID,"yorpmind","website","prepare_fixes",15,base().purpose,
      "owner@example.com",now.toISOString(),"2026-11-13T12:10:00Z");
    assert.throws(()=>db.prepare(
      "UPDATE founder_temporary_grants SET scope='both' WHERE grant_id=?"
    ).run(ID),/immutable/);
    db.prepare(
      "UPDATE founder_temporary_grants SET state='active',activated_by=?,activated_at=?,"+
      "active_expires_at=? WHERE grant_id=?"
    ).run("owner@example.com",now.toISOString(),"2026-11-13T12:15:00Z",ID);
    const newId="123e4567-e89b-42d3-a456-000000000032";
    insert.run(newId,"yorpmind","website","prepare_fixes",15,base().purpose,
      "owner@example.com",now.toISOString(),"2026-11-13T12:10:00Z");
    assert.throws(()=>db.prepare(
      "UPDATE founder_temporary_grants SET state='active',activated_by=?,activated_at=?,"+
      "active_expires_at=? WHERE grant_id=?"
    ).run("owner@example.com",now.toISOString(),"2026-11-13T12:15:00Z",newId),/UNIQUE/);
    db.prepare("UPDATE founder_temporary_grants SET state='revoked',revoked_by=?,revoked_at=? WHERE grant_id=?")
      .run("owner@example.com",now.toISOString(),ID);
    assert.equal(db.prepare("SELECT state FROM founder_temporary_grants WHERE grant_id=?").get(ID).state,"revoked");
  }finally{db.close();}
});
