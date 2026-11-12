import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { DatabaseSync } from "node:sqlite";

const source = path => readFile(new URL(path, import.meta.url), "utf8");
const urlFor = text => "data:text/javascript;base64," + Buffer.from(stripTypeScriptTypes(text)).toString("base64");
const authURL = urlFor(await source("../functions/_lib/admin-auth.ts"));
const headquartersURL = urlFor((await source("../functions/_lib/headquarters.ts")).replace('"./admin-auth"', JSON.stringify(authURL)));
const radarURL = urlFor(await source("../functions/_lib/opportunity-radar.ts"));
const apiURL = urlFor((await source("../functions/api/admin/radar.ts"))
  .replace('"../../_lib/admin-auth"',JSON.stringify(authURL))
  .replace('"../../_lib/headquarters"',JSON.stringify(headquartersURL))
  .replace('"../../_lib/opportunity-radar"',JSON.stringify(radarURL)));
const { onRequestGet, onRequestPost } = await import(apiURL);
const { syncRadarFromObservations, radarSnapshot, classifyFinding } = await import(radarURL);

const key = await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,
  publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
const jwk = await crypto.subtle.exportKey("jwk",key.publicKey);
jwk.kid = "radar-test";
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
async function token(extra={}) {
  const a=encode({alg:"RS256",kid:"radar-test"});
  const b=encode({iss:"https://hq-test.cloudflareaccess.com",aud:["hq-test"],
    exp:Math.floor(Date.now()/1000)+300,email:"owner@example.com",...extra});
  const signed=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key.privateKey,new TextEncoder().encode(a+"."+b));
  return a+"."+b+"."+Buffer.from(signed).toString("base64url");
}
const ownerJwt=await token();
const originalFetch=globalThis.fetch;
async function setup() {
  const database=new DatabaseSync(":memory:");
  for(const path of ["../migrations/0004_admin_reliability.sql","../migrations/0007_admin_asset_intelligence.sql",
    "../migrations/0010_agentic_os_foundation.sql","../migrations/0011_headquarters_audit.sql",
    "../migrations/0012_headquarters_execution.sql","../migrations/0013_headquarters_brief_review.sql",
    "../migrations/0014_headquarters_opportunity_radar.sql"]) database.exec(await source(path));
  const adapter={
    prepare(sql) {
      let args=[];
      const statement={
        bind(...items){args=items;return statement;},
        async first(){return database.prepare(sql).get(...args)||null;},
        async all(){return {results:database.prepare(sql).all(...args),success:true};},
        async run(){const r=database.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}};}
      };
      return statement;
    },
    async batch(statements) {
      database.exec("BEGIN");
      try{const results=[];for(const query of statements)results.push(await query.run());database.exec("COMMIT");return results;}
      catch(error){database.exec("ROLLBACK");throw error;}
    }
  };
  return {database,adapter};
}
function seed(db) {
  const now="2026-11-12T05:20:00.000Z",before="2026-11-11T05:20:00.000Z";
  db.prepare("INSERT INTO admin_findings(id,fingerprint,monitor_id,severity,title,details,status,first_detected,last_verified) VALUES (?,?,?,?,?,?,?,?,?)")
    .run("finding-1","unit-test-1","prod-home","critical","Homepage unavailable","Recorded production availability issue","open",before,now);
  db.prepare("INSERT INTO admin_assets(id,asset_key,asset_type,title,url,source,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run("asset-1","unit-sitemap","discovery","Agent discovery","https://yorphives.com/llms.txt","test",now);
  db.prepare("INSERT INTO admin_asset_findings(id,asset_id,finding_key,severity,category,title,details,recommendation,status,first_detected,last_verified) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run("asset-finding-1","asset-1","unit-seo","high","seo","Missing canonical metadata","Crawler observed a missing canonical.","Recheck machine-readable canonical metadata.","open",before,now);
}
function env(adapter){return {DB:adapter,CF_ACCESS_TEAM_DOMAIN:"hq-test.cloudflareaccess.com",
  CF_ACCESS_AUD:"hq-test",ADMIN_ALLOWED_EMAILS:"owner@example.com",
  ADMIN_CI_SERVICE_TOKEN_IDS:"radar-ci"};}
function ctx(environment,method="GET",body,headers={}) {
  return {env:environment,request:new Request("https://hq.example.com/api/admin/radar",{
    method,headers:{"cf-access-jwt-assertion":ownerJwt,origin:"https://hq.example.com",
      "content-type":"application/json",...headers},
    body:body===undefined?undefined:JSON.stringify(body)
  })};
}
test("classification uses evidence, not invented demand",()=>{
  const observation={id:"x",title:"Sitemap indexability failure",details:"Canonical missing",
    severity:"high",source_status:"open",first_observed:"2026",last_observed:"2026",source_url:null};
  assert.equal(classifyFinding("asset_finding",observation).category,"discoverability");
  assert.equal(classifyFinding("monitor_finding",{...observation,title:"Security certificate expired",details:"TLS"}).category,"security");
  assert.equal(classifyFinding("monitor_finding",{...observation,title:"HTTP 502",details:"Timeout"}).category,"reliability");
});
test("ingestion deduplicates, preserves provenance and follows source resolution",async()=>{
  const {database,adapter}=await setup();
  try{
    seed(database);
    const first=await syncRadarFromObservations(adapter,"scheduled");
    assert.equal(first.observed_count,2);
    assert.equal(first.inserted_count,2);
    assert.equal(first.inference_requests,0);
    assert.equal((await syncRadarFromObservations(adapter,"owner")).inserted_count,0);
    const snapshot=await radarSnapshot(adapter);
    assert.equal(snapshot.signals.length,2);
    assert.equal(snapshot.counts.active,2);
    const item=snapshot.signals.find(x=>x.signal_id==="asset:asset-finding-1");
    assert.equal(item.suggested_agent_id,"growth-operator");
    assert.equal(item.source_url,"https://yorphives.com/llms.txt");
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM hq_signal_events WHERE event_type='signal_observed'").get().n,2);
    database.prepare("UPDATE admin_asset_findings SET status='fixed',last_verified='2026-11-12T07:00:00.000Z' WHERE id='asset-finding-1'").run();
    await syncRadarFromObservations(adapter,"scheduled");
    const updated=await radarSnapshot(adapter);
    assert.equal(updated.counts.active,1);
    assert.equal(updated.counts.resolved_source,1);
  } finally {database.close();}
});
test("authenticated owner can triage and promote once, but cannot approve a release",async()=>{
  const {database,adapter}=await setup();
  globalThis.fetch=async url=>{assert.equal(url,"https://hq-test.cloudflareaccess.com/cdn-cgi/access/certs");return Response.json({keys:[jwk]});};
  try {
    seed(database);
    const e=env(adapter);
    assert.equal((await onRequestGet(ctx(e,"GET",undefined,{"cf-access-jwt-assertion":""}))).status,401);
    const ci=await token({email:undefined,sub:"",common_name:"radar-ci",service_token_status:true});
    assert.equal((await onRequestPost(ctx(e,"POST",{action:"sync"},{"cf-access-jwt-assertion":ci}))).status,403);
    assert.equal((await onRequestPost(ctx(e,"POST",{action:"sync"},{origin:"https://evil.example"}))).status,403);
    assert.equal((await onRequestPost(ctx(e,"POST",{action:"create_mission"}))).status,400);
    const scanned=await onRequestPost(ctx(e,"POST",{action:"sync"}));
    assert.equal(scanned.status,200);
    assert.equal((await scanned.json()).inference_requests,0);
    const snapshot=await (await onRequestGet(ctx(e))).json();
    assert.equal(snapshot.counts.active,2);
    const md=await onRequestGet(ctx(e,"GET",undefined,{accept:"text/markdown"}));
    assert.match(md.headers.get("content-type"),/text\/markdown/);
    assert.match(await md.text(),/First-party monitoring observations only/);
    const signal=snapshot.signals.find(x=>x.signal_id==="asset:asset-finding-1");
    const action={action:"create_mission",signal_id:signal.signal_id,expected_updated_at:signal.updated_at};
    assert.equal((await onRequestPost(ctx(e,"POST",{...action,expected_updated_at:"stale"}))).status,409);
    const created=await onRequestPost(ctx(e,"POST",action));
    assert.equal(created.status,201);
    const receipt=await created.json();
    const linked=database.prepare("SELECT status,created_by,origin_type,origin_ref,agent_id,priority,evidence_json FROM agent_jobs WHERE job_id=?").get(receipt.job_id);
    assert.equal(linked.status,"planned");
    assert.equal(linked.created_by,"owner@example.com");
    assert.equal(linked.origin_type,"opportunity_signal");
    assert.equal(linked.origin_ref,signal.signal_id);
    assert.equal(linked.agent_id,"growth-operator");
    assert.equal(linked.priority,"high");
    assert.equal(JSON.parse(linked.evidence_json)[0].verified,0);
    assert.equal(database.prepare("SELECT linked_job_id FROM hq_opportunity_signals WHERE signal_id=?").get(signal.signal_id).linked_job_id,receipt.job_id);
    assert.equal((await onRequestPost(ctx(e,"POST",action))).status,409);
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM agent_jobs WHERE origin_ref=?").get(signal.signal_id).n,1);
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM agent_approvals").get().n,0);
    assert.ok(database.prepare("SELECT 1 FROM hq_signal_events WHERE signal_id=? AND event_type='signal_promoted'").get(signal.signal_id));
    const other=snapshot.signals.find(x=>x.signal_id==="monitor:finding-1");
    assert.equal((await onRequestPost(ctx(e,"POST",{action:"investigate",signal_id:other.signal_id,expected_updated_at:other.updated_at}))).status,200);
    const investigating=database.prepare("SELECT updated_at,triage_status FROM hq_opportunity_signals WHERE signal_id=?").get(other.signal_id);
    assert.equal(investigating.triage_status,"investigating");
    assert.equal((await onRequestPost(ctx(e,"POST",{action:"dismiss",signal_id:other.signal_id,expected_updated_at:investigating.updated_at}))).status,200);
    const dismissed=database.prepare("SELECT updated_at FROM hq_opportunity_signals WHERE signal_id=?").get(other.signal_id);
    assert.equal((await onRequestPost(ctx(e,"POST",{action:"reopen",signal_id:other.signal_id,expected_updated_at:dismissed.updated_at}))).status,200);
    database.prepare("UPDATE admin_asset_findings SET status='fixed' WHERE id='asset-finding-1'").run();
    await syncRadarFromObservations(adapter,"owner");
    assert.equal(database.prepare("SELECT source_status FROM hq_opportunity_signals WHERE signal_id=?").get(signal.signal_id).source_status,"fixed");
  } finally {globalThis.fetch=originalFetch;database.close();}
});
