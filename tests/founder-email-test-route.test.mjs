import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {stripTypeScriptTypes} from "node:module";
import {DatabaseSync} from "node:sqlite";
const source=path=>readFile(new URL(path,import.meta.url),"utf8");
const toModule=x=>"data:text/javascript;base64,"+
  Buffer.from(stripTypeScriptTypes(x)).toString("base64");
const auth=toModule("export const adminJson=(body,status=200)=>Response.json(body,{status});"+
  "export const isAdminResponse=x=>x instanceof Response;"+
  "export const requireAdmin=async c=>c.request.headers.get('x-test-owner')==='yes'"+
  "?{email:'owner@example.com',serviceToken:false}:"+
  "Response.json({error:{code:'NO_OWNER'}},{status:401});");
const helper=toModule(await source("../functions/_lib/founder-email-otp.js"));
const route=(await source("../functions/api/admin/founder-email-check.ts"))
  .replace('"../../_lib/admin-auth"',JSON.stringify(auth))
  .replace('"../../_lib/founder-email-otp.js"',JSON.stringify(helper));
const handler=await import(toModule(route));
function adapter(sqlite){
  return {prepare(sql){
    let values=[];
    return {bind(...v){values=v;return this;},
      async first(){return sqlite.prepare(sql).get(...values)||null;},
      async run(){const x=sqlite.prepare(sql).run(...values);
        return{success:true,meta:{changes:Number(x.changes)}};}
    };
  }};
}
function fixture(){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE admin_audit_events(id TEXT PRIMARY KEY,"+
    "actor TEXT,action TEXT,resource_type TEXT,resource_id TEXT,"+
    "details_json TEXT,created_at TEXT)");
  const outgoing=[];
  const env={DB:adapter(sqlite),FOUNDER_OWNER_EMAIL:"owner@example.com",
    FOUNDER_OTP_ENABLED:"no",
    FOUNDER_OTP_FROM:"security@approvals.yorphives.com",
    FOUNDER_OTP_HMAC_KEY:"test only secret with 32+ bytes of random-looking text",
    FOUNDER_MAIL:{async send(m){outgoing.push(m);return{messageId:"fixture"};}}};
  const request=(options={})=>({env:{...env,...options.env},
    request:new Request("https://headquarters.example/api/admin/founder-email-check",{
      method:"POST",
      headers:{"origin":options.origin||"https://headquarters.example",
        "x-test-owner":options.owner===false?"no":"yes",
        "content-type":"application/json"},
      body:options.body===undefined?'{"action":"send_test"}':options.body
    })
  });
  return {sqlite,outgoing,env,request};
}
test("founder email smoke works when assistant grants remain disabled, with one-per-hour limit",async()=>{
  const {sqlite,outgoing,request}=fixture();
  try{
    const sent=await handler.onRequestPost(request());
    assert.equal(sent.status,200);
    assert.deepEqual(await sent.json(),{
      accepted:true,permission_active:false,production_allowed:false,
      note:"Cloudflare accepted the email. Check inbox or spam to confirm delivery."
    });
    assert.equal(outgoing.length,1);
    assert.equal(outgoing[0].from,"security@approvals.yorphives.com");
    assert.equal(outgoing[0].to,"owner@example.com");
    assert.doesNotMatch(outgoing[0].text,/\b\d{6}\b/);
    assert.equal(sqlite.prepare(
      "SELECT COUNT(*) AS n FROM admin_audit_events WHERE "+
      "action='founder_email_delivery_test_requested'").get().n,1);
    assert.equal((await handler.onRequestPost(request())).status,429);
    assert.equal(outgoing.length,1);
  }finally{sqlite.close();}
});
test("owner identity, origin, body and sender failure all fail closed",async()=>{
  const {sqlite,outgoing,request}=fixture();
  try{
    assert.equal((await handler.onRequestPost(request({owner:false}))).status,401);
    assert.equal((await handler.onRequestPost(request({
      origin:"https://attacker.example"}))).status,403);
    assert.equal((await handler.onRequestPost(request({
      body:'{"action":"send_test","role":"admin"}'}))).status,400);
    assert.equal((await handler.onRequestPost(request({
      env:{FOUNDER_OTP_HMAC_KEY:""}}))).status,503);
    assert.equal(outgoing.length,0);
    const broken=await handler.onRequestPost(request({env:{FOUNDER_MAIL:{
      send:async()=>{throw Error("cannot deliver");}
    }}}));
    assert.equal(broken.status,503);
    assert.equal((await handler.onRequestPost(request())).status,429);
    assert.equal(outgoing.length,0);
  }finally{sqlite.close();}
});
test("Founder Control exposes a test button without enabling administrator access",async()=>{
  const js=await source("../admin/founder-control-center.js");
  const html=await source("../admin/index.html");
  assert.match(html,/id="founder-test-email" type="button" disabled/);
  assert.match(js,/deliveryReady=otp\?\.delivery_ready===true/);
  assert.match(js,/body:'\{"action":"send_test"\}'/);
  assert.match(js,/founder-stop-all/);
  assert.match(js,/otpReady=otp\?\.can_request===true/);
});
