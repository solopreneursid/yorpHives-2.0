import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {stripTypeScriptTypes} from "node:module";
import {DatabaseSync} from "node:sqlite";

const source=path=>readFile(new URL(path,import.meta.url),"utf8");
const toURL=content=>"data:text/javascript;base64,"+Buffer.from(stripTypeScriptTypes(content)).toString("base64");
const libURL=toURL(await source("../functions/_lib/traffic-evidence.js"));
const {normalizeTrafficPayload,normalizedToolSlug,queryToolTraffic,saveTrafficCapture}=await import(libURL);
const authURL=toURL(await source("../functions/_lib/admin-auth.ts"));
const hqURL=toURL((await source("../functions/_lib/headquarters.ts")).replace('"./admin-auth"',JSON.stringify(authURL)));
const routeURL=toURL((await source("../functions/api/admin/traffic-evidence.ts"))
  .replace('"../../_lib/admin-auth"',JSON.stringify(authURL))
  .replace('"../../_lib/headquarters"',JSON.stringify(hqURL))
  .replace('"../../_lib/traffic-evidence.js"',JSON.stringify(libURL)));
const {onRequestGet,onRequestPost}=await import(routeURL);
const keys=await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",
 modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
const publicJwk=await crypto.subtle.exportKey("jwk",keys.publicKey);
publicJwk.kid="traffic-test";
const encode=value=>Buffer.from(JSON.stringify(value)).toString("base64url");
async function sign(extra={}){
 const h=encode({alg:"RS256",kid:"traffic-test"});
 const p=encode({iss:"https://hq-test.cloudflareaccess.com",aud:["hq-test"],
   exp:Math.floor(Date.now()/1000)+300,email:"owner@example.com",...extra});
 const bytes=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",keys.privateKey,new TextEncoder().encode(h+"."+p));
 return h+"."+p+"."+Buffer.from(bytes).toString("base64url");
}
const token=await sign();
const originalFetch=globalThis.fetch;
const groupedRows=[
 {dimensions:{clientRequestPath:"/free-tools/word-counter/",clientRequestHTTPHost:"yorphives.com"},count:142},
 {dimensions:{clientRequestPath:"/free-tools/word-counter",clientRequestHTTPHost:"www.yorphives.com"},count:8},
 {dimensions:{clientRequestPath:"/free-tools/json-formatter/",clientRequestHTTPHost:"yorphives.com"},count:64},
 {dimensions:{clientRequestPath:"/free-tools/other.js",clientRequestHTTPHost:"yorphives.com"},count:412},
 {dimensions:{clientRequestPath:"/free-tools/word-counter/",clientRequestHTTPHost:"staging.yorphives.com"},count:999},
 {dimensions:{clientRequestPath:"/free-tools/password-generator/?session=123",clientRequestHTTPHost:"yorphives.com"},count:999},
 {dimensions:{clientRequestPath:"/free-tools/",clientRequestHTTPHost:"yorphives.com"},count:200}
];
const apiResult={data:{viewer:{zones:[{httpRequestsAdaptiveGroups:groupedRows}]}}};
function testDB(){
 const sqlite=new DatabaseSync(":memory:");
 const DB={
  prepare(sql){
   let args=[];
   const query={
    bind(...items){args=items;return query;},
    async first(){return sqlite.prepare(sql).get(...args)||null;},
    async all(){return {success:true,results:sqlite.prepare(sql).all(...args)};},
    async run(){const response=sqlite.prepare(sql).run(...args);
      return {success:true,meta:{changes:Number(response.changes)}};}
   };
   return query;
  },
  async batch(queries){
   sqlite.exec("BEGIN");
   try{
    const values=[];
    for(const query of queries)values.push(await query.run());
    sqlite.exec("COMMIT");return values;
   }catch(error){sqlite.exec("ROLLBACK");throw error;}
  }
 };
 return {sqlite,DB};
}
function ctx(env,method="GET",body,headers={}){
 return {env,request:new Request("https://hq.example.com/api/admin/traffic-evidence",{
  method,headers:{"cf-access-jwt-assertion":token,"origin":"https://hq.example.com",
   "content-type":"application/json",...headers},
  body:body===undefined?undefined:JSON.stringify(body)
 })};
}
const env=DB=>({DB,CF_ACCESS_TEAM_DOMAIN:"hq-test.cloudflareaccess.com",
 CF_ACCESS_AUD:"hq-test",ADMIN_ALLOWED_EMAILS:"owner@example.com",
 ADMIN_CI_SERVICE_TOKEN_IDS:"traffic-test-ci",
 CF_ANALYTICS_API_TOKEN:"owner-analytics-token",CF_ANALYTICS_ZONE_ID:"1ce6b0c59175928a8687797c3cdbff2f"
});

