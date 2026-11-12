import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {DatabaseSync} from "node:sqlite";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const {collectMarketSources,storeMarketSources}=await import(
 "data:text/javascript;base64,"+Buffer.from(await read("../hq-intelligence/market-sources.js")).toString("base64")
);
function fakeProvider(url,request){
 assert.equal(request.method,"GET");
 assert.equal(request.redirect,"manual");
 assert.ok(!request.headers.authorization);
 const parsed=new URL(url);
 if(parsed.hostname==="api.wordpress.org"){
  assert.equal(parsed.searchParams.get("action"),"query_plugins");
  assert.equal(parsed.searchParams.get("request[per_page]"),"5");
  const term=parsed.searchParams.get("request[search]");
  const slug=term.replace(/[^a-z0-9]+/g,"-")+"-tool";
  return Response.json({plugins:[{
   slug,name:term+" software",short_description:"<b>Existing plugin</b> to solve a task",
   active_installs:100000,last_updated:"2026-11-05T00:00:00Z"
  }]});
 }
 if(parsed.hostname==="api.stackexchange.com"){
  assert.equal(parsed.pathname,"/2.3/questions");
  const site=parsed.searchParams.get("site");
  return Response.json({items:[{
   question_id:1588,title:"How can I compare products safely?",
   creation_date:1794400000,score:4,tags:["comparison","tools"],link:"https://example.invalid/fake"
  }]});
 }
 throw Error("Unexpected host");
}
function setup(){
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec("PRAGMA foreign_keys=ON;CREATE TABLE hq_intelligence_runs(run_id TEXT PRIMARY KEY);");
 return sqlite;
}
function dbAdapter(sqlite){
 return {prepare(sql){
  let args=[];
  const stmt={
   bind(...x){args=x;return stmt;},
   async first(){return sqlite.prepare(sql).get(...args)||null;},
   async all(){return {results:sqlite.prepare(sql).all(...args)};},
   async run(){const result=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};}
  };
  return stmt;
 }};
}
test("rotating official sources are bounded, sanitized, and independently attributable",async()=>{
 const seen=[];
 const now=new Date("2026-11-12T09:00:00Z");
 const result=await collectMarketSources(now,async(url,request)=>{
  seen.push(url);
  return fakeProvider(url,request);
 });
 assert.equal(seen.length,5);
 assert.equal(result.warnings.length,0);
 assert.equal(result.signals.length,5);
 const plugins=result.signals.filter(x=>x.provider==="wordpress_plugins");
 const questions=result.signals.filter(x=>x.provider==="stackexchange_questions");
 assert.equal(plugins.length,3);
 assert.equal(questions.length,2);
 assert.ok(plugins.every(x=>x.source_url.startsWith("https://wordpress.org/plugins/")));
 assert.ok(questions.every(x=>x.source_url.startsWith("https://")));
 assert.ok(result.signals.every(x=>!x.excerpt.includes("<b>")));
 assert.ok(plugins.every(x=>x.public_metric_label==="active_install_band"&&x.is_exact_metric===0));
 assert.ok(questions.every(x=>x.public_metric_label==="question_score"&&x.is_exact_metric===0));
 assert.ok(questions.every(x=>!x.source_url.includes("example.invalid")),"never trust third-party redirects");
});
test("market sources are deduplicated across runs and preserve source metrics as proxies",async()=>{
 const sqlite=setup();
 try{
  sqlite.exec(await read("../migrations/0019_headquarters_public_market_sources.sql"));
  const DB=dbAdapter(sqlite);
  const one=crypto.randomUUID(),two=crypto.randomUUID();
  sqlite.prepare("INSERT INTO hq_intelligence_runs(run_id) VALUES (?)").run(one);
  sqlite.prepare("INSERT INTO hq_intelligence_runs(run_id) VALUES (?)").run(two);
  const collected=await collectMarketSources(new Date("2026-11-12T09:00:00Z"),fakeProvider);
  const first=await storeMarketSources(DB,one,collected);
  assert.equal(first.observed_count,5);
  assert.equal(first.inserted_count,5);
  const second=await storeMarketSources(DB,two,collected);
  assert.equal(second.inserted_count,0);
  const repeated=await storeMarketSources(DB,one,collected);
  assert.equal(repeated.inserted_count,0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM hq_public_market_signals").get().n,5);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM hq_public_market_runs").get().n,2);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM hq_public_market_signals WHERE is_exact_metric=0").get().n,5);
  assert.equal(sqlite.prepare("SELECT public_metric_value FROM hq_public_market_signals WHERE provider='wordpress_plugins' LIMIT 1").get().public_metric_value,100000);
 }finally{sqlite.close();}
});
test("a provider error is an explicit warning, never invented market activity",async()=>{
 let requests=0;
 const result=await collectMarketSources(new Date("2026-11-12T09:00:00Z"),async(url,req)=>{
  requests++;
  if(url.includes("wordpress.org"))return new Response("Unavailable",{status:503});
  return fakeProvider(url,req);
 });
 assert.equal(requests,5);
 assert.equal(result.warnings.length,3);
 assert.equal(result.signals.length,2);
 assert.ok(result.signals.every(x=>x.provider==="stackexchange_questions"));
 assert.equal(result.requests,5);
});
