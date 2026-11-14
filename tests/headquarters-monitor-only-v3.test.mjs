import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const source=await readFile(new URL('../functions/api/admin/monitor-only-v3.ts',import.meta.url),'utf8');
const authStub=[
 "export const adminJson=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});",
 "export const isAdminResponse=x=>x instanceof Response;",
 "export const requireAdmin=async c=>c.request.headers.get('x-test-identity')==='owner'?{email:'owner-test@private.invalid',serviceToken:false}:new Response('Forbidden',{status:403});"
].join('\n');
const stub='data:text/javascript;base64,'+Buffer.from(authStub).toString('base64');
const asEsm=stripTypeScriptTypes(source).replace(/from ["']\.\.\/\.\.\/_lib\/admin-auth["']/,
 'from '+JSON.stringify(stub));
if(asEsm===source)throw Error('Admin auth adapter not substituted');
const route=await import('data:text/javascript;base64,'+Buffer.from(asEsm).toString('base64'));
const createContext=({auth='owner',mode='staging',db}={})=>({
 request:new Request('https://admin-staging.yorphives.com/api/admin/monitor-only-v3',
  {headers:{'x-test-identity':auth}}),
 env:{HQ_MONITOR_V3_MODE:mode,get DB(){if(db==='forbidden')throw Error('D1 must not be consulted');return db;}}
});
const fixture={
 monitor_schema_versions:[{purpose:'monitor-only'}],
 monitor_targets:[{id:'synthetic',kind:'website',label:'SYNTHETIC TEST',enabled:1}],
 monitor_observation_runs:[{id:'run-synthetic-1',started_at:'2026-11-14',status:'completed'}],
 monitor_observations:[{id:'obs-synthetic-1',target_id:'synthetic',status:'unknown',
  evidence_kind:'manual-receipt',note:'SYNTHETIC, NOT A LIVE TEST'}],
 monitor_signals:[{id:'signal-synthetic-1',category:'revenue',title:'SYNTHETIC TEST',
  state:'unreviewed',priority:1}]
};
const memoryDb=(data=fixture)=>({
 prepare(sql){
  assert.match(sql,/^SELECT /);
  assert.doesNotMatch(sql,/INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPAIR|GITHUB|DEPLOY/i);
  const name=Object.keys(data).find(x=>sql.includes('FROM '+x));
  assert.ok(name,'Only the five staging monitoring tables can be queried');
  return{first:async()=>data[name][0]||null,all:async()=>({results:data[name]})};
 }
});

test('unauthenticated user denied before database is ever read',async()=>{
 const r=await route.onRequestGet(createContext({auth:'stranger',db:'forbidden'}));
 assert.equal(r.status,403);
});
test('default-disabled monitoring API does not query D1 or production legacy schema',async()=>{
 const r=await route.onRequestGet(createContext({mode:undefined,db:'forbidden'}));
 assert.equal(r.status,503);
 const data=await r.json();
 assert.equal(data.monitor_only,true);
 assert.equal(data.production_deployment_authorized,false);
});
test('isolated versioned schema gives bounded observations without any write/repair authority',async()=>{
 const r=await route.onRequestGet(createContext({db:memoryDb()}));
 assert.equal(r.status,200);
 const d=await r.json();
 assert.equal(d.status,'ready_for_staging_review');
 assert.equal(d.environment,'isolated_preview_only');
 assert.equal(d.schema_version,1);
 assert.equal(d.monitor_only,true);
 assert.equal(d.counts.observations,1);
 assert.equal(d.counts.signals,1);
 assert.equal(d.real_world_health_attested,false);
 assert.equal(d.independent_watchdog_installed,false);
 assert.equal(d.external_owner_otp_verified,false);
 assert.equal(d.production_deployment_authorized,false);
 assert.doesNotMatch(JSON.stringify(d),/owner-test@private.invalid|token|secret|password/i);
});
test('missing schema, wrong purpose or SQL errors fail closed, do not leak DB internals',async()=>{
 for(const data of [
  {...fixture,monitor_schema_versions:[]},
  {...fixture,monitor_schema_versions:[{purpose:'releases-and-repairs'}]}
 ]){
  const r=await route.onRequestGet(createContext({db:memoryDb(data)}));
  assert.equal(r.status,503);
 }
 const broken={prepare(){throw Error('secret DATABASE_URL breach');}};
 const r=await route.onRequestGet(createContext({db:broken}));
 assert.equal(r.status,503);
 assert.doesNotMatch(await r.text(),/DATABASE_URL|breach/);
});
test('staging dashboard has no executable repair, publish, payment or owner OTP routes',async()=>{
 const [html,js]=await Promise.all([
  readFile(new URL('../admin-next/index.html',import.meta.url),'utf8'),
  readFile(new URL('../admin-next/app.js',import.meta.url),'utf8')
 ]);
 assert.match(html,/PRIVATE PREVIEW/);
 assert.match(js,/method:'GET'/);
 assert.match(js,/credentials:'same-origin'/);
 assert.doesNotMatch(js,/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]|innerHTML|document\.write|location\.href/i);
 assert.doesNotMatch(source,/onRequestPost|onRequestDelete|ADMIN_AGENT_SERVICE|\.run\(|\.batch\(|\.insert\(/);
 assert.doesNotMatch(html,/id=["'](?:release-go-live|approve-repair|send-otp)["']/);
});