test("Traffic normalization excludes assets, previews and identifiers and merges canonical paths",()=>{
 assert.equal(normalizedToolSlug("/free-tools/word-counter/"),"word-counter");
 assert.equal(normalizedToolSlug("/free-tools/word-counter"),"word-counter");
 assert.equal(normalizedToolSlug("/free-tools/"),null);
 assert.equal(normalizedToolSlug("/free-tools/word-counter/?token=secret"),null);
 assert.equal(normalizedToolSlug("/free-tools/app.js"),null);
 const actual=normalizeTrafficPayload(apiResult);
 assert.equal(actual.tools.length,2);
 assert.equal(actual.accepted_groups,3);
 assert.equal(actual.request_count,214);
 assert.deepEqual(actual.tools.map(x=>({slug:x.slug,count:x.grouped_requests})),
  [{slug:"word-counter",count:150},{slug:"json-formatter",count:64}]);
 assert.throws(()=>normalizeTrafficPayload({errors:[{message:"Invalid Analytics zone"}]}),/Invalid Analytics zone/);
 assert.throws(()=>normalizeTrafficPayload({data:{viewer:{zones:[]}}}),/not accessible/);
 assert.throws(()=>normalizeTrafficPayload({}),/not accessible/);
});
test("One bounded analytics query uses a seven-day window and never requests identities",async()=>{
 let calls=0;
 const started=new Date("2026-11-12T09:30:00Z");
 const response=await queryToolTraffic("owner-analytics-token","1ce6b0c59175928a8687797c3cdbff2f",started,async(url,request)=>{
  calls++;
  assert.equal(url,"https://api.cloudflare.com/client/v4/graphql");
  assert.equal(request.method,"POST");
  assert.equal(request.redirect,"manual");
  const body=JSON.parse(request.body);
  assert.match(body.query,/requestSource:\s*"eyeball"/);
  assert.match(body.query,/\$zoneTag: string!/);
  assert.doesNotMatch(body.query,/\$zoneTag: String!/);
  assert.match(body.query,/orderBy:\s*\[count_DESC\]/);
  assert.match(body.query,/clientRequestPath_like:/);
  assert.doesNotMatch(body.query,/clientIP|cookie|userAgent|clientAsn/);
  assert.equal(body.variables.end,"2026-11-12T09:30:00.000Z");
  assert.equal(body.variables.start,"2026-11-05T09:30:00.000Z");
  return Response.json(apiResult);
 });
 assert.equal(calls,1);
 assert.equal(response.capture_day,"2026-11-12");
 assert.equal(response.request_count,214);
 assert.equal(response.top_n_limited,false);
 await assert.rejects(queryToolTraffic("","bad",started,()=>Response.json({})),/not configured/);
});
test("D1 capture persists atomically and rejects same-day duplicates without partial records",async()=>{
 const {sqlite,DB}=testDB();
 try{
  sqlite.exec(await source("../migrations/0018_headquarters_traffic_evidence.sql"));
  const observation={...normalizeTrafficPayload(apiResult),capture_day:"2026-11-12",
   start:"2026-11-05T00:00:00.000Z",end:"2026-11-12T00:00:00.000Z"};
  const saved=await saveTrafficCapture(DB,observation,"owner@example.com");
  assert.equal(saved.created,true);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM hq_traffic_captures").get().n,1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM hq_traffic_tool_paths").get().n,2);
  assert.equal(sqlite.prepare("SELECT grouped_requests FROM hq_traffic_captures").get().grouped_requests,214);
  await assert.rejects(saveTrafficCapture(DB,observation,"owner@example.com"),/UNIQUE/);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM hq_traffic_captures").get().n,1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM hq_traffic_tool_paths").get().n,2);
  const bad={...observation,capture_day:"2026-11-13",
   tools:[...observation.tools,{slug:"invalid'bad",path:"/free-tools/invalid'bad/",grouped_requests:1}]};
  await assert.rejects(saveTrafficCapture(DB,bad,"owner@example.com"),/CHECK/);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM hq_traffic_captures").get().n,1);
 }finally{sqlite.close();}
});
test("Protected API is read-only to CI, version-limits captures, and negotiates Markdown",async()=>{
 const {sqlite,DB}=testDB();
 globalThis.fetch=async(url,options)=>{
  const source=String(url);
  if(source.includes("/cdn-cgi/access/certs"))return Response.json({keys:[publicJwk]});
  if(source.includes("/client/v4/graphql"))return Response.json(apiResult);
  throw Error("Unexpected external request: "+source);
 };
 try{
  sqlite.exec(await source("../migrations/0018_headquarters_traffic_evidence.sql"));
  const setup=env(DB);
  assert.equal((await onRequestGet(ctx(setup,"GET",undefined,{"cf-access-jwt-assertion":""}))).status,401);
  const ci=await sign({email:undefined,sub:"",common_name:"traffic-test-ci",service_token_status:true});
  assert.equal((await onRequestPost(ctx(setup,"POST",{action:"capture"},{"cf-access-jwt-assertion":ci}))).status,403);
  assert.equal((await onRequestPost(ctx(setup,"POST",{action:"capture"},{origin:"https://outsider.example"}))).status,403);
  assert.equal((await onRequestPost(ctx(setup,"POST",{action:"delete"}))).status,400);
  const empty=await (await onRequestGet(ctx(setup))).json();
  assert.equal(empty.configured,true);
  assert.equal(empty.latest,null);
  const captured=await onRequestPost(ctx(setup,"POST",{action:"capture"}));
  assert.equal(captured.status,201);
  assert.equal((await captured.json()).grouped_requests,214);
  assert.equal((await onRequestPost(ctx(setup,"POST",{action:"capture"}))).status,409);
  const snapshot=await (await onRequestGet(ctx(setup))).json();
  assert.equal(snapshot.latest.tool_paths,2);
  assert.equal(snapshot.tools.length,2);
  assert.match(snapshot.provenance,/not unique users/);
  const markdown=await onRequestGet(ctx(setup,"GET",undefined,{accept:"text/markdown"}));
  assert.match(markdown.headers.get("content-type"),/text\/markdown/);
  assert.match(await markdown.text(),/grouped HTTP requests/i);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM hq_traffic_captures").get().n,1);
 }finally{globalThis.fetch=originalFetch;sqlite.close();}
});
