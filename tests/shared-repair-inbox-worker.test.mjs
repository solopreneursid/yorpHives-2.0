import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const file=path=>readFile(new URL(path,import.meta.url),"utf8");
const uri=code=>"data:text/javascript;base64,"+Buffer.from(code).toString("base64");
const evidenceURI=uri(await file("../admin-agent/repair-evidence.js"));
const securityURI=uri(await file("../admin-agent/repair-security.js"));
const modelURI=uri(await file("../admin-agent/model-output.js"));
const workerSource=(await file("../admin-agent/worker.js"))
  .replace('import { WorkflowEntrypoint } from "cloudflare:workers";',
    'class WorkflowEntrypoint { constructor() { this.env={}; } }')
  .replace('"./repair-evidence.js"',JSON.stringify(evidenceURI))
  .replace('"./repair-security.js"',JSON.stringify(securityURI))
  .replace('"./model-output.js"',JSON.stringify(modelURI));
const {default:worker}=await import(uri(workerSource));
const originalFetch=globalThis.fetch;
const env={GITHUB_TOKEN:"synthetic-test-token"};
const endpoint="https://worker-internal.invalid/issue-inbox";
const request=(method="GET",body=null,headers={})=>new Request(endpoint,{
  method,headers:{"x-yorphives-internal-inbox":"1",...headers},
  ...(body?{body:JSON.stringify(body)}:{})
});
test("private GitHub inbox filters pull requests, bounds and normalizes issue links",async()=>{
  let calls=0;
  globalThis.fetch=async url=>{
    calls++;
    assert.match(String(url),/\/repos\/solopreneursid\/yorpHives-2\.0\/issues\?/);
    return Response.json([{
      number:44,title:"QR preview mismatch",
      body:"Expected desktop and mobile preview to match downloads.",
      labels:[{name:"bug"}],updated_at:"2026-11-13T02:00:00Z",
      html_url:"https://evil.example/replace"
    },{number:45,title:"Pull request (not issue)",pull_request:{url:"https://github.com/..."},
      labels:[]}]);
  };
  try{
    const r=await worker.fetch(request(),env);
    assert.equal(r.status,200);
    const result=await r.json();
    assert.equal(calls,1);
    assert.equal(result.issues.length,1);
    assert.equal(result.issues[0].number,44);
    assert.equal(result.issues[0].url,
      "https://github.com/solopreneursid/yorpHives-2.0/issues/44");
    assert.equal(result.production_approved,false);
    assert.equal(result.new_model_calls,0);
  }finally{globalThis.fetch=originalFetch;}
});
test("monitor-only Worker refuses GitHub issue creation before any external request",async()=>{
 let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error("should not send write");};
 try{
  const r=await worker.fetch(request("POST",{
   title:"Headquarters navigation shows missing links",
   details:"Several navigation links fail during mobile use.",
   scope:"headquarters",confirm:true
  }),env);
  assert.equal(r.status,405);
  const body=await r.json();
  assert.equal(body.error,"MONITOR_ONLY");
  assert.equal(body.github_issue_created,false);
  assert.equal(body.dispatch_performed,false);
  assert.equal(calls,0);
 }finally{globalThis.fetch=originalFetch;}
});
test("read-only GET needs private binding and token; any POST is rejected",async()=>{
  let count=0;
  globalThis.fetch=async()=>{count++;return Response.json({})};
  try {
    assert.equal((await worker.fetch(new Request(endpoint),env)).status,403);
    assert.equal((await worker.fetch(request(),{})).status,503);
    assert.equal((await worker.fetch(request("POST",{
      title:"Issue title is valid",details:"Long enough details but no confirmation allowed.",
      scope:"website",confirm:false
    }),env)).status,405);
    assert.equal(count,0);
  }finally{globalThis.fetch=originalFetch;}
});
