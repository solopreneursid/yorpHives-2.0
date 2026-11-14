import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {stripTypeScriptTypes} from "node:module";

const root=new URL("../",import.meta.url);
const read=path=>readFile(new URL(path,root),"utf8");
const asURL=text=>"data:text/javascript;base64,"+Buffer.from(text).toString("base64");
const auth=asURL(
 "export const adminJson=(data,status=200)=>Response.json(data,{status});"+
 "export const isAdminResponse=v=>v instanceof Response;"+
 "export const requireAdmin=async c=>c.request.headers.get('x-test-auth')==='founder'?"+
 "{email:'founder@example.com',serviceToken:false}:"+
 "new Response('Forbidden',{status:403});"
);
const intake=asURL("export const assessRepairIntake=()=>{throw Error('repair intake must not run');};");
const routes={};
for(const name of ["repair-jobs","repair-inbox"]){
 let source=stripTypeScriptTypes(await read("functions/api/admin/"+name+".ts"));
 source=source.replace(/"\.\.\/\.\.\/_lib\/admin-auth"/,JSON.stringify(auth));
 if(name==="repair-jobs"){
  source=source.replace(/"\.\.\/\.\.\/_lib\/repair-intake\.js"/,JSON.stringify(intake));
 }
 routes[name]=await import(asURL(source));
}
const protectedRequest=()=>({
 request:new Request("https://private.example/api/admin/repair-jobs",{
  method:"POST",headers:{"x-test-auth":"founder","content-type":"application/json",
    origin:"https://private.example"},
  body:JSON.stringify({permission_probe:true,confirm:true,request_text:"Fix the live site"})
 }),
 env:{
  get DB(){throw Error("monitor-only endpoint touched DB");},
  get ADMIN_AGENT_SERVICE(){throw Error("monitor-only endpoint called private worker");}
 }
});
test("repair dispatch and GitHub write probes always fail closed without touching any worker or DB",async()=>{
 for(const action of ["repair-jobs","repair-inbox"]){
  const response=await routes[action].onRequestPost(protectedRequest());
  assert.equal(response.status,405,action);
  const body=await response.json();
  assert.equal(body.error.code,"MONITOR_ONLY");
  assert.equal(body.monitoring_only,true);
  assert.equal(body.dispatch_performed,false);
  assert.equal(body.production_deployed,false);
 }
});
test("unauthenticated actors cannot invoke retired repair routes",async()=>{
 for(const action of ["repair-jobs","repair-inbox"]){
  const ctx=protectedRequest();
  ctx.request=new Request(ctx.request.url,{method:"POST",
    body:"{}",headers:{"x-test-auth":"unknown"}});
  const response=await routes[action].onRequestPost(ctx);
  assert.equal(response.status,403);
 }
});
test("Headquarters Home and specialist workspace never show AI repair or GitHub write controls",async()=>{
 const html=await read("admin/index.html");
 const home=html.slice(html.indexOf('id="view-headquarters"'),html.indexOf('id="view-yorpmind"'));
 const agents=html.slice(html.indexOf('id="view-agents"'),html.indexOf('id="view-activity"'));
 assert.match(home,/you investigate and make changes independently|You prepare, test, and publish changes/);
 assert.match(agents,/id="monitor-only-guidance"/);
 assert.doesNotMatch(agents,/id="repair-form"|id="repair-submit"|id="repair-request"|id="verify-github-permissions"|id="repair-github-create"/);
 assert.match(agents,/Fix guidance|Review monitored issues|monitoring/i);
 const js=await read("admin/admin.js");
 assert.doesNotMatch(js,/method:"POST",body:JSON\.stringify\(\{finding_id:/);
 assert.doesNotMatch(js,/permission_probe:true/);
 const inbox=await read("admin/shared-repair-inbox.js");
 assert.doesNotMatch(inbox,/method:\s*["']POST["']/);
 assert.match(inbox,/Copy issue evidence/);
});
test("Headquarters has no release UI or founder OTP release endpoint",async()=>{
 const html=await read("admin/index.html");
 for(const id of ["founder-open-preview","founder-open-release","release-launch-preview","release-go-live","view-releases"]){
  assert.doesNotMatch(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/id="view-investigations"/);
 const otp=await read("functions/api/admin/go-live-otp.ts");
 assert.match(otp,/MONITOR_ONLY/);
 assert.match(otp,/\}, 410\)/);
 assert.doesNotMatch(otp,/HQ_GO_LIVE_OTP_TEST_ENABLED|sendFounderMail|INSERT INTO/);
});

test("internal repair Worker and Durable Workflow also reject any attempt to write",async()=>{
 const worker=await read("admin-agent/worker.js");
 const fetchStart=worker.slice(worker.indexOf("export default {"),
  worker.indexOf('const url = new URL(request.url);',worker.indexOf("export default {")));
 assert.match(fetchStart,/request\.method !== "GET"/);
 assert.match(fetchStart,/MONITOR_ONLY/);
 assert.match(fetchStart,/status:405/);
 const start=worker.indexOf("export class AdminRepairWorkflow");
 const runStart=worker.slice(start,worker.indexOf("const payload = event.payload",start));
 assert.match(runStart,/throw new Error\("MONITOR_ONLY:/);
 assert.doesNotMatch(runStart,/this\.env\.AI\.run|github\(/);
});
