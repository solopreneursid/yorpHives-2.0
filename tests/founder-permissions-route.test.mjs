import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { DatabaseSync } from "node:sqlite";

const source=path=>readFile(new URL(path,import.meta.url),"utf8");
const toModule=code=>"data:text/javascript;base64,"+Buffer.from(stripTypeScriptTypes(code)).toString("base64");
const coreURL=toModule(await source("../functions/_lib/founder-permissions.js"));
const authURL=toModule(
  "export const adminJson = (body,status=200)=>Response.json(body,{status});"+
  "export const isAdminResponse = x => x instanceof Response;"+
  "export const requireAdmin = async c => c.request.headers.get('x-test-owner')==='yes'"+
  "? {email:'owner@example.com',serviceToken:false}:Response.json({error:'Access required'},{status:401});"+
  "export const requireOwnerStepUp = async c => c.request.headers.get('x-test-stepup')==='yes'"+
  "? {email:'owner@example.com'}:Response.json({error:'Fresh independent MFA required'},{status:403});"
);
const main=await import(toModule((await source("../functions/api/admin/assistant-permissions.ts"))
  .replace('"../../_lib/admin-auth"',JSON.stringify(authURL))
  .replace('"../../_lib/founder-permissions.js"',JSON.stringify(coreURL))));
const secure=await import(toModule((await source("../functions/api/admin/step-up/assistant-permissions.ts"))
  .replace('"../../../_lib/admin-auth"',JSON.stringify(authURL))
  .replace('"../../../_lib/founder-permissions.js"',JSON.stringify(coreURL))));
