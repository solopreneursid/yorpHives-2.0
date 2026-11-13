import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {DatabaseSync} from "node:sqlite";
import {stripTypeScriptTypes} from "node:module";
const read=p=>readFile(new URL(p,import.meta.url),"utf8");
const url=s=>"data:text/javascript;base64,"+Buffer.from(s).toString("base64");
const auth=url(
 "export const adminJson=(x,status=200)=>Response.json(x,{status});"+
 "export const isAdminResponse=x=>x instanceof Response;"+
 "export const requireAdmin=async c=>c.request.headers.get('x-test-owner')==='human'?"+
 "{email:'founder@example.org',serviceToken:false}:"+
 "c.request.headers.get('x-test-owner')==='service'?"+
 "{email:'founder@example.org',serviceToken:true}:"+
 "new Response('Denied',{status:403});"
);
const live=url("export async function readLiveGoLiveReadiness(env,target){return globalThis.__liveRelease(target);}");
const core=url(await read("../functions/_lib/go-live-otp-core.js"));
const otp=url(await read("../functions/_lib/founder-email-otp.js"));
let source=stripTypeScriptTypes(await read("../functions/api/admin/go-live-otp.ts"));
for(const [needle,value] of [
 ['"../../_lib/admin-auth"',auth],
 ['"../../_lib/go-live-live.js"',live],
 ['"../../_lib/go-live-otp-core.js"',core],
 ['"../../_lib/founder-email-otp.js"',otp]
]){
 if(!source.includes(needle))throw Error("Missing import "+needle);
 source=source.replace(needle,JSON.stringify(value));
}
const {onRequestPost}=await import(url(source));
const sha="b".repeat(40),deployment="123e4567-e89b-42d3-a456-000000000001";
const preview="https://12abcd34.yorphives-2-preview.pages.dev";
const GOOD={target:"website",status:"verified_preview",ready_for_preview:true,
 production_approved:false,production_deployment_enabled:false,blockers:[],
 candidate:{target:"website",sha,number:84},preview:{url:preview,deploymentId:deployment}};
