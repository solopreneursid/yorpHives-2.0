import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {stripTypeScriptTypes} from "node:module";
import {DatabaseSync} from "node:sqlite";
import {otpDigest,otpEnabled,generateSixDigitCode,normalizeGrantRequest,
  canonicalGrantPayload} from "../functions/_lib/founder-email-otp.js";

const source=path=>readFile(new URL(path,import.meta.url),"utf8");
const toModule=code=>"data:text/javascript;base64,"+
  Buffer.from(stripTypeScriptTypes(code)).toString("base64");
const auth=toModule(
  "export const adminJson=(body,status=200)=>Response.json(body,{status});"+
  "export const isAdminResponse=x=>x instanceof Response;"+
  "export const requireAdmin=async c=>c.request.headers.get('x-test-owner')==='yes'"+
  "?{email:'owner@example.com',serviceToken:false}:"+
  "Response.json({error:{code:'NO_OWNER'}},{status:401});"
);
const helper=toModule(await source("../functions/_lib/founder-email-otp.js"));
const code=(await source("../functions/api/admin/founder-otp.ts"))
  .replace('"../../_lib/admin-auth"',JSON.stringify(auth))
  .replace('"../../_lib/founder-email-otp.js"',JSON.stringify(helper));
const routes=await import(toModule(code));
function adapter(sqlite){
  const prepare=sql=>{
    let values=[];
    const stmt={
      bind(...v){values=v;return stmt;},
      async first(){return sqlite.prepare(sql).get(...values)||null;},
      async all(){return{results:sqlite.prepare(sql).all(...values),success:true};},
      async run(){const x=sqlite.prepare(sql).run(...values);
        return{success:true,meta:{changes:Number(x.changes)}};}
    };
    return stmt;
  };
  return {prepare,async batch(statements){
    sqlite.exec("BEGIN");
    try{
      const out=[];
      for(const statement of statements)out.push(await statement.run());
      sqlite.exec("COMMIT");return out;
    }catch(e){sqlite.exec("ROLLBACK");throw e;}
  }};
}
async function fixture(){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec(await source("../migrations/0028_founder_temporary_grants.sql"));
  sqlite.exec(await source("../migrations/0029_founder_email_otp.sql"));
  sqlite.exec("CREATE TABLE admin_audit_events(id TEXT PRIMARY KEY,actor TEXT,action TEXT,resource_type TEXT,resource_id TEXT,details_json TEXT,created_at TEXT)");
  const outgoing=[];
  const env={
    DB:adapter(sqlite),FOUNDER_OTP_ENABLED:"yes",
    FOUNDER_OWNER_EMAIL:"owner@example.com",
    FOUNDER_OTP_HMAC_KEY:"a dummy test-only secret longer than thirty-two characters",
    FOUNDER_OTP_FROM:"security@yorphives.com",
    FOUNDER_MAIL:{async send(message){outgoing.push(message);return{messageId:"test-only"};}},
    ADMIN_AGENT_SERVICE:{fetch:async()=>new Response(null,{status:404})},
    CF_ACCESS_AUD:"owner-audience",CF_ACCESS_AGENT_AUD:"agents-audience",
    CF_ACCESS_YORPMIND_SERVICE_TOKEN_ID:"yorpmind-demo-identity",
    CF_ACCESS_CHATGPT_SERVICE_TOKEN_ID:"chatgpt-demo-identity",
    CF_ACCESS_STEP_UP_AUD:"extra-step-up-audience"
  };
  const req=(body=null,options={})=>({
    env:{...env,...(options.env||{})},
    request:new Request("https://private.example/api/admin/founder-otp",{
      method:body?"POST":"GET",
      headers:{"x-test-owner":options.owner===false?"no":"yes",
        "origin":options.origin||"https://private.example",
        "content-type":"application/json"},
      ...(body?{body:JSON.stringify(body)}:{})
    })
  });
  return {sqlite,env,outgoing,req};
}
const grant={
  assistant:"both",scope:"both",permission:"prepare_fixes",duration_minutes:15,
  purpose:"Review the YorpHives issues, prepare traceable fixes and leave the public site unchanged.",
  confirm:true
};
test("one-time code primitives are action bound and reject invalid scope",async()=>{
  assert.equal(normalizeGrantRequest(grant)?.assistant,"both");
  assert.equal(normalizeGrantRequest({...grant,assistant:"root"}),null);
  assert.equal(normalizeGrantRequest({...grant,duration_minutes:9999}),null);
  assert.equal(normalizeGrantRequest({...grant,permission:"deploy_production"}),null);
  for(let i=0;i<200;i++)assert.match(generateSixDigitCode(),/^[0-9]{6}$/);
  const id="123e4567-e89b-42d3-a456-000000000111";
  const digest=await otpDigest("test secret with at least 32 characters length",
    id,"owner@example.com",canonicalGrantPayload(grant),"123456");
  assert.match(digest,/^[0-9a-f]{64}$/);
  assert.notEqual(digest,await otpDigest(
    "test secret with at least 32 characters length",
    id,"other@example.com",canonicalGrantPayload(grant),"123456"));
  assert.notEqual(digest,await otpDigest(
    "test secret with at least 32 characters length",
    id,"owner@example.com",
    canonicalGrantPayload({...grant,assistant:"chatgpt"}),"123456"));
});
test("legacy assistant OTP is not available even with fully configured email",async()=>{
 const {sqlite,outgoing,req}=await fixture();try{
  const ready=await routes.onRequestGet(req());
  assert.equal(ready.status,200);
  const status=await ready.json();
  assert.equal(status.can_request,false);
  assert.equal(status.collective_available,false);
  assert.equal(status.email_ready,false);
  const send=await routes.onRequestPost(req({action:"send",...grant}));
  assert.equal(send.status,410);
  assert.match(JSON.stringify(await send.json()),/ASSISTANT_GRANTS_RETIRED/);
  const verify=await routes.onRequestPost(req({action:"verify",
    challenge_id:"123e4567-e89b-42d3-a456-000000000111",code:"123456"}));
  assert.equal(verify.status,410);
  assert.equal(outgoing.length,0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM founder_otp_challenges").get().n,0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM founder_temporary_grants").get().n,0);
 }finally{sqlite.close();}
});
test("untrusted session still cannot access retired OTP",async()=>{
 const {sqlite,req}=await fixture();try{
  assert.equal((await routes.onRequestPost(req({action:"send",...grant},{owner:false}))).status,401);
 }finally{sqlite.close();}
});
