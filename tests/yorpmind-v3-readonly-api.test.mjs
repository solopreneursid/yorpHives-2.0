import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const file=readFileSync(new URL('../functions/api/admin/yorpmind-os-v3.ts',import.meta.url),'utf8');
const stub=[
 "export const adminJson=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});",
 "export const isAdminResponse=value=>value instanceof Response;",
 "export const requireAdmin=async c=>{const role=c.request.headers.get('x-test-role');return role==='owner'?{serviceToken:false}:role==='service'?{serviceToken:true}:new Response('Unauthorized',{status:401});};"
].join('\n');
const encoded=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const adapted=stripTypeScriptTypes(file).replace(
 /from ["']\.\.\/\.\.\/_lib\/admin-auth["']/,'from '+JSON.stringify(encoded(stub)));
assert.notEqual(adapted,file);
const {onRequestGet}=await import(encoded(adapted));
const freshDb=()=>{
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(readFileSync(new URL('../staging/monitor-only-schema-v1.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../staging/yorpmind-readonly-os-v2.sql',import.meta.url),'utf8'));
 const db={prepare(sql){
  assert.match(sql,/^SELECT /);
  assert.doesNotMatch(sql,/(?:DELETE|UPDATE|INSERT|ALTER|CREATE|REPAIR|DEPLOY|DROP)/i);
  const stmt=sqlite.prepare(sql);
  const wrap=(args)=>({all:async()=>({results:stmt.all(...args)}),
   first:async()=>stmt.get(...args)||null});
  return{...wrap([]),bind(...args){return wrap(args)}};
 }};
 return{db,sqlite,close:()=>sqlite.close()};
};
const owner=({role='owner',mode='staging',db}={})=>({
 request:new Request('https://hq.example.test/api/admin/yorpmind-os-v3',
  {headers:{'x-test-role':role}}),
 env:{HQ_MONITOR_V3_MODE:mode,DB:db}
});
test('YorpMind v3 API authenticates owner and denies bot/service-token identity',async()=>{
 assert.equal((await onRequestGet(owner({role:'anonymous'}))).status,401);
 assert.equal((await onRequestGet(owner({role:'service'}))).status,403);
});
test('YorpMind analysis API cannot run on production or absent isolated schema',async()=>{
 const f=freshDb();
 try{
  assert.equal((await onRequestGet(owner({mode:'production',db:f.db}))).status,503);
  assert.equal((await onRequestGet(owner({mode:'staging',db:undefined}))).status,503);
 }finally{f.close();}
});
test('YorpMind reports configured agents, not fake model runs or verified learning',async()=>{
 const f=freshDb();
 try{
  const response=await onRequestGet(owner({db:f.db}));
  assert.equal(response.status,200);
  const d=await response.json();
  assert.equal(d.schema_version,2);
  assert.equal(d.monitor_only,true);
  assert.equal(d.repo_write_capability,false);
  assert.equal(d.production_deployment_authorized,false);
  assert.equal(d.private_model_configured_from_provider,false);
  assert.equal(d.actual_agent_inference_verified,false);
  assert.equal(d.summary.configured_employees,6);
  assert.equal(d.summary.completed_agent_runs,0);
  assert.equal(d.summary.pending_founder_reviews,0);
  assert.equal(d.summary.verified_learning_records,0);
  assert.equal(d.decision_briefs.length,0);
  assert.ok(d.employees.every(e=>e.activity==='configured_not_proven_running'));
  assert.ok(d.employees.every(e=>e.model_policy==='local_only'&&e.autonomy==='observe_recommend'));
 }finally{f.close();}
});
test('YorpMind UI is read-only and differentiates configured agents from genuinely completed inference',async()=>{
 const [html,js]=await Promise.all([
  import('node:fs/promises').then(({readFile})=>readFile(new URL('../admin-next/index.html',import.meta.url),'utf8')),
  import('node:fs/promises').then(({readFile})=>readFile(new URL('../admin-next/app.js',import.meta.url),'utf8'))
 ]);
 for(const id of ['yorpmind-view','ym-ai-summary','ym-ai-status','ym-employee-list','ym-brief-list','ym-memory-list'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(js,/fetchPrivateJson\('\/api\/admin\/yorpmind-os-v3'\)/);
 assert.match(js,/actual_agent_inference_verified/);
 assert.match(js,/\.textContent/);
 assert.doesNotMatch(js,/(?:method:\s*['"](?:POST|DELETE|PUT|PATCH)['"]|innerHTML|document\.write)/i);
 assert.doesNotMatch(file,/onRequestPost|onRequestDelete|ADMIN_AGENT_SERVICE|\.run\(/);
});
