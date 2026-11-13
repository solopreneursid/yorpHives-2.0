import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { DatabaseSync } from "node:sqlite";
const source=path=>readFile(new URL(path,import.meta.url),"utf8");
const moduleURL=s=>"data:text/javascript;base64,"+Buffer.from(stripTypeScriptTypes(s)).toString("base64");
const perms=moduleURL(await source("../functions/_lib/founder-permissions.js"));
const auth=moduleURL(
"export const adminJson=(body,status=200)=>Response.json(body,{status});"+
"export const isAdminResponse=x=>x instanceof Response;"+
"export const requireAdmin=async c=>c.request.headers.get('x-test-owner')==='yes'?{email:'owner@example.test',serviceToken:false}:Response.json({error:'Denied'},{status:401});"+
"export const requireOwnerStepUp=async c=>c.request.headers.get('x-test-stepup')==='yes'?{email:'owner@example.test',serviceToken:false}:Response.json({error:'Fresh sign in needed'},{status:403});"
);
const normal=await import(moduleURL((await source("../functions/api/admin/assistant-permissions.ts"))
 .replace('"../../_lib/admin-auth"',JSON.stringify(auth))
 .replace('"../../_lib/founder-permissions.js"',JSON.stringify(perms))));
const stepup=await import(moduleURL((await source("../functions/api/admin/step-up/assistant-permissions.ts"))
 .replace('"../../../_lib/admin-auth"',JSON.stringify(auth))
 .replace('"../../../_lib/founder-permissions.js"',JSON.stringify(perms))));
function adapter(sqlite){
 const prepare=sql=>{let values=[];const stmt={
  bind(...v){values=v;return stmt;},
  async first(){return sqlite.prepare(sql).get(...values)||null;},
  async all(){return {results:sqlite.prepare(sql).all(...values),success:true};},
  async run(){const x=sqlite.prepare(sql).run(...values);return {success:true,meta:{changes:Number(x.changes)}};}
 };return stmt;};
 return {prepare,async batch(statements){
  sqlite.exec("BEGIN");try{
   const result=[];for(const stmt of statements)result.push(await stmt.run());sqlite.exec("COMMIT");return result;
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
function req(DB,method="GET",body=null,opts={}){
 const url="https://private.example/api/admin/assistant-permissions";
 return {env:{DB,CF_ACCESS_AUD:"owner",CF_ACCESS_STEP_UP_AUD:"verified-mfa",CF_ACCESS_STEP_UP_MFA_POLICY_CONFIRMED:"yes"},
 request:new Request(url,{
 method,headers:{"x-test-owner":opts.owner===false?"no":"yes",
 "x-test-stepup":opts.stepup===true?"yes":"no",
 origin:opts.origin||"https://private.example", "content-type":"application/json"},
 ...(method==="GET"?{}:{body:JSON.stringify(body)})
 })};
}
test("founder can inspect legacy grants, but no new administrator grant is allowed",async()=>{
 const {sqlite,DB}=await fixture();try{
  const get=await normal.onRequestGet(req(DB));
  assert.equal(get.status,200);
  const info=await get.json();
  assert.equal(info.owner_is_in_charge,true);
  assert.equal(info.mfa_configured,false);
  assert.deepEqual(info.active_actions_supported,[]);
  const attempted=await normal.onRequestPost(req(DB,"POST",{
   assistant:"yorpmind",scope:"both",permission:"manage_staging",
   duration_minutes:60,purpose:"Prepare improvements to the development environment only",confirm:true
  }));
  assert.equal(attempted.status,410);
  assert.match(JSON.stringify(await attempted.json()),/ASSISTANT_GRANTS_RETIRED/);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM founder_temporary_grants").get().n,0);
 }finally{sqlite.close();}
});
test("neither unknown identity nor old MFA page can activate assistant grants",async()=>{
 const {sqlite,DB}=await fixture();try{
  assert.equal((await normal.onRequestPost(req(DB,"POST",{}, {owner:false}))).status,401);
  const attempted=await stepup.onRequestPost(req(DB,"POST",{}, {stepup:true}));
  assert.equal(attempted.status,410);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM founder_temporary_grants").get().n,0);
 }finally{sqlite.close();}
});
test("emergency revoke remains available for any legacy pending or active records",async()=>{
 const {sqlite,DB}=await fixture();try{
  const stamp=new Date().toISOString(),end=new Date(Date.now()+600000).toISOString();
  const text="Legacy temporary permissions must be cancelled immediately under the founder-only release policy.";
  sqlite.prepare("INSERT INTO founder_temporary_grants(grant_id,assistant,scope,permission,duration_minutes,purpose,owner_email,state,created_at,request_expires_at) VALUES(?,?,?,?,?,?,?,'awaiting_mfa',?,?)").run(
   "123e4567-e89b-42d3-a456-000000000001","yorpmind","website","prepare_fixes",15,text,"owner@example.test",stamp,end);
  sqlite.prepare("INSERT INTO founder_temporary_grants(grant_id,assistant,scope,permission,duration_minutes,purpose,owner_email,state,created_at,request_expires_at,activated_at,activated_by,active_expires_at) VALUES(?,?,?,?,?,?,?,'active',?,?,?,?,?)").run(
   "123e4567-e89b-42d3-a456-000000000002","chatgpt","both","prepare_fixes",15,text,"owner@example.test",stamp,end,stamp,"owner@example.test",end);
  const revoked=await normal.onRequestPatch(req(DB,"PATCH",{action:"revoke_all"}));
  assert.equal(revoked.status,200);
  assert.equal((await revoked.json()).revoked_count,2);
  assert.deepEqual(sqlite.prepare("SELECT DISTINCT state FROM founder_temporary_grants").all().map(x=>x.state),["revoked"]);
  const second=await normal.onRequestPatch(req(DB,"PATCH",{action:"revoke_all"}));
  assert.equal((await second.json()).revoked_count,0);
  assert.equal((await normal.onRequestPatch(req(DB,"PATCH",{action:"revoke_all"},{owner:false}))).status,401);
  assert.equal((await normal.onRequestPatch(req(DB,"PATCH",{action:"revoke_all"},{origin:"https://evil.example"}))).status,403);
 }finally{sqlite.close();}
});
test("preview shows only production-authorized founder controls",async()=>{
 const html=await source("../admin/index.html");
 assert.match(html,/id="founder-open-release"/);
 assert.match(html,/id="founder-stop-all"/);
 assert.match(html,/id="view-security"/);
 assert.match(html,/class="founder-permission-panel"[^>]*open/);
 assert.doesNotMatch(html.slice(html.indexOf('id="view-headquarters"'),html.indexOf('id="view-yorpmind"')),/id="founder-stop-all"/);
 assert.match(html,/id="release-go-live"[^>]*disabled/);
});
