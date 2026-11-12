import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {stripTypeScriptTypes} from "node:module";
import {DatabaseSync} from "node:sqlite";

const file=path=>readFile(new URL(path,import.meta.url),"utf8");
const toModule=source=>"data:text/javascript;base64,"+
 Buffer.from(stripTypeScriptTypes(source)).toString("base64");
const activityURL=toModule(await file("../functions/_lib/tool-activity.js"));
const {recordActivity,CHANNELS}=await import(activityURL);
const browserURL=toModule((await file("../functions/api/v1/tool-activity.ts"))
 .replace('"../../_lib/tool-activity.js"',JSON.stringify(activityURL)));
const {onRequestPost:reportBrowser}=await import(browserURL);
const adminAuthURL=toModule(await file("../functions/_lib/admin-auth.ts"));
const agentURL=toModule((await file("../functions/api/v1/agent-tools.ts"))
 .replace('"../../_lib/admin-auth"',JSON.stringify(adminAuthURL))
 .replace('"../../_lib/tool-activity.js"',JSON.stringify(activityURL)));
const {onRequestGet:discoverTools,onRequestPost:executeAgent}=await import(agentURL);
const dashboardURL=toModule((await file("../functions/api/admin/tool-activity.ts"))
 .replace('"../../_lib/admin-auth"',JSON.stringify(adminAuthURL)));
const {onRequestGet:readActivity}=await import(dashboardURL);
const key=await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,
 publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
