import test from "node:test";
import assert from "node:assert/strict";
import {verifyAnonymousBoundary,readHeadquartersD1Isolation} from "../scripts/staging-preview-check.mjs";

const origin="https://0eae6b86.yorphives-admin-staging.pages.dev";
const redirect=to=>new Response(null,{status:302,headers:{location:to}});
const denial=status=>new Response(null,{status});
const run=(first,second=denial(403))=>{
 let called=0;
 return verifyAnonymousBoundary(origin,async()=>{
  called++;
  return called===1?first:second;
 });
};

test("real same-origin Access login redirect plus 403 is classified without credentials",async()=>{
 const result=await run(redirect("/cdn-cgi/access/login?redirect_url=%2Fadmin%2F"));
 assert.equal(result.access_boundary_verified,true);
 assert.equal(result.routes.length,2);
 assert.deepEqual(result.routes.map(x=>x.denial_kind),[
  "verified_cloudflare_access_redirect","http_auth_denial"]);
 assert.deepEqual(result.routes.map(x=>x.access_redirect_verified),[true,false]);
 assert.ok(result.routes.every(x=>x.access_blocked===true));
 assert.equal(result.credentials_exposed,false);
 assert.equal(result.database_writes,0);
});
test("a real account.cloudflareaccess.com login origin is accepted",async()=>{
 const r=await run(redirect("https://myteam.cloudflareaccess.com/cdn-cgi/access/login"));
 assert.equal(r.routes[0].access_redirect_verified,true);
});
test("a foreign redirect with /cdn-cgi/access/ path cannot fake Access",async()=>{
 for(const location of [
  "https://attacker.example/cdn-cgi/access/login",
  "https://cloudflareaccess.com.attacker.example/cdn-cgi/access/login",
  "http://0eae6b86.yorphives-admin-staging.pages.dev/cdn-cgi/access/login",
  "https://user:pass@0eae6b86.yorphives-admin-staging.pages.dev/cdn-cgi/access/login",
  "https://myteam.cloudflareaccess.com.evil.example/cdn-cgi/access/login",
  "https://myteam.cloudflareaccess.com/ordinary/landing",
  "/redirect-to-login",
  "https://0eae6b86.yorphives-admin-staging.pages.dev:444/cdn-cgi/access/login"
 ]){
  await assert.rejects(run(redirect(location)),/Anonymous access was not securely denied/,
   location);
 }
});
test("unknown host, HTTP 200 and failed HTTP calls stop rather than attest",async()=>{
 await assert.rejects(verifyAnonymousBoundary("https://yorphives.com",async()=>denial(403)),/Refusing/);
 await assert.rejects(run(denial(200)),/Anonymous access was not securely denied/);
 await assert.rejects(verifyAnonymousBoundary(origin,async()=>{throw Error("network down")}),
  /Cannot confirm the anonymous Access boundary/);
});

test("read-only Cloudflare project inspection refuses shared physical D1 before authenticated QA",async()=>{
 const shared="e8690813-b139-44a2-a1c7-bea2d2777ead";
 const base={
  name:"yorphives-admin-staging",
  production_branch:"build/yorphives-admin-reliability",
  source:{type:"github",config:{owner:"solopreneursid",
    repo_name:"yorpHives-2.0",
    production_branch:"build/yorphives-admin-reliability"}},
  deployment_configs:{
   preview:{d1_databases:{DB:{id:shared}}},
   production:{d1_databases:{DB:{id:shared}}}
  }
 };
 let calls=0;
 const fetcher=async(url,opts)=>{
  calls++;
  assert.match(url,/api.cloudflare.com\/client\/v4\/accounts\//);
  assert.equal(opts.method,"GET");
  return Response.json({success:true,result:base});
 };
 await assert.rejects(readHeadquartersD1Isolation({
  accountId:"a".repeat(32),apiToken:"read-only",fetcher}),/SAME D1 database/);
 assert.equal(calls,1);
 const distinct={...base,deployment_configs:{
  preview:{d1_databases:{DB:{id:"84c324ac-f7dc-4304-80bf-8da16da18c4c"}}},
  production:{d1_databases:{DB:{id:shared}}}
 }};
 const result=await readHeadquartersD1Isolation({accountId:"a".repeat(32),
  apiToken:"read-only",fetcher:async()=>Response.json({success:true,result:distinct})});
 assert.equal(result.isolated,true);
 assert.equal(result.production_deployment_enabled,false);
 assert.equal(result.database_migration_allowed,false);
});
