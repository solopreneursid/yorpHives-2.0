import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  checkPublicWebsite, inspectWebsiteSecurity, WEBSITE_PROOF_TARGETS,
  WEBSITE_PROOF_ORIGIN
} from "../functions/_lib/website-proof.js";

const urls=["/","/free-tools/","/free-tools/file-studio/","/free-tools/manifest.json","/llms.txt",
  "/openapi.yaml","/.well-known/yorphives.json","/api/v1/free-tools"];
const dataForPath=Object.freeze({
  "/":"<!doctype html><html><head><title>YorpHives</title></head><body>Home</body></html>",
  "/free-tools/":"<!doctype html><html><head><title>Free Tools</title></head><body>Tools</body></html>",
  "/free-tools/file-studio/":"<!doctype html><html><head><title>File Studio</title></head><body>Studio</body></html>",
  "/free-tools/manifest.json":'[{"slug":"word-counter"}]',
  "/llms.txt":"# YorpHives\\nPublic agent access guidelines.",
  "/openapi.yaml":"openapi: 3.1.0\\ninfo:\\n  title: YorpHives API",
  "/.well-known/yorphives.json":'{"name":"YorpHives"}',
  "/api/v1/free-tools":'{"data":[]}'
});
const types=Object.freeze({
  "/":"text/html; charset=utf-8",
  "/free-tools/":"text/html",
  "/free-tools/file-studio/":"text/html",
  "/free-tools/manifest.json":"application/json",
  "/llms.txt":"text/plain",
  "/openapi.yaml":"text/yaml",
  "/.well-known/yorphives.json":"application/json",
  "/api/v1/free-tools":"application/json"
});
const sec={"strict-transport-security":"max-age=31536000",
  "x-frame-options":"DENY"};