const jwk=await crypto.subtle.exportKey("jwk",key.publicKey);
jwk.kid="activity-test";
const encode=v=>Buffer.from(JSON.stringify(v)).toString("base64url");
async function signed(extra={}){
 const h=encode({alg:"RS256",kid:"activity-test"});
 const p=encode({iss:"https://hq-test.cloudflareaccess.com",aud:["hq-test"],
  exp:Math.floor(Date.now()/1000)+600,email:"owner@example.com",...extra});
 const proof=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key.privateKey,new TextEncoder().encode(h+"."+p));
 return h+"."+p+"."+Buffer.from(proof).toString("base64url");
}
const owner=await signed();
const service=await signed({email:undefined,sub:"",service_token_status:true,service_token_id:"scoped-agent-test"});
const ci=await signed({email:undefined,sub:"",service_token_status:true,service_token_id:"ci-readonly"});
const originalFetch=globalThis.fetch;
function setup(){
 const db=new DatabaseSync(":memory:");
 db.exec("PRAGMA foreign_keys=ON;");
 return db;
}
function adapt(db){
 return {prepare(sql){
  let args=[];
  const stmt={bind(...a){args=a;return stmt;},
   async first(){return db.prepare(sql).get(...args)||null;},
   async all(){return {results:db.prepare(sql).all(...args),success:true};},
   async run(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}};}
  };
  return stmt;
 }};
}
const config=DB=>({
 DB,CF_ACCESS_TEAM_DOMAIN:"hq-test.cloudflareaccess.com",CF_ACCESS_AUD:"hq-test",
 ADMIN_ALLOWED_EMAILS:"owner@example.com",ADMIN_CI_SERVICE_TOKEN_IDS:"ci-readonly",
 HQ_TOOL_SERVICE_TOKEN_IDS:"scoped-agent-test"
});
function ctx(env,route,method="GET",body,headers={}){
 return {env,request:new Request("https://hq.example.com"+route,{
  method,headers:{"content-type":"application/json",...headers},
  body:body===undefined?undefined:JSON.stringify(body)
 })};
}
test("privacy-limited registry counts successful actions with separated channels and daily caps",async()=>{
 const db=setup();
 try{
  db.exec(await file("../migrations/0020_headquarters_tool_activity.sql"));
  const DB=adapt(db);
  assert.equal((await recordActivity(DB,"unknown-new-product",CHANNELS.BROWSER)).accepted,false);
  assert.equal((await recordActivity(DB,"word-counter",CHANNELS.AGENT)).accepted,false);
  assert.equal((await recordActivity(DB,"word-counter",CHANNELS.BROWSER)).accepted,true);
  assert.equal((await recordActivity(DB,"word-counter",CHANNELS.BROWSER)).accepted,true);
  assert.equal((await recordActivity(DB,"sha256-text",CHANNELS.AGENT)).accepted,true);
  const rows=db.prepare("SELECT slug,channel,success_count FROM hq_tool_activity_daily ORDER BY slug").all();
  assert.deepEqual(rows.map(r=>[r.slug,r.channel,r.success_count]),
   [["sha256-text","access_authenticated_agent_execution",1],
    ["word-counter","browser_client_reported",2]]);
  db.prepare("UPDATE hq_tool_activity_daily SET success_count=1000 WHERE slug='word-counter'").run();
  const limit=await recordActivity(DB,"word-counter",CHANNELS.BROWSER);
  assert.equal(limit.accepted,false);
  assert.equal(limit.reason,"daily_budget_exhausted");
  assert.equal(db.prepare("SELECT success_count FROM hq_tool_activity_daily WHERE slug='word-counter'").get().success_count,1000);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM hq_tool_activity_daily").get().n,2);
 }finally{db.close();}
});
test("browser reports never contain tool inputs, reject cross-origin and unknown tools",async()=>{
 const db=setup();
 try{
  db.exec(await file("../migrations/0020_headquarters_tool_activity.sql"));
  const env=config(adapt(db)),route="/api/v1/tool-activity";
  assert.equal((await reportBrowser(ctx(env,route,"POST",{slug:"json-formatter",event:"completed"}))).status,403);
  assert.equal((await reportBrowser(ctx(env,route,"POST",{slug:"json-formatter",event:"completed"},
    {origin:"https://elsewhere.example"}))).status,403);
  assert.equal((await reportBrowser(ctx(env,route,"POST",{slug:"json-formatter",event:"completed"},
    {origin:"https://hq.example.com","sec-fetch-site":"cross-site"}))).status,403);
  assert.equal((await reportBrowser(ctx(env,route,"POST",{slug:"json-formatter",event:"started"},
    {origin:"https://hq.example.com"}))).status,400);
  assert.equal((await reportBrowser(ctx(env,route,"POST",{slug:"json-formatter",event:"completed",input:"private secret"},
    {origin:"https://hq.example.com"}))).status,400);
  const good=await reportBrowser(ctx(env,route,"POST",{slug:"json-formatter",event:"completed"},
    {origin:"https://hq.example.com","sec-fetch-site":"same-origin"}));
  assert.equal(good.status,202);
  assert.deepEqual(await good.json(),{
   accepted:true,metric:"browser_client_reported",verified_server_execution:false
  });
  const notInstrumented=await reportBrowser(ctx(env,route,"POST",{slug:"new-field-app",event:"completed"},
    {origin:"https://hq.example.com"}));
  assert.equal((await notInstrumented.json()).accepted,false);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM hq_tool_activity_daily").get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM hq_tool_activity_registry WHERE enabled=1").get().n,10);
 }finally{db.close();}
});
test("agent tool execution requires a separately allowlisted signed Access service token",async()=>{
 const db=setup();
 globalThis.fetch=async url=>{
  if(String(url).includes("/cdn-cgi/access/certs"))return Response.json({keys:[jwk]});
  throw Error("Unexpected external URL");
 };
 try{
  db.exec(await file("../migrations/0020_headquarters_tool_activity.sql"));
  const env=config(adapt(db)),route="/api/v1/agent-tools";
  const introspection=await discoverTools(ctx(env,route,"GET",undefined,{accept:"text/markdown"}));
  assert.equal(introspection.status,200);
  assert.match(await introspection.text(),/private agent tool prototype/);
  const disabled=await executeAgent(ctx({...env,HQ_TOOL_SERVICE_TOKEN_IDS:""},route,"POST",
   {tool:"sha256-text",input:"hello"},{"cf-access-jwt-assertion":service}));
  assert.equal(disabled.status,503);
  const overlap=await executeAgent(ctx({...env,HQ_TOOL_SERVICE_TOKEN_IDS:"ci-readonly"},route,"POST",
   {tool:"sha256-text",input:"hello"},{"cf-access-jwt-assertion":ci}));
  assert.equal(overlap.status,503,"a misconfigured CI token must never gain execution rights");
  assert.equal((await executeAgent(ctx(env,route,"POST",
   {tool:"sha256-text",input:"hello"},{"cf-access-jwt-assertion":ci}))).status,401);
  assert.equal((await executeAgent(ctx(env,route,"POST",
   {tool:"sha256-text",input:"hello"},{"cf-access-jwt-assertion":owner}))).status,401);
  const hash=await executeAgent(ctx(env,route,"POST",{tool:"sha256-text",input:"hello"},
   {"cf-access-jwt-assertion":service}));
  assert.equal(hash.status,200);
  const data=await hash.json();
  assert.equal(data.output,"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  assert.equal(data.metric_recorded,true);
  const compact=await executeAgent(ctx(env,route,"POST",{tool:"json-compact",input:'{"x": 1}'},
   {"cf-access-jwt-assertion":service,accept:"text/markdown"}));
  assert.equal(compact.status,200);
  assert.match(await compact.text(),/"x":1/);
  assert.equal((await executeAgent(ctx(env,route,"POST",{tool:"json-compact",input:"invalid"},
   {"cf-access-jwt-assertion":service}))).status,422);
  assert.equal((await executeAgent(ctx(env,route,"POST",{tool:"sha256-text",input:"x".repeat(8200)},
   {"cf-access-jwt-assertion":service}))).status,400);
  const rows=db.prepare("SELECT slug,success_count FROM hq_tool_activity_daily ORDER BY slug").all();
  assert.deepEqual(rows.map(x=>[x.slug,x.success_count]),
   [["json-compact",1],["sha256-text",1]]);
  const admin=await readActivity(ctx(env,"/api/admin/tool-activity","GET",undefined,
   {"cf-access-jwt-assertion":owner}));
  assert.equal(admin.status,200);
  const activity=await admin.json();
  assert.equal(activity.totals.access_authenticated_agent_execution,2);
  assert.equal(activity.totals.browser_client_reported,0);
  assert.equal(activity.registered_agent_tools,2);
  assert.match(activity.provenance.agent,/Server-executed/);
  assert.equal((await readActivity(ctx(env,"/api/admin/tool-activity","GET",undefined,
   {"cf-access-jwt-assertion":""}))).status,401);
  const md=await readActivity(ctx(env,"/api/admin/tool-activity","GET",undefined,
   {"cf-access-jwt-assertion":owner,accept:"text/markdown"}));
  assert.match(await md.text(),/Agent.*2|agent tools: 2/i);
 }finally{globalThis.fetch=originalFetch;db.close();}
});

test("client reporter respects GPC, DNT, webdriver and per-tab budget without user content",async()=>{
 const reporterURL=toModule(await file("../free-tools/usage-telemetry.js"));
 const {reportToolSuccess}=await import(reporterURL);
 const prev={
  navigator:Object.getOwnPropertyDescriptor(globalThis,"navigator"),
  location:Object.getOwnPropertyDescriptor(globalThis,"location"),
  sessionStorage:Object.getOwnPropertyDescriptor(globalThis,"sessionStorage"),
  fetch:Object.getOwnPropertyDescriptor(globalThis,"fetch")
 };
 const settings={globalPrivacyControl:false,doNotTrack:"0",webdriver:true};
 const store=new Map(),events=[];
 const set=(name,value)=>Object.defineProperty(globalThis,name,{
  configurable:true,writable:true,value});
 set("navigator",settings);
 set("location",{protocol:"https:",hostname:"hq.example.com"});
 set("sessionStorage",{
  getItem:key=>store.get(key)||null,
  setItem:(key,value)=>store.set(key,value)
 });
 set("fetch",(url,options)=>{
  events.push({url,options});
  return Promise.resolve(Response.json({accepted:true}));
 });
 try{
  reportToolSuccess("json-formatter");
  assert.equal(events.length,0,"automation must not increment usage");
  settings.webdriver=false;settings.globalPrivacyControl=true;
  reportToolSuccess("json-formatter");assert.equal(events.length,0);
  settings.globalPrivacyControl=false;settings.doNotTrack="1";
  reportToolSuccess("json-formatter");assert.equal(events.length,0);
  settings.doNotTrack="0";
  reportToolSuccess("not-on-the-list");assert.equal(events.length,0);
  for(let i=0;i<4;i++)reportToolSuccess("json-formatter");
  assert.equal(events.length,3,"per-tab event budget");
  assert.equal(events[0].url,"/api/v1/tool-activity");
  const {slug,event}=JSON.parse(events[0].options.body);
  assert.deepEqual({slug,event},{slug:"json-formatter",event:"completed"});
  assert.equal(events[0].options.credentials,"omit");
  assert.equal(events[0].options.mode,"same-origin");
  assert.equal(events[0].options.keepalive,true);
  assert.equal(Object.keys(JSON.parse(events[0].options.body)).length,2);
 }finally{
  for(const [name,descriptor] of Object.entries(prev)){
   if(descriptor)Object.defineProperty(globalThis,name,descriptor);
   else delete globalThis[name];
  }
 }
});
