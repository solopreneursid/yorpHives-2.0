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
 assert.match(home,/you fix and publish|You make changes/);
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
test("release remains founder-only and OTP guarded; monitoring is not publishing",async()=>{
 const html=await read("admin/index.html");
 assert.match(html,/id="release-launch-preview"/);
 assert.match(html,/id="release-go-live"[^>]*disabled/);
 assert.match(html,/id="founder-open-preview"/);
 assert.match(html,/id="founder-open-release"/);
 const otp=await read("functions/api/admin/go-live-otp.ts");
 assert.match(otp,/FOUNDER_ONLY/);
 assert.match(otp,/HQ_GO_LIVE_OTP_TEST_ENABLED/);
});

test("retired internal worker contains no code-writing or repair operations", async () => {
 const worker=await read("admin-agent/worker.js");
 const config=await read("admin-agent/wrangler.jsonc");
 assert.match(worker,/request\.method !== "GET"/);
 assert.match(worker,/MONITOR_ONLY/);
 assert.match(worker,/status:405|}, 405/);
 assert.match(worker,/class AdminRepairWorkflow/);
 assert.match(worker,/throw new Error\("MONITOR_ONLY:/);
 assert.doesNotMatch(worker,/GITHUB_TOKEN[^\n]*write|method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
 assert.doesNotMatch(worker,/ADMIN_REPAIR_WORKFLOW\.create|github_issue_created:\s*true/);
 assert.doesNotMatch(worker,/github\/git\/(?:blobs|trees|refs)|create-isolated-agent-branch|open-draft-pull-request/);
 assert.doesNotMatch(config,/"ai"\s*:|"workflows"\s*:|"REPAIR_BASE_BRANCH"\s*:/);
});
