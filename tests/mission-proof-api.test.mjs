import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { stripTypeScriptTypes } from "node:module";

const source=p=>readFile(new URL(p,import.meta.url),"utf8");
const dataURL=s=>"data:text/javascript;base64,"+
  Buffer.from(stripTypeScriptTypes(s)).toString("base64");
const authURL=dataURL(await source("../functions/_lib/admin-auth.ts"));
const kernelURL=dataURL(await source("../functions/_lib/mission-proof.js"));
const routeSource=(await source("../functions/api/admin/mission-proof.ts"))
  .replace('"../../_lib/admin-auth"',JSON.stringify(authURL))
  .replace('"../../_lib/mission-proof.js"',JSON.stringify(kernelURL));
const {onRequestGet}=await import(dataURL(routeSource));

const keys=await crypto.subtle.generateKey({
  name:"RSASSA-PKCS1-v1_5",modulusLength:2048,
  publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"
},true,["sign","verify"]);
const jwk=await crypto.subtle.exportKey("jwk",keys.publicKey);
jwk.kid="mission-proof";
const pack=value=>Buffer.from(JSON.stringify(value)).toString("base64url");
async function token(){
  const parts=[pack({alg:"RS256",kid:"mission-proof"}),pack({
    iss:"https://hq-test.cloudflareaccess.com",
    aud:["mission-proof-test"],exp:Math.floor(Date.now()/1000)+180,
    email:"owner@example.com"
  })];
  const signature=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",keys.privateKey,
    new TextEncoder().encode(parts.join(".")));
  return parts.join(".")+"."+Buffer.from(signature).toString("base64url");
}
const ownerToken=await token();
const jobId="123e4567-e89b-42d3-a456-000000000001";
const brief=JSON.stringify({
  kind:"recommendation_brief",model:"@cf/qwen/qwen3.8-27b",
  generated_at:"2026-11-13T00:20:00Z",verified:false,
  summary:"Check the QR mobile preview",
  recommended_approach:"Reproduce in a staging browser.",
  actions:["Verify the preview"],risks:[],assumptions:[],
  verification_needed:["Check phone and desktop"]
});
function sqlite(db) {
  return { prepare(sql) {
    let args=[];
    const stmt={
      bind(...x){args=x;return stmt;},
      async first(){return db.prepare(sql).get(...args)||null;},
      async all(){return {results:db.prepare(sql).all(...args),success:true};}
    };
    return stmt;
  }};
}
async function fixture() {
  const db=new DatabaseSync(":memory:");
  db.exec(await source("../migrations/0010_agentic_os_foundation.sql"));
  db.exec(await source("../migrations/0012_headquarters_execution.sql"));
  db.exec(await source("../migrations/0013_headquarters_brief_review.sql"));
  db.prepare(
    "INSERT INTO agent_jobs(job_id,agent_id,job_type,title,request_summary,created_by,status) " +
    "VALUES (?,'product-strategist','owner_mission','QR preview QA','Check mobile and desktop','owner@example.com','planned')"
  ).run(jobId);
  db.prepare("UPDATE agent_jobs SET status='queued' WHERE job_id=?").run(jobId);
  db.prepare("UPDATE agent_jobs SET status='running',started_at=?,"+
    "input_json=json_set(input_json,'$.model_attempt_started_at',?) WHERE job_id=?")
    .run("2026-11-13T00:15:00Z","2026-11-13T00:15:00Z",jobId);
  db.prepare("UPDATE agent_jobs SET status='awaiting_owner_approval',result_json=? WHERE job_id=?")
    .run(brief,jobId);
  return db;
}
function context(db,options={}){
  const url=new URL("https://headquarters.example/api/admin/mission-proof");
  url.searchParams.set("job_id",options.job_id??jobId);
  if(options.format)url.searchParams.set("format",options.format);
  return {env:{
    DB:sqlite(db),CF_ACCESS_TEAM_DOMAIN:"hq-test.cloudflareaccess.com",
    CF_ACCESS_AUD:"mission-proof-test",ADMIN_ALLOWED_EMAILS:"owner@example.com"
  },request:new Request(url,{headers:{
    "accept":options.accept||"application/json",
    ...(!options.noToken?{"cf-access-jwt-assertion":ownerToken}:{})
  }})};
}
const originalFetch=globalThis.fetch;
test("real Access identity and actual SQLite triggers produce review-only evidence",async()=>{
  const db=await fixture();
  globalThis.fetch=async url=>{
    assert.equal(url,"https://hq-test.cloudflareaccess.com/cdn-cgi/access/certs");
    return Response.json({keys:[jwk]});
  };
  try{
    const res=await onRequestGet(context(db));
    assert.equal(res.status,200);
    const data=await res.json();
    assert.equal(data.system,"headquarters_mission_proof");
    assert.equal(data.proof.evidence_status,"recorded_review_ready");
    assert.equal(data.proof.checks.length,5);
    assert.equal(data.proof.records_sufficient_for_owner_review,true);
    assert.equal(data.independent_qa_passed,false);
    assert.equal(data.production_release_permitted,false);
    assert.equal(data.new_inference_calls,0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM agent_approvals").get().n,0);
  }finally{globalThis.fetch=originalFetch;db.close();}
});
test("same read-only receipt is exposed as inert Markdown for AI agents",async()=>{
  const db=await fixture();
  globalThis.fetch=async()=>Response.json({keys:[jwk]});
  try{
    const r=await onRequestGet(context(db,{accept:"text/markdown"}));
    assert.equal(r.status,200);
    assert.match(r.headers.get("content-type"),/text\/markdown/);
    const text=await r.text();
    assert.match(text,/Production deployment: NOT AUTHORIZED/);
    assert.match(text,/Independent QA: NOT VERIFIED/);
  }finally{globalThis.fetch=originalFetch;db.close();}
});
test("invalid ID, missing Access and missing D1 evidence all fail closed",async()=>{
  const db=await fixture();
  globalThis.fetch=async()=>Response.json({keys:[jwk]});
  try{
    assert.equal((await onRequestGet(context(db,{noToken:true}))).status,401);
    assert.equal((await onRequestGet(context(db,{job_id:"wrong"}))).status,400);
    assert.equal((await onRequestGet(context(db,{job_id:crypto.randomUUID()}))).status,404);
    db.exec("DROP TABLE agent_job_events");
    assert.equal((await onRequestGet(context(db))).status,503);
  }finally{globalThis.fetch=originalFetch;db.close();}
});
