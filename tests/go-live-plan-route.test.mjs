import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {stripTypeScriptTypes} from "node:module";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const url=source=>"data:text/javascript;base64,"+Buffer.from(source).toString("base64");
const auth=url(
 "export const adminJson=(data,status=200)=>Response.json(data,{status});"+
 "export const isAdminResponse=value=>value instanceof Response;"+
 "export const requireAdmin=async ctx=>ctx.request.headers.get('x-identity')==='founder'?"+
 "{email:'founder@example.com'}:new Response('Forbidden',{status:403});"
);
async function load(path){
 const source=stripTypeScriptTypes(await read(path))
  .replace('"../../_lib/admin-auth"',JSON.stringify(auth));
 return import(url(source));
}
const {onRequestGet:onPlan}=await load("../functions/api/admin/go-live-plan.ts");
const {onRequestGet:onGoLive}=await load("../functions/api/admin/go-live.ts");
const context=authenticated=>({
 request:new Request("https://private.example/api/admin/go-live-plan",{
  headers:{"x-identity":authenticated?"founder":"other"}}),
 env:{get HQ_RELEASE_GITHUB_READ_TOKEN(){throw Error("Release route should not call GitHub");},
 get HQ_RELEASE_CLOUDFLARE_READ_TOKEN(){throw Error("Release route should not call Cloudflare");}}
});
test("all deprecated production readiness endpoints are unavailable even to founder",async()=>{
 for(const handler of [onPlan,onGoLive]){
  const response=await handler(context(true));
  assert.equal(response.status,410);
  const data=await response.json();
  assert.equal(data.error.code,"MONITOR_ONLY");
  assert.equal(data.production_deployment_enabled,false);
 }
});
test("retired release endpoints remain authenticated and do no remote work",async()=>{
 for(const handler of [onPlan,onGoLive]){
  assert.equal((await handler(context(false))).status,403);
 }
 for(const path of ["../functions/api/admin/go-live-plan.ts","../functions/api/admin/go-live.ts"]){
  const raw=await read(path);
  assert.match(raw,/requireAdmin/);
  assert.doesNotMatch(raw,/readLiveGoLiveReadiness|planHeadquartersFastForward|fetch\(/);
 }
});