function adapter(sqlite) {
  const prepare=sql=>{
    let values=[];
    const stmt={
      bind(...v){values=v;return stmt;},
      async first(){return sqlite.prepare(sql).get(...values)||null;},
      async all(){return{results:sqlite.prepare(sql).all(...values),success:true};},
      async run(){const value=sqlite.prepare(sql).run(...values);
        return {success:true,meta:{changes:Number(value.changes)}};}
    };
    return stmt;
  };
  return {prepare,async batch(statements){
    sqlite.exec("BEGIN");
    try{
      const out=[];
      for(const statement of statements)out.push(await statement.run());
      sqlite.exec("COMMIT");
      return out;
    }catch(e){sqlite.exec("ROLLBACK");throw e;}
  }};
}
async function fixture(){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec(await source("../migrations/0028_founder_temporary_grants.sql"));
  sqlite.exec(await source("../migrations/0029_founder_email_otp.sql"));
  sqlite.exec("CREATE TABLE admin_audit_events(id TEXT PRIMARY KEY,actor TEXT,action TEXT,resource_type TEXT,resource_id TEXT,details_json TEXT,created_at TEXT)");
  return {sqlite,DB:adapter(sqlite)};
}
const envConfig={
  CF_ACCESS_AUD:"owner-aud",CF_ACCESS_AGENT_AUD:"agents-aud",
  CF_ACCESS_STEP_UP_AUD:"mfa-aud",CF_ACCESS_STEP_UP_MFA_POLICY_CONFIRMED:"yes",
  CF_ACCESS_YORPMIND_SERVICE_TOKEN_ID:"yorpmind-access-123",
  CF_ACCESS_CHATGPT_SERVICE_TOKEN_ID:"chatgpt-access-456"
};
const request=(DB,method="GET",body=null,extra={})=>{
  const url="https://headquarters.example/api/admin/assistant-permissions";
  return {env:{DB,...envConfig,...extra.env},request:new Request(url,{
    method,headers:{
      "x-test-owner":extra.owner===false?"no":"yes",
      "origin":extra.origin||"https://headquarters.example",
      "content-type":"application/json",
      "accept":extra.accept||"application/json"
    },...(method!=="GET"?{body:JSON.stringify(body)}:{})
  })};
};
const input={
  assistant:"chatgpt",scope:"website",permission:"prepare_fixes",duration_minutes:15,
  purpose:"Please investigate my mobile layout problems and prepare a fix for me to review later.",
  confirm:true
};
test("the owner must request, separately verify, then may cancel temporary help",async()=>{
  const {sqlite,DB}=await fixture();
  try{
    const initial=await main.onRequestGet(request(DB));
    assert.equal(initial.status,200);
    const initialData=await initial.json();
    assert.equal(initialData.owner_is_in_charge,true);
    assert.equal(initialData.production_execution_enabled,false);
    assert.equal(initialData.mfa_configured,true);
    const created=await main.onRequestPost(request(DB,"POST",input));
    assert.equal(created.status,201);
    const pending=await created.json();
    assert.equal(pending.permission_active,false);
    const id=pending.grant_id;
    assert.equal(sqlite.prepare("SELECT state FROM founder_temporary_grants WHERE grant_id=?").get(id).state,"awaiting_mfa");
    const form=new URLSearchParams({grant_id:id,agree:"yes"}).toString();
    const stepReq=confirmed=>({
      env:{DB,...envConfig},request:new Request(
        "https://headquarters.example/api/admin/step-up/assistant-permissions?id="+id,{
          method:"POST",headers:{
            "x-test-stepup":confirmed?"yes":"no",
            "origin":"https://headquarters.example",
            "content-type":"application/x-www-form-urlencoded",
            "accept":"application/json"
          },body:form
        })
    });
    assert.equal((await secure.onRequestPost(stepReq(false))).status,403);
    assert.equal((await secure.onRequestPost(stepReq(true))).status,200);
    const active=sqlite.prepare("SELECT state,assistant FROM founder_temporary_grants WHERE grant_id=?").get(id);
    assert.equal(active.state,"active");
    assert.equal(active.assistant,"chatgpt");
    assert.equal((await secure.onRequestPost(stepReq(true))).status,409);
    const ended=await main.onRequestPatch(request(DB,"PATCH",{
      action:"revoke",grant_id:id
    }));
    assert.equal(ended.status,200);
    assert.equal((await ended.json()).assistant_access_ended,true);
    assert.equal(sqlite.prepare("SELECT state FROM founder_temporary_grants WHERE grant_id=?").get(id).state,"revoked");
    const actions=sqlite.prepare("SELECT action FROM admin_audit_events ORDER BY created_at").all().map(x=>x.action);
    assert.equal(actions.includes("temporary_permission_requested"),true);
    assert.equal(actions.includes("temporary_permission_activated"),true);
    assert.equal(actions.includes("temporary_permission_revoked"),true);
  }finally{sqlite.close();}
});
test("no MFA configuration, untrusted owner or cross-origin request can activate access",async()=>{
  const {sqlite,DB}=await fixture();
  try{
    assert.equal((await main.onRequestPost(request(DB,"POST",input,{owner:false}))).status,401);
    assert.equal((await main.onRequestPost(request(DB,"POST",input,{
      origin:"https://other.example"
    }))).status,403);
    assert.equal((await main.onRequestPost(request(DB,"POST",input,{
      env:{CF_ACCESS_STEP_UP_MFA_POLICY_CONFIRMED:"no"}
    }))).status,503);
    assert.equal((await main.onRequestPost(request(DB,"POST",{
      ...input,permission:"full_admin",confirm:true
    }))).status,400);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM founder_temporary_grants").get().n,0);
  }finally{sqlite.close();}
});
test("owner can retrieve a Markdown permissions summary without granting rights",async()=>{
  const {sqlite,DB}=await fixture();
  try{
    const out=await main.onRequestGet(request(DB,"GET",null,{accept:"text/markdown"}));
    assert.equal(out.status,200);
    assert.match(out.headers.get("content-type"),/text\/markdown/);
    assert.match(await out.text(),/You remain the owner/);
  }finally{sqlite.close();}
});

