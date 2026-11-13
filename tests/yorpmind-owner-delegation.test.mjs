import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {stripTypeScriptTypes} from "node:module";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const toURL=s=>"data:text/javascript;base64,"+Buffer.from(s).toString("base64");
const evidence=toURL(await read("../functions/_lib/release-evidence.js"));
const helper=toURL((await read("../functions/_lib/owner-delegation.js"))
 .replace('"./release-evidence.js"',JSON.stringify(evidence)));
const {validatePreviewUrl,validateOwnerDelegationInput,OWNER_DELEGATION_EXECUTOR_ENABLED}=await import(helper);
const fakeAuth=toURL(
 "export const adminJson=(x,status=200)=>Response.json(x,{status});"+
 "export const isAdminResponse=x=>x instanceof Response;"+
 "export const requireAdmin=async c=>c.request.headers.has('x-ci')?new Response('Denied',{status:403}):{email:'founder@example.test',serviceToken:false};"+
 "export const requireOwnerStepUp=async c=>c.request.headers.has('x-stepup')?{email:'founder@example.test',serviceToken:false}:new Response('MFA required',{status:403});");
const source=await read("../functions/api/admin/owner-delegations.ts");
const route=await import(toURL(stripTypeScriptTypes(source)
 .replace('"../../_lib/admin-auth"',JSON.stringify(fakeAuth))));
const second=await read("../functions/api/admin/step-up/owner-delegations.ts");
const step=await import(toURL(stripTypeScriptTypes(second)
 .replace('"../../../_lib/admin-auth"',JSON.stringify(fakeAuth))));
const db=async()=>{const sqlite=new DatabaseSync(":memory:");
 sqlite.exec(await read("../migrations/0026_yorpmind_owner_delegation.sql"));
 return {sqlite,DB:{prepare:sql=>({first:async()=>sqlite.prepare(sql).get()||null,
  all:async()=>({results:sqlite.prepare(sql).all()}),bind:()=>{throw Error("Unexpected write binding");}})}};
};
test("old checker and preview parser cannot authorize a release",()=>{
 assert.equal(OWNER_DELEGATION_EXECUTOR_ENABLED,false);
 assert.equal(validatePreviewUrl("https://one.yorphives-admin-staging.pages.dev"),"https://one.yorphives-admin-staging.pages.dev");
 assert.equal(validateOwnerDelegationInput({action:"grant_admin"}),null);
});
test("founder can inspect historical delegations, not issue new approval requests",async()=>{
 const {sqlite,DB}=await db();
 try{
  const context={env:{DB},request:new Request("https://hq.example/api/admin/owner-delegations")};
  const get=await route.onRequestGet(context);
  assert.equal(get.status,200);
  const x=await get.json();
  assert.equal(x.mechanism,"retired_delegation_history");
  assert.equal(x.can_create,false);
  assert.equal(x.execution_enabled,false);
  assert.deepEqual(x.delegations,[]);
  const post=await route.onRequestPost(context);
  assert.equal(post.status,410);
  assert.match(JSON.stringify(await post.json()),/LEGACY_APPROVAL_RETIRED/);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM yorpmind_owner_delegations").get().n,0);
  const denied=await route.onRequestPost({...context,request:new Request("https://hq.example",{headers:{"x-ci":"true"}})});
  assert.equal(denied.status,403);
 }finally{sqlite.close();}
});
test("even founder MFA cannot activate the obsolete step-up form or record delegation",async()=>{
 const {sqlite,DB}=await db();
 try{
  const context={env:{DB},request:new Request("https://hq.example/api/admin/step-up/owner-delegations",{headers:{"x-stepup":"yes"}})};
  assert.equal((await step.onRequestGet(context)).status,410);
  assert.equal((await step.onRequestPost(context)).status,410);
  assert.equal((await step.onRequestPost({...context,request:new Request("https://hq.example")})).status,403);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM yorpmind_owner_delegations").get().n,0);
 }finally{sqlite.close();}
});
