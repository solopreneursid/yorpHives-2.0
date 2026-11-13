import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {stripTypeScriptTypes} from "node:module";
import {DatabaseSync} from "node:sqlite";

const source=path=>readFile(new URL(path,import.meta.url),"utf8");
const data=code=>"data:text/javascript;base64,"+
  Buffer.from(stripTypeScriptTypes(code)).toString("base64");
const authURL=data(await source("../functions/_lib/admin-auth.ts"));
const permsURL=data(await source("../functions/_lib/founder-permissions.js"));
const auth=await import(authURL);
const {onRequestPost}=await import(data((await source("../functions/api/admin/assistant-actions.ts"))
  .replace('"../../_lib/admin-auth"',JSON.stringify(authURL))
  .replace('"../../_lib/founder-permissions.js"',JSON.stringify(permsURL))));
const keys=await crypto.subtle.generateKey({
  name:"RSASSA-PKCS1-v1_5",modulusLength:2048,
  publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"
},true,["sign","verify"]);
const jwk=await crypto.subtle.exportKey("jwk",keys.publicKey);
jwk.kid="assistants-ci";
const pack=x=>Buffer.from(JSON.stringify(x)).toString("base64url");
const config={
  CF_ACCESS_TEAM_DOMAIN:"temporary-hq.cloudflareaccess.com",
  CF_ACCESS_AUD:"founder-aud",CF_ACCESS_STEP_UP_AUD:"founder-stepup",
  CF_ACCESS_AGENT_AUD:"private-ai-audience",
  CF_ACCESS_YORPMIND_SERVICE_TOKEN_ID:"yorpmind-service-verify",
  CF_ACCESS_CHATGPT_SERVICE_TOKEN_ID:"chatgpt-service-verify"
};
async function jwt(identity="yorpmind-service-verify",options={}){
  const now=Math.floor(Date.now()/1000);
  const chunks=[pack({alg:"RS256",kid:"assistants-ci"}),pack({
    iss:"https://temporary-hq.cloudflareaccess.com",
    aud:options.aud||["private-ai-audience"],
    exp:now+300,iat:now,
    service_token_id:identity,service_token_status:options.service!==false
  })];
  const sig=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",keys.privateKey,
    new TextEncoder().encode(chunks.join(".")));
  return chunks.join(".")+"."+Buffer.from(sig).toString("base64url");
}
const oldFetch=globalThis.fetch;
const fetchKeys=async()=>Response.json({keys:[jwk]});
test("real RSA-signed separate service identity is required; role text cannot impersonate",async()=>{
  globalThis.fetch=fetchKeys;
  try{
    assert.equal(await auth.verifyTemporaryAssistantAccess(new Request("https://internal.example",{
      headers:{"cf-access-jwt-assertion":await jwt()}
    }),config),"yorpmind");
    assert.equal(await auth.verifyTemporaryAssistantAccess(new Request("https://internal.example",{
      headers:{"cf-access-jwt-assertion":await jwt("chatgpt-service-verify")}
    }),config),"chatgpt");
    assert.equal(await auth.verifyTemporaryAssistantAccess(new Request("https://internal.example",{
      headers:{"cf-access-jwt-assertion":await jwt("random-unapproved-worker")}
    }),config),null);
    assert.equal(await auth.verifyTemporaryAssistantAccess(new Request("https://internal.example",{
      headers:{"cf-access-jwt-assertion":await jwt("yorpmind-service-verify",{aud:["founder-aud"]})}
    }),config),null);
    assert.equal(await auth.verifyTemporaryAssistantAccess(new Request("https://internal.example",{
      headers:{"cf-access-jwt-assertion":await jwt("yorpmind-service-verify",{service:false})}
    }),config),null);
    assert.equal(await auth.verifyTemporaryAssistantAccess(new Request("https://internal.example",{
      headers:{"cf-access-jwt-assertion":"untrusted.text.token","x-assistant":"chatgpt"}
    }),config),null);
    assert.equal(await auth.verifyTemporaryAssistantAccess(new Request("https://internal.example",{
      headers:{"cf-access-jwt-assertion":await jwt()}
    }),{...config,CF_ACCESS_AGENT_AUD:"founder-aud"}),null);
  }finally{globalThis.fetch=oldFetch;}
});
const GRANT="123e4567-e89b-42d3-a456-000000000041";
const ACTION="123e4567-e89b-42d3-a456-000000000042";
const action={request_id:ACTION,action:"create_issue",scope:"website",
  title:"The QR preview is wrong on mobile",
  details:"The QR preview and its saved image do not match on narrow phones; reproduce this on a private test version.",
  confirm:true};
async function fixture(){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec(await source("../migrations/0028_founder_temporary_grants.sql"));
  sqlite.exec("CREATE TABLE admin_audit_events(id TEXT PRIMARY KEY,actor TEXT,action TEXT,resource_type TEXT,resource_id TEXT,details_json TEXT,created_at TEXT)");
  const now=new Date(),before=new Date(now.getTime()-60000).toISOString();
  const after=new Date(now.getTime()+10*60000).toISOString();
  sqlite.prepare(
    "INSERT INTO founder_temporary_grants"+
    "(grant_id,assistant,scope,permission,duration_minutes,purpose,owner_email,state,"+
    "created_at,request_expires_at,activated_at,activated_by,active_expires_at)"+
    " VALUES(?,?,?,?,?,?,?,'active',?,?,?,?,?)"
  ).run(GRANT,"yorpmind","website","prepare_fixes",15,
    "Prepare a tracked GitHub issue for the mobile QR preview problem so we can review it.",
    "owner@example.com",before,after,before,"owner@example.com",after);
  const db={prepare(sql){
    let values=[];
    const stmt={bind(...x){values=x;return stmt;},
      async first(){return sqlite.prepare(sql).get(...values)||null;},
      async all(){return{results:sqlite.prepare(sql).all(...values)};},
      async run(){const result=sqlite.prepare(sql).run(...values);
        return {success:true,meta:{changes:Number(result.changes)}};}
    };return stmt;
  }};
  return{sqlite,db};
}
function ctx(db,token,worker,requestBody=action) {
  return{env:{...config,DB:db,ADMIN_AGENT_SERVICE:{fetch:worker}},
    request:new Request("https://private.example/api/admin/assistant-actions",{
      method:"POST",headers:{
        "content-type":"application/json","cf-access-jwt-assertion":token
      },body:JSON.stringify(requestBody)
    })};
}
test("verified assistants cannot use retired administrator actions",async()=>{
 const {sqlite,db}=await fixture();
 globalThis.fetch=fetchKeys;
 let calls=0;
 try{
  const token=await jwt();
  const response=await onRequestPost(ctx(db,token,async()=>{
   calls++;return Response.json({created:true});
  }));
  assert.equal(response.status,410);
  assert.match(JSON.stringify(await response.json()),/ASSISTANT_GRANTS_RETIRED/);
  assert.equal(calls,0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM founder_grant_actions").get().n,0);
 }finally{globalThis.fetch=oldFetch;sqlite.close();}
});
test("a missing real assistant token cannot use an otherwise active permission",async()=>{
  const {sqlite,db}=await fixture();
  let calls=0;
  try {
    const result=await onRequestPost(ctx(db,"some-text",async()=>{
      calls++;return Response.json({});
    }));
    assert.equal(result.status,403);
    assert.equal(calls,0);
  }finally{sqlite.close();}
});