test("one-click emergency stop cancels both assistants atomically, without OTP",async()=>{
  const {sqlite,DB}=await fixture();
  try{
    const a=await main.onRequestPost(request(DB,"POST",{...input,assistant:"yorpmind"}));
    const b=await main.onRequestPost(request(DB,"POST",input));
    assert.equal(a.status,201);
    assert.equal(b.status,201);
    const first=(await a.json()).grant_id;
    const second=(await b.json()).grant_id;
    const stamp=new Date().toISOString();
    sqlite.prepare("UPDATE founder_temporary_grants SET state='active',activated_at=?,"+
      "activated_by=?,active_expires_at=? WHERE grant_id=?").run(
      stamp,"owner@example.com",new Date(Date.now()+15*60_000).toISOString(),first);
    assert.equal(sqlite.prepare(
      "SELECT state FROM founder_temporary_grants WHERE grant_id=?").get(second).state,"awaiting_mfa");
    const stop=await main.onRequestPatch(request(DB,"PATCH",{action:"revoke_all"}));
    assert.equal(stop.status,200);
    const result=await stop.json();
    assert.deepEqual({cancelled:result.cancelled,
      count:result.revoked_count,ended:result.assistant_access_ended,
      production_allowed:result.production_allowed},{
      cancelled:true,count:2,ended:true,production_allowed:false
    });
    assert.deepEqual(sqlite.prepare(
      "SELECT assistant,state FROM founder_temporary_grants ORDER BY assistant").all().map(({assistant,state})=>({assistant,state})),
      [{assistant:"chatgpt",state:"revoked"},{assistant:"yorpmind",state:"revoked"}]);
    assert.equal(sqlite.prepare(
      "SELECT COUNT(*) AS n FROM admin_audit_events "+
      "WHERE action='temporary_permissions_all_revoked'").get().n,1);
    const repeated=await main.onRequestPatch(request(DB,"PATCH",{action:"revoke_all"}));
    assert.equal(repeated.status,200);
    assert.equal((await repeated.json()).revoked_count,0);
    assert.equal((await main.onRequestPatch(request(DB,"PATCH",{action:"revoke_all"},
      {owner:false}))).status,401);
    assert.equal((await main.onRequestPatch(request(DB,"PATCH",{action:"revoke_all"},
      {origin:"https://wrong.example"}))).status,403);
    assert.equal((await main.onRequestPatch(request(DB,"PATCH",
      {action:"revoke_all",grant_id:second}))).status,400);
  }finally{sqlite.close();}
});
test("Founder Control exposes stop-all but clearly keeps collective OTP and applying fixes locked",async()=>{
  const html=await source("../admin/index.html");
  const js=await source("../admin/founder-control-center.js");
  assert.match(html,/id="founder-stop-all"/);
  assert.match(html,/id="founder-open-release"/);
  assert.match(html,/class="founder-permission-panel"[^>]*hidden/);
  assert.match(html,/value="both" disabled/);
  assert.match(html,/Only verified production publishing needs your one-time code/);
  assert.match(js,/action:"revoke_all"/);
  assert.match(js,/assistantNames/);
});

test("emergency stop fails closed without partially revoking if its audit write fails",async()=>{
  const {sqlite,DB}=await fixture();
  try{
    const created=await main.onRequestPost(request(DB,"POST",input));
    assert.equal(created.status,201);
    sqlite.exec("CREATE TRIGGER reject_stop_audit BEFORE INSERT ON admin_audit_events "+
      "WHEN NEW.action='temporary_permissions_all_revoked' "+
      "BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;");
    const stopped=await main.onRequestPatch(request(DB,"PATCH",{action:"revoke_all"}));
    assert.equal(stopped.status,503);
    const stillPending=sqlite.prepare("SELECT state FROM founder_temporary_grants").get();
    assert.equal(stillPending.state,"awaiting_mfa");
    sqlite.exec("DROP TRIGGER reject_stop_audit");
    assert.equal((await main.onRequestPatch(request(DB,"PATCH",{action:"revoke_all"}))).status,200);
    assert.equal(sqlite.prepare("SELECT state FROM founder_temporary_grants").get().state,"revoked");
  }finally{sqlite.close();}
});

test("emergency stop invalidates unspent email codes including joint grants",async()=>{
  const {sqlite,DB}=await fixture();
  try{
    const id="123e4567-e89b-42d3-a456-000000000812";
    const now=new Date().toISOString();
    sqlite.prepare(
      "INSERT INTO founder_otp_challenges (challenge_id,owner_email,"+
      "assistant_selection,scope,permission,duration_minutes,purpose,code_hmac,"+
      "state,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)"
    ).run(id,"owner@example.com","both","both","prepare_fixes",15,
      "Investigate and prepare a safe repair for the founder to review later.",
      "a".repeat(64),"sent",now,new Date(Date.now()+300000).toISOString());
    const stop=await main.onRequestPatch(request(DB,"PATCH",{action:"revoke_all"}));
    assert.equal(stop.status,200);
    assert.equal(sqlite.prepare("SELECT state FROM founder_otp_challenges WHERE challenge_id=?")
      .get(id).state,"cancelled");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM founder_temporary_grants")
      .get().n,0);
  }finally{sqlite.close();}
});
