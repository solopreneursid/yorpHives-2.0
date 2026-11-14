import test from "node:test";
import assert from "node:assert/strict";
import {classifyMonitoredRoute,summarizeWatchtowerCoverage,readWatchtowerCoverage,
  COVERAGE_LIMIT,COVERAGE_FRESHNESS_HOURS} from "../functions/_lib/watchtower-coverage.js";

const now=new Date("2026-11-14T12:00:00.000Z");
const row=(url,environment,ok,checked_at)=>({url,environment,ok,checked_at});

test("only exact HTTPS production/public paths and staging Access routes are classified",()=>{
 assert.equal(classifyMonitoredRoute("https://yorphives.com/","production"),"website");
 assert.equal(classifyMonitoredRoute("https://www.yorphives.com/llms.txt","production"),"website");
 assert.equal(classifyMonitoredRoute("https://yorphives.com/free-tools/","production"),"products");
 assert.equal(classifyMonitoredRoute("https://yorphives.com/api/v1/free-tools","production"),"products");
 assert.equal(classifyMonitoredRoute("https://yorphives.com/api/v1/catalogue","production"),"products");
 assert.equal(classifyMonitoredRoute("https://admin-staging.yorphives.com/admin/","preview"),"headquarters");
 for(const [target,environment] of [
  ["http://yorphives.com/","production"],
  ["https://attacker.example/free-tools/","production"],
  ["https://yorphives.com.attacker.example/free-tools/","production"],
  ["https://yorphives.com/free-tools/?session=abc","production"],
  ["https://user:pass@yorphives.com/","production"],
  ["https://yorphives-2-preview.pages.dev/free-tools/","preview"],
  ["https://admin-staging.yorphives.com/admin/","production"],
  ["not-a-url","production"]
 ]) assert.equal(classifyMonitoredRoute(target,environment),null,target);
});

test("scope statuses distinguish recent pass, failure, stale, missing and future observations",()=>{
 const records=[
  row("https://yorphives.com/","production",1,"2026-11-14T11:00:00.000Z"),
  row("https://yorphives.com/llms.txt","production",0,"2026-11-14T11:30:00.000Z"),
  row("https://yorphives.com/free-tools/","production",1,"2026-11-14T02:00:00.000Z"),
  row("https://yorphives.com/api/v1/free-tools","production",1,null),
  row("https://admin-staging.yorphives.com/admin/","preview",1,"2026-11-14T11:50:00.000Z"),
  row("https://yorphives.com/tools/unknown","production",1,"2026-11-14T14:50:00.000Z"),
  row("https://yorphives-2-preview.pages.dev/","preview",1,"2026-11-14T11:00:00.000Z")
 ];
 const value=summarizeWatchtowerCoverage(records,now);
 assert.equal(value.scope,"recorded_http_reachability_only");
 assert.equal(value.freshness_hours,COVERAGE_FRESHNESS_HOURS);
 assert.deepEqual(value.surfaces.website,{
  configured:2,recent_passes:1,recent_failures:1,stale:0,unchecked:0,
  last_checked_at:"2026-11-14T11:30:00.000Z"
 });
 assert.deepEqual(value.surfaces.products,{
  configured:3,recent_passes:0,recent_failures:0,stale:1,unchecked:2,
  last_checked_at:"2026-11-14T02:00:00.000Z"
 });
 assert.equal(value.surfaces.headquarters.recent_passes,1);
 assert.equal(value.headquarters_runtime_verified,false,
  "A successful Cloudflare Access probe cannot prove private HQ runtime readiness");
 assert.equal(value.product_functionality_verified,false);
 assert.equal(value.ignored_routes,1);
 assert.equal(value.truncated,false);
});

test("limited read-only D1 query does not create monitoring work or print untrusted URLs",async()=>{
 const sqls=[];
 const db={prepare(sql){
   sqls.push(sql);
   assert.match(sql.trim(),/^SELECT\b/i);
   assert.match(sql,/LIMIT 201/);
   return {all:async()=>({success:true,results:[
     row("https://yorphives.com/","production",1,"2026-11-14T11:00:00.000Z")
   ]})};
 }};
 const value=await readWatchtowerCoverage(db,now);
 assert.equal(sqls.length,1);
 assert.equal(value.surfaces.website.configured,1);
 assert.equal(value.surfaces.website.recent_passes,1);
 assert.ok(!JSON.stringify(value).includes("yorphives.com"),"UI receives only aggregate evidence, no monitor URLs");
 await assert.rejects(()=>readWatchtowerCoverage({prepare:()=>({all:async()=>({success:false})})},now));
});

test("too many monitored URLs are labeled incomplete instead of presenting a full count",()=>{
 const records=Array.from({length:COVERAGE_LIMIT+1},()=>row("https://yorphives.com/","production",1,now.toISOString()));
 const value=summarizeWatchtowerCoverage(records,now);
 assert.equal(value.surfaces.website.configured,COVERAGE_LIMIT);
 assert.equal(value.truncated,true);
});

test("invalid or private addresses are ignored and never echoed into the dashboard",()=>{
 const secret="https://admin.local/private?token=secret";
 const value=summarizeWatchtowerCoverage([row(secret,"production",1,now.toISOString())],now);
 assert.equal(value.ignored_routes,1);
 assert.equal(value.surfaces.website.configured,0);
 assert.equal(JSON.stringify(value).includes(secret),false);
});