function mockResponses(changes={}) {
  const requests=[];
  const fetcher=async (url, options)=>{
    requests.push({url,options});
    const path=new URL(url).pathname;
    const fixture=changes[path]||{};
    return new Response(fixture.body??dataForPath[path],{
      status:fixture.status??200,
      headers:{ "content-type":fixture.type??types[path],
        ...(fixture.security??sec)}
    });
  };
  return {fetcher,requests};
}
test("fixed origin and eight bounded GET destinations, never user-defined targets",async()=>{
  assert.equal(WEBSITE_PROOF_ORIGIN,"https://yorphives.com");
  assert.deepEqual(WEBSITE_PROOF_TARGETS.map(x=>x.path),urls);
  const {fetcher,requests}=mockResponses();
  const data=await checkPublicWebsite(fetcher,()=>new Date("2026-11-13T05:00:00Z"));
  assert.equal(data.basic_passed,8);
  assert.equal(data.needs_attention,0);
  assert.equal(data.unverified,0);
  assert.equal(data.overall,"basic_routes_passed");
  assert.equal(data.previous_findings_auto_resolved,false);
  assert.equal(data.documents_proven_fully_correct,false);
  assert.equal(data.new_ai_model_calls,0);
  assert.equal(data.database_writes,0);
  assert.equal(data.production_changes,0);
  assert.equal(data.checked_at,"2026-11-13T05:00:00.000Z");
  assert.deepEqual(requests.map(x=>x.url),urls.map(x=>WEBSITE_PROOF_ORIGIN+x));
  for(const x of requests) {
    assert.equal(x.options.method,"GET");
    assert.equal(x.options.redirect,"manual");
    assert.ok(x.options.signal);
    assert.equal(x.options.headers.accept,"*/*");
    assert.ok(!x.options.headers.authorization);
  }
});
test("HTML fallback on machine routes is a real concern, not a missing canonical tag",async()=>{
  const {fetcher}=mockResponses({
    "/openapi.yaml":{body:"<!doctype html><html>Oops</html>",type:"text/html"},
    "/api/v1/free-tools":{body:"<!doctype html><html>Oops</html>",type:"text/html"}
  });
  const result=await checkPublicWebsite(fetcher);
  assert.equal(result.needs_attention,2);
  assert.equal(result.basic_passed,6);
  assert.equal(result.overall,"needs_attention");
  const affected=result.checks.filter(x=>x.status==="needs_attention");
  assert.deepEqual(affected.map(x=>x.path),["/openapi.yaml","/api/v1/free-tools"]);
  assert.ok(affected.every(x=>x.note.includes("HTML")));
});
test("Access blocks and rate limits are inconclusive, never falsified outages",async()=>{
  const {fetcher}=mockResponses({
    "/free-tools/manifest.json":{status:403,body:"Forbidden",type:"text/plain"},
    "/openapi.yaml":{status:429,body:"Too many requests",type:"text/plain"}
  });
  const result=await checkPublicWebsite(fetcher);
  assert.equal(result.unverified,2);
  assert.equal(result.needs_attention,0);
  assert.equal(result.overall,"inconclusive");
  assert.ok(result.checks.filter(x=>x.status==="not_verified")
    .every(x=>x.note.includes("blocked or rate-limited")));
});
test("errors, redirects, broken JSON and missing HTTPS protection require attention",async()=>{
  const {fetcher}=mockResponses({
    "/":{security:{"content-security-policy":"default-src 'self'"}},
    "/free-tools/":{status:302,body:"",type:"text/html"},
    "/free-tools/manifest.json":{body:'{"not":"an array"}'},
    "/llms.txt":{status:500,body:"Unavailable"},
    "/.well-known/yorphives.json":{type:"text/html",body:"<!doctype html><html></html>"}
  });
  const result=await checkPublicWebsite(fetcher);
  assert.equal(result.needs_attention,5);
  assert.equal(result.basic_passed,3);
  assert.equal(result.overall,"needs_attention");
});
test("HTTPS and framing require positive policies",()=>{
  const good=inspectWebsiteSecurity(new Headers(sec));
  assert.equal(good.https_redirect_persistence,true);
  assert.equal(good.embedding_protection,true);
  const bad=inspectWebsiteSecurity(new Headers({
    "strict-transport-security":"max-age=0",
    "content-security-policy":"default-src 'self'"
  }));
  assert.equal(bad.https_redirect_persistence,false);
  assert.equal(bad.embedding_protection,false);
  assert.equal(inspectWebsiteSecurity(new Headers({
    "strict-transport-security":"max-age=86400",
    "content-security-policy":"frame-ancestors 'none'"
  })).embedding_protection,true);
});
test("size limits and network errors are unverified and do not leak details",async()=>{
  const large="A".repeat(384*1024+1);
  const {fetcher}=mockResponses({"/llms.txt":{body:large,type:"text/plain"}});
  const result=await checkPublicWebsite(fetcher);
  const row=result.checks.find(x=>x.path==="/llms.txt");
  assert.equal(row.status,"not_verified");
  assert.match(row.note,/bounded inspection size/);
  const err=await checkPublicWebsite(async()=>{throw Error("Internal private error");});
  assert.equal(err.unverified,8);
  assert.doesNotMatch(JSON.stringify(err),/Internal private error/);
});
test("private route authenticates before network calls and serves Markdown or JSON",async()=>{
  const endpoint=await readFile(new URL("../functions/api/admin/website-proof.ts",import.meta.url),"utf8");
  const browser=await readFile(new URL("../admin/website-proof.js",import.meta.url),"utf8");
  const html=await readFile(new URL("../admin/index.html",import.meta.url),"utf8");
  assert.ok(endpoint.indexOf("await requireAdmin(context)")<
    endpoint.indexOf("await checkPublicWebsite()"));
  assert.match(endpoint,/text\/markdown/);
  assert.match(endpoint,/vary.*Accept/i);
  assert.match(endpoint,/cache-control/);
  assert.match(endpoint,/new_ai_model_calls:0,database_writes:0,production_changes:0/);
  assert.match(browser,/HQChooseAssistant/);
  assert.match(browser,/textContent/);
  assert.doesNotMatch(browser,/innerHTML/);
  assert.match(html,/id="website-proof-run"/);
  assert.match(html,/id="website-proof-list"/);
});

test("unpublished optional website API and manifest are coverage gaps, not a public outage",async()=>{
  const {fetcher}=mockResponses({
    "/api/v1/free-tools":{status:404,body:"Not found",type:"text/html"},
    "/free-tools/manifest.json":{status:404,body:"Not found",type:"text/html"},
    "/llms.txt":{status:404,body:"Not found",type:"text/html"},
    "/openapi.yaml":{status:404,body:"Not found",type:"text/html"},
    "/.well-known/yorphives.json":{status:404,body:"Not found",type:"text/html"}
  });
  const result=await checkPublicWebsite(fetcher);
  assert.equal(result.total,8);
  assert.equal(result.basic_passed,3);
  assert.equal(result.optional_missing,5);
  assert.equal(result.needs_attention,0);
  assert.equal(result.unverified,0);
  assert.equal(result.overall,"basic_routes_passed_with_unpublished_capabilities");
  assert.equal(result.checks.find(item=>item.path==="/free-tools/file-studio/").status,"verified_basic");
  assert.equal(result.checks.find(item=>item.path==="/api/v1/free-tools").status,"not_published");
});
