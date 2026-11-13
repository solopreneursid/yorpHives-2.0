import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { DatabaseSync } from "node:sqlite";

const source=path=>readFile(new URL(path,import.meta.url),"utf8");
const dataURL=content=>"data:text/javascript;base64,"+
  Buffer.from(stripTypeScriptTypes(content)).toString("base64");
const authURL=dataURL(await source("../functions/_lib/admin-auth.ts"));
const routeURL=dataURL((await source("../functions/api/admin/repair-inbox.ts"))
  .replace('"../../_lib/admin-auth"',JSON.stringify(authURL)));
const {onRequestGet,onRequestPost}=await import(routeURL);

const keys=await crypto.subtle.generateKey({
  name:"RSASSA-PKCS1-v1_5",modulusLength:2048,
  publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"
},true,["sign","verify"]);
const jwk=await crypto.subtle.exportKey("jwk",keys.publicKey);
jwk.kid="repair-inbox";
const enc=x=>Buffer.from(JSON.stringify(x)).toString("base64url");
async function token(){
  const parts=[enc({alg:"RS256",kid:"repair-inbox"}),enc({
    iss:"https://hq-test.cloudflareaccess.com",
    aud:["repair-inbox-test"],exp:Math.floor(Date.now()/1000)+300,
    email:"owner@example.com"
  })];
  const sig=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",keys.privateKey,
    new TextEncoder().encode(parts.join(".")));
  return parts.join(".")+"."+Buffer.from(sig).toString("base64url");
}
const ownerJwt=await token();
function storage(){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE admin_audit_events(
    id TEXT PRIMARY KEY,actor TEXT,action TEXT,resource_type TEXT,
    resource_id TEXT,details_json TEXT,created_at TEXT
  );`);
  const DB={prepare(sql){
    let params=[];
    const stmt={bind(...x){params=x;return stmt;},
      async first(){return sqlite.prepare(sql).get(...params)||null;},
      async run(){return sqlite.prepare(sql).run(...params);}
    };
    return stmt;
  }};
  return{sqlite,DB};
}
const issue={
  number:17,title:"QR preview download fails on mobile",
  body_excerpt:"The displayed QR preview does not match the saved download.",
  state:"open",labels:["bug"],updated_at:"2026-11-13T01:05:00Z",
  url:"https://github.com/solopreneursid/yorpHives-2.0/issues/17"
};
const inbox={
  repository:"solopreneursid/yorpHives-2.0",issues:[issue],
  inspected_limit:40,returned_limit:20,read_only:true,
  new_model_calls:0,production_approved:false
};
function context(db,method="GET",extra={}){
  return {env:{
    DB:db,
    CF_ACCESS_TEAM_DOMAIN:"hq-test.cloudflareaccess.com",
    CF_ACCESS_AUD:"repair-inbox-test",ADMIN_ALLOWED_EMAILS:"owner@example.com",
    ADMIN_AGENT_SERVICE:{async fetch(request){
      if(method==="GET")return Response.json(inbox);
      const body=await request.json();
      assert.equal(body.confirm,true);
      assert.equal(body.scope,"website");
      return Response.json({created:true,number:18,title:body.title,
        url:"https://github.com/solopreneursid/yorpHives-2.0/issues/18",
        new_model_calls:0,production_approved:false},{status:201});
    }}
  },request:new Request("https://hq.example.com/api/admin/repair-inbox",{
    method,
    headers:{
      "cf-access-jwt-assertion":extra.missingToken?"":ownerJwt,
      "origin":extra.origin??"https://hq.example.com",
      "content-type":"application/json",
      "accept":extra.accept??"application/json"
    },
    ...(method!=="GET"?{body:JSON.stringify(extra.body??{
      title:"QR preview save mismatch",
      details:"On a mobile device the QR preview and the downloaded image differ. Reproduce in staging.",
      scope:"website",confirm:true
    })}:{})
  })};
}
const originalFetch=globalThis.fetch;
test("authenticated private GET is read-only and negotiates Markdown",async()=>{
  const {sqlite,DB}=storage();
  globalThis.fetch=async url=>{
    assert.equal(url,"https://hq-test.cloudflareaccess.com/cdn-cgi/access/certs");
    return Response.json({keys:[jwk]});
  };
  try{
    const result=await onRequestGet(context(DB));
    assert.equal(result.status,200);
    assert.deepEqual((await result.json()).issues,[issue]);
    const markdown=await onRequestGet(context(DB,"GET",{accept:"text/markdown"}));
    assert.equal(markdown.status,200);
    assert.match(markdown.headers.get("content-type"),/text\/markdown/);
    assert.match(await markdown.text(),/#17/);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM admin_audit_events").get().n,0);
  }finally{globalThis.fetch=originalFetch;sqlite.close();}
});
test("owner may open an issue but never dispatch AI or authorize production",async()=>{
  const {sqlite,DB}=storage();
  globalThis.fetch=async()=>Response.json({keys:[jwk]});
  try{
    const out=await onRequestPost(context(DB,"POST"));
    assert.equal(out.status,201);
    const result=await out.json();
    assert.equal(result.production_approved,false);
    assert.equal(result.new_model_calls,0);
    const recorded=sqlite.prepare("SELECT action,details_json FROM admin_audit_events").get();
    assert.equal(recorded.action,"github_issue_created");
    assert.equal(JSON.parse(recorded.details_json).automatic_agent_dispatch,false);
  }finally{globalThis.fetch=originalFetch;sqlite.close();}
});
test("unauthenticated, cross-origin or unconfirmed mutations fail closed",async()=>{
  const {sqlite,DB}=storage();
  globalThis.fetch=async()=>Response.json({keys:[jwk]});
  try{
    assert.equal((await onRequestGet(context(DB,"GET",{missingToken:true}))).status,401);
    assert.equal((await onRequestPost(context(DB,"POST",{origin:"https://attacker.example"}))).status,403);
    assert.equal((await onRequestPost(context(DB,"POST",{body:{
      title:"A title",details:"Enough detail to describe a problem, perhaps.",scope:"website",confirm:false
    }}))).status,400);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM admin_audit_events").get().n,0);
  }finally{globalThis.fetch=originalFetch;sqlite.close();}
});