function adapter(sqlite){
 const prepare=sql=>{
  let params=[];const stmt={
   bind(...args){params=args;return stmt;},
   async first(){return sqlite.prepare(sql).get(...params)||null;},
   async all(){return {results:sqlite.prepare(sql).all(...params),success:true};},
   async run(){const x=sqlite.prepare(sql).run(...params);return {success:true,meta:{changes:Number(x.changes)}};}
  };return stmt;
 };
 return {prepare,async batch(statements){
  sqlite.exec("BEGIN");try{
   const results=[];for(const x of statements)results.push(await x.run());
   sqlite.exec("COMMIT");return results;
  }catch(e){sqlite.exec("ROLLBACK");throw e;}
 }};
}
async function fixture(){
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec(await read("../migrations/0030_go_live_otp.sql"));
 sqlite.exec("CREATE TABLE admin_audit_events(id TEXT PRIMARY KEY,actor TEXT,action TEXT,resource_type TEXT,resource_id TEXT,details_json TEXT,created_at TEXT)");
 const mails=[];
 const env={
  DB:adapter(sqlite),HQ_GO_LIVE_OTP_TEST_ENABLED:"yes",
  FOUNDER_OWNER_EMAIL:"founder@example.org",
  FOUNDER_OTP_HMAC_KEY:"s".repeat(64),
  FOUNDER_OTP_FROM:"security@yorphives.com",
  FOUNDER_MAIL:{send:async message=>{mails.push(message);return {success:true};}}
 };
 globalThis.__liveRelease=async()=>GOOD;
 const issue={action:"issue",target:"website",commit_sha:sha,preview_deployment_id:deployment};
 const request=(body,options={})=>({
  env:{...env,...(options.env||{})},
  request:new Request("https://private.yorphives.example/api/admin/go-live-otp",{
   method:"POST",headers:{
    origin:options.origin||"https://private.yorphives.example",
    "content-type":"application/json",
    "x-test-owner":options.identity||"human"
   },body:JSON.stringify(body)
  })
 });
 return {sqlite,env,mails,issue,request};
}
test("requires founder and explicit test-only flag; AI or CI cannot issue OTP",async()=>{
 const x=await fixture();try{
  assert.equal((await onRequestPost(x.request(x.issue,{identity:"service"}))).status,403);
  assert.equal((await onRequestPost(x.request(x.issue,{identity:"unknown"}))).status,403);
  assert.equal((await onRequestPost(x.request(x.issue,{env:{HQ_GO_LIVE_OTP_TEST_ENABLED:"no"}}))).status,503);
  assert.equal((await onRequestPost(x.request(x.issue,{origin:"https://evil.example"}))).status,403);
  assert.equal(x.mails.length,0);
 }finally{x.sqlite.close();}
});
test("wrong and stale candidate never generate a code or authorize release",async()=>{
 const x=await fixture();try{
  globalThis.__liveRelease=async()=>({...GOOD,blockers:["Independent QA missing"]});
  assert.equal((await onRequestPost(x.request(x.issue))).status,409);
  assert.equal(x.mails.length,0);
  globalThis.__liveRelease=async()=>GOOD;
  assert.equal((await onRequestPost(x.request({...x.issue,commit_sha:"a".repeat(40)}))).status,409);
  assert.equal(x.mails.length,0);
 }finally{x.sqlite.close();}
});
test("release OTP is action bound, attempt-limited, replay-safe and DOES NOT publish",async()=>{
 const x=await fixture();try{
  const begin=await onRequestPost(x.request(x.issue));
  assert.equal(begin.status,202);
  const start=await begin.json();
  assert.equal(start.production_deployed,false);
  assert.equal(start.production_approved,false);
  assert.equal(x.mails.length,1);
  const match=/code is: ([0-9]{6})/.exec(x.mails[0].text);
  assert.ok(match);
  const id=start.challenge_id;
  const challenge=x.sqlite.prepare("SELECT * FROM hq_go_live_challenges WHERE challenge_id=?").get(id);
  assert.equal(challenge.state,"sent");
  assert.equal(challenge.code_hmac.length,64);
  assert.ok(!JSON.stringify(challenge).includes(match[1]));
  assert.equal((await onRequestPost(x.request(x.issue))).status,429);
  const bad=await onRequestPost(x.request({action:"verify",challenge_id:id,code:"000000"===match[1]?"000001":"000000"}));
  assert.equal(bad.status,403);
  assert.equal(x.sqlite.prepare("SELECT attempts FROM hq_go_live_challenges WHERE challenge_id=?").get(id).attempts,1);
  const verified=await onRequestPost(x.request({action:"verify",challenge_id:id,code:match[1]}));
  assert.equal(verified.status,200);
  const receipt=await verified.json();
  assert.equal(receipt.verified,true);
  assert.equal(receipt.production_deployed,false);
  assert.equal(receipt.production_approved,false);
  const replay=await onRequestPost(x.request({action:"verify",challenge_id:id,code:match[1]}));
  assert.equal(replay.status,409);
  assert.equal(x.sqlite.prepare("SELECT state FROM hq_go_live_challenges WHERE challenge_id=?").get(id).state,"verified");
  assert.equal(x.sqlite.prepare("SELECT COUNT(*) AS n FROM admin_audit_events").get().n,1);
 }finally{x.sqlite.close();}
});
test("new source revision invalidates an otherwise valid OTP without consuming it",async()=>{
 const x=await fixture();try{
  const begin=await onRequestPost(x.request(x.issue));
  const id=(await begin.json()).challenge_id;
  const code=/code is: ([0-9]{6})/.exec(x.mails[0].text)[1];
  globalThis.__liveRelease=async()=>({...GOOD,candidate:{...GOOD.candidate,sha:"a".repeat(40)}});
  assert.equal((await onRequestPost(x.request({action:"verify",challenge_id:id,code}))).status,409);
  assert.equal(x.sqlite.prepare("SELECT state FROM hq_go_live_challenges WHERE challenge_id=?").get(id).state,"sent");
  assert.equal(x.sqlite.prepare("SELECT COUNT(*) AS n FROM admin_audit_events").get().n,0);
 }finally{x.sqlite.close();}
});
