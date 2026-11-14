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
const source=stripTypeScriptTypes(await read("../functions/api/admin/go-live-otp.ts"))
 .replace('"../../_lib/admin-auth"',JSON.stringify(auth));
const {onRequestPost}=await import(url(source));
const context=authenticated=>({
 request:new Request("https://private.example/api/admin/go-live-otp",{
  method:"POST",headers:{ "x-identity":authenticated?"founder":"other",
  origin:"https://private.example","content-type":"application/json" },
  body:JSON.stringify({action:"issue",target:"website",commit_sha:"a".repeat(40)})
 }),
 env:{get DB(){throw Error("Retired OTP route must not touch private DB");},
 get FOUNDER_MAIL(){throw Error("Retired OTP route must not send mail");}}
});
test("retired release OTP route denies even verified founder without touching private state",async()=>{
 const response=await onRequestPost(context(true));
 assert.equal(response.status,410);
 const data=await response.json();
 assert.equal(data.error.code,"MONITOR_ONLY");
 assert.equal(data.production_deployment_enabled,false);
});
test("unauthorized caller still cannot use retired OTP route",async()=>{
 assert.equal((await onRequestPost(context(false))).status,403);
});
test("no OTP, write, mail, or deployment code remains reachable in the route",async()=>{
 const raw=await read("../functions/api/admin/go-live-otp.ts");
 assert.doesNotMatch(raw,/HQ_GO_LIVE_OTP_TEST_ENABLED|sendFounderMail|INSERT INTO|UPDATE hq_go_live_challenges|validatedReleaseBinding/);
 assert.match(raw,/requireAdmin/);
 assert.match(raw,/410/);
});
