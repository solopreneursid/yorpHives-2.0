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
const drift=asUrl("export const diagnoseHeadquartersDrift=args=>globalThis.__diagnoseDrift(args);");
const isolation=asUrl("export const verifyHeadquartersD1Isolation=project=>globalThis.__isolateD1(project);");
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
 ['"../../_lib/hq-release-drift.js"',drift],
 ['"../../_lib/hq-resource-isolation.js"',isolation],
 ['"../../_lib/go-live-readiness.js"',readiness]
]){assert.ok(source.includes(name),name);source=source.replace(name,JSON.stringify(url));}
const {onRequestGet}=await import(asUrl(source));
const sha="a".repeat(40),base="b".repeat(40);
const candidate={target:"headquarters",ready_for_preview:true,blockers:[],
 status:"verified_preview",candidate:{sha,target:"headquarters",number:48},
 preview:{url:"https://3c1e6315.yorphives-admin-staging.pages.dev",
 deploymentId:"3c1e6315-40b6-419d-83ef-81d77559df80"}};
globalThis.__isolateD1=()=>({
 isolated:true,production_deployment_enabled:false,
 database_migration_allowed:false,database_restore_verified:false
});
const env={
 FOUNDER_OWNER_EMAIL:"founder@example.com",
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
 globalThis.__diagnoseDrift=()=>({status:"aligned",reconciled:true,production_deployment_enabled:false});
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
 assert.equal(service.status,403);
 const body=await service.json();
 assert.equal(body.eligible,false);
 assert.equal(body.production_deployment_enabled,false);
});
test("founder release plan reports a shared D1 as a hard blocker even if other gates pass",async()=>{
 const oldFetch=globalThis.fetch;
 const previous=globalThis.__isolateD1;
 globalThis.__releaseCandidate=candidate;
 globalThis.__diagnoseDrift=()=>({status:"aligned",reconciled:true,
  production_deployment_enabled:false});
 globalThis.__isolateD1=()=>({isolated:false,
  production_deployment_enabled:false,database_migration_allowed:false,
  reason:"Preview and canonical Headquarters share the SAME D1 database."});
 globalThis.fetch=async(url)=>{
  if(url.includes("/branches/"))return Response.json({
   name:"build/yorphives-admin-reliability",commit:{sha:base}});
  if(url.includes("/pages/projects/"))return Response.json({success:true,result:{
   name:"yorphives-admin-staging",production_branch:"build/yorphives-admin-reliability",
   canonical_deployment:{deployment_trigger:{metadata:{commit_hash:base}}}
  }});
  throw Error("No publishing or branch comparison allowed");
 };
 try{
  const response=await onRequestGet(context());
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.eligible,false);
  assert.equal(body.plan,null);
  assert.equal(body.database_isolation.isolated,false);
  assert.equal(body.production_deployment_enabled,false);
  assert.match(body.blockers.join(" "),/SAME D1/);
 }finally{globalThis.fetch=oldFetch;globalThis.__isolateD1=previous;}
});
test("incomplete checks still expose founder-only read-only drift without planning a release",async()=>{
 const oldFetch=globalThis.fetch,calls=[];
 globalThis.__releaseCandidate={...candidate,ready_for_preview:false,blockers:["CI is incomplete"]};
 globalThis.__diagnoseDrift=()=>({status:"source_ahead_of_served",
  reconciled:false,source_sha:base,served_sha:"c".repeat(40),
  previous_deployment_id:"77ffbf58-5ff8-4f01-90ba-6e657d9acfc0",
  ahead_by:2,reason:"Verified canonical source drift.",production_deployment_enabled:false});
 globalThis.fetch=async(url,options)=>{
  calls.push({url,method:options.method});
  if(url.includes("/branches/"))return Response.json({
   name:"build/yorphives-admin-reliability",commit:{sha:base}});
  if(url.includes("/pages/projects/"))return Response.json({success:true,result:{
   name:"yorphives-admin-staging",
   canonical_deployment:{deployment_trigger:{metadata:{commit_hash:"c".repeat(40)}}}
  }});
  if(url.includes("/compare/"))return Response.json({status:"ahead",ahead_by:2,behind_by:0,
   base_commit:{sha:"c".repeat(40)},merge_base_commit:{sha:"c".repeat(40)}});
  throw Error("Unapproved provider request");
 };
 try{
  const response=await onRequestGet(context()),body=await response.json();
  assert.equal(body.eligible,false);
  assert.equal(body.plan,null);
  assert.equal(body.drift.status,"source_ahead_of_served");
  assert.equal(body.production_deployment_enabled,false);
  assert.ok(body.blockers.includes("CI is incomplete"));
  assert.equal(calls.length,3);
  assert.ok(calls.every(x=>x.method==="GET"));
  calls.length=0;
  const noToken=await onRequestGet(context("owner",{HQ_RELEASE_GITHUB_READ_TOKEN:""}));
  assert.equal((await noToken.json()).eligible,false);
  assert.equal(calls.length,0);
 }finally{globalThis.fetch=oldFetch;}
});

test("a different signed-in account cannot inspect the founder release plan",async()=>{
 globalThis.__releaseCandidate=candidate;
 const result=await onRequestGet(context("owner",{FOUNDER_OWNER_EMAIL:"other@example.com"}));
 assert.equal(result.status,403);
 assert.equal((await result.json()).eligible,false);
});
