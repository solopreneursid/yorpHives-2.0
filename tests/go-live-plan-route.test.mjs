import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {stripTypeScriptTypes} from "node:module";
const asUrl=code=>"data:text/javascript;base64,"+Buffer.from(code).toString("base64");
const auth=asUrl(
 "export const adminJson=(value,status=200)=>Response.json(value,{status});"+
 "export const isAdminResponse=r=>r instanceof Response;"+
 "export const requireAdmin=async context=>{const h=context.request.headers.get('x-test-actor');"+
 "return h==='owner'?{email:'founder@example.com',serviceToken:false}:"+
 "h==='service'?{email:'github-actions@internal',serviceToken:true}:"+
 "new Response('Cloudflare Access required',{status:403});};");
const live=asUrl("export const readLiveGoLiveReadiness=async()=>globalThis.__releaseCandidate;");
const plan=asUrl("export const planHeadquartersFastForward=args=>globalThis.__buildReleasePlan(args);");
const readiness=asUrl(
 'export const REPO="solopreneursid/yorpHives-2.0";'+
 'export const RELEASE_BASE_BRANCH={headquarters:"build/yorphives-admin-reliability"};'+
 'export const RELEASE_PROJECT={headquarters:"yorphives-admin-staging"};');
let source=stripTypeScriptTypes(await readFile(
 new URL("../functions/api/admin/go-live-plan.ts",import.meta.url),"utf8"));
for(const [name,url] of [
 ['"../../_lib/admin-auth"',auth],
 ['"../../_lib/go-live-live.js"',live],
 ['"../../_lib/hq-go-live-plan.js"',plan],
 ['"../../_lib/go-live-readiness.js"',readiness]
]){assert.ok(source.includes(name),name);source=source.replace(name,JSON.stringify(url));}
const {onRequestGet}=await import(asUrl(source));
const sha="a".repeat(40),base="b".repeat(40);
const candidate={target:"headquarters",ready_for_preview:true,blockers:[],
 status:"verified_preview",candidate:{sha,target:"headquarters",number:48},
 preview:{url:"https://3c1e6315.yorphives-admin-staging.pages.dev",
 deploymentId:"3c1e6315-40b6-419d-83ef-81d77559df80"}};
const env={
 HQ_RELEASE_GITHUB_READ_TOKEN:"g".repeat(40),
 HQ_RELEASE_CLOUDFLARE_READ_TOKEN:"c".repeat(40),
 HQ_RELEASE_CLOUDFLARE_ACCOUNT_ID:"1".repeat(32)
};
function context(actor="owner",extraEnv={}){
 return {env:{...env,...extraEnv},
  request:new Request("https://private.example/api/admin/go-live-plan",
   {headers:{"x-test-actor":actor}})};
}
test("the founder can inspect an exact release plan via read-only provider calls",async()=>{
 const oldFetch=globalThis.fetch,calls=[];
 globalThis.__releaseCandidate=candidate;
 globalThis.__buildReleasePlan=given=>{
  assert.equal(given.readiness.candidate.sha,sha);
  assert.equal(given.compareBase,base);
  assert.equal(given.compareHead,sha);
  return {eligible:true,production_deployment_enabled:false,
   plan:{target:"headquarters",target_sha:sha,approved:false}};
 };
 globalThis.fetch=async(url,options)=>{
  calls.push({url,method:options.method});
  if(url.includes("/branches/"))return Response.json({
   name:"build/yorphives-admin-reliability",commit:{sha:base}});
  if(url.includes("/compare/"))return Response.json({
   status:"ahead",behind_by:0,ahead_by:1,base_commit:{sha:base},merge_base_commit:{sha:base}});
  if(url.includes("/pages/projects/"))return Response.json({success:true,result:{
   name:"yorphives-admin-staging",production_branch:"build/yorphives-admin-reliability"}});
  throw Error("Unapproved network target");
 };
 try{
  const response=await onRequestGet(context());
  assert.equal(response.status,200);
  const obj=await response.json();
  assert.equal(obj.plan.target_sha,sha);
  assert.equal(obj.plan.approved,false);
  assert.equal(obj.production_deployment_enabled,false);
  assert.equal(calls.length,3);
  assert.ok(calls.every(x=>x.method==="GET"));
 }finally{globalThis.fetch=oldFetch;}
});
test("automated service identities and unauthenticated requests cannot see founder release plans",async()=>{
 globalThis.__releaseCandidate=candidate;
 assert.equal((await onRequestGet(context("unknown"))).status,403);
 const service=await onRequestGet(context("service"));
 assert.equal(service.status,200);
 const body=await service.json();
 assert.equal(body.eligible,false);
 assert.equal(body.production_deployment_enabled,false);
});
test("incomplete live checks or missing provider permissions lock the release plan",async()=>{
 const oldFetch=globalThis.fetch;
 try{
  let calls=0;
  globalThis.fetch=async()=>{calls++;throw Error("No provider call should happen");};
  globalThis.__releaseCandidate={...candidate,ready_for_preview:false,blockers:["CI is incomplete"]};
  const rejected=await onRequestGet(context());
  assert.equal((await rejected.json()).eligible,false);
  assert.equal(calls,0);
  globalThis.__releaseCandidate=candidate;
  const noToken=await onRequestGet(context("owner",{HQ_RELEASE_GITHUB_READ_TOKEN:""}));
  assert.equal((await noToken.json()).eligible,false);
  assert.equal(calls,0);
 }finally{globalThis.fetch=oldFetch;}
});
