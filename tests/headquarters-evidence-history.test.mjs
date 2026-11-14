import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';

const source=await readFile(new URL('../functions/api/admin/evidence-history-v3.ts',import.meta.url),'utf8');
const auth=[
 "export const adminJson=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});",
 "export const isAdminResponse=x=>x instanceof Response;",
 "export const requireAdmin=async c=>c.request.headers.get('x-role')==='owner'?{serviceToken:false}:c.request.headers.get('x-role')==='machine'?{serviceToken:true}:new Response('Unauthorized',{status:401});"
].join('\n');
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const module=stripTypeScriptTypes(source).replace(
 /from ["']\.\.\/\.\.\/_lib\/admin-auth["']/,'from '+JSON.stringify(url(auth)));
assert.notEqual(module,source);
const {onRequestGet}=await import(url(module));
const now=new Date().toISOString();
const fixture={
 version:[{purpose:'monitor-only'}],
 runs:[{id:'watch-run-1',started_at:now,finished_at:now,status:'completed'}],
 observations:[{target_id:'watch-target-website-home',observed_at:now,
  status:'verified',evidence_kind:'http-status',
  note:'hq-staging-independent-watchdog-v1',run_status:'completed'}],
 signals:[{id:'watch-signal-free-tools-not-json',category:'product',state:'unreviewed',
  priority:2,title:'Website discovery metadata needs review',
  evidence_ref:'website:free-tools:not_json',observed_at:now,
  founder_action:'Review the source and approve separately'}]
};
const db={
 prepare(sql){
  assert.match(sql,/^SELECT /);
  assert.doesNotMatch(sql,/INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|DEPLOY|REPAIR/);
  if(sql.includes('monitor_schema_versions'))return{first:async()=>fixture.version[0]};
  const kind=sql.includes('monitor_observation_runs')&&sql.includes('JOIN')?'observations':
    sql.includes('FROM monitor_observation_runs')?'runs':
    sql.includes('FROM monitor_signals')?'signals':'none';
  assert.notEqual(kind,'none');
  return{all:async()=>({results:fixture[kind]})};
 }
};
function context({role='owner',mode='staging',storage=db}={}){
 return{request:new Request('https://admin-staging.yorphives.com/api/admin/evidence-history-v3',
  {headers:{'x-role':role}}),
  env:{HQ_MONITOR_V3_MODE:mode,DB:storage}};
}
test('independent history only visible to owner after Access and preview feature gate',async()=>{
 assert.equal((await onRequestGet(context({role:'stranger'}))).status,401);
 assert.equal((await onRequestGet(context({role:'machine'}))).status,403);
 assert.equal((await onRequestGet(context({mode:'production'}))).status,503);
 assert.equal((await onRequestGet(context({storage:undefined}))).status,200);
});
test('fresh history presents source, heartbeat, evidence and review queue without executable authority',async()=>{
 const r=await onRequestGet(context());
 assert.equal(r.status,200);
 const d=await r.json();
 assert.equal(d.schema_version,1);
 assert.equal(d.collector_installed_and_fresh,true);
 assert.equal(d.source,'independent_readonly_watchdog_history');
 assert.equal(d.counts.recent_runs,1);
 assert.equal(d.counts.recent_observations,1);
 assert.equal(d.counts.review_signals,1);
 assert.equal(d.production_deployment_authorized,false);
 assert.equal(d.writes_permitted_from_headquarters,false);
 assert.equal(d.revenue.verified_amount,null);
 assert.equal(d.alerts_outside_dashboard.state,'not_connected');
});
test('stale evidence is NOT classified as running continuous monitoring',async()=>{
 fixture.runs[0].finished_at=new Date(Date.now()-60*60*1000).toISOString();
 const r=await onRequestGet(context());
 const d=await r.json();
 assert.equal(d.collector_installed_and_fresh,false);
 assert.equal(d.collector_state,'stale_or_failed');
 fixture.runs[0].finished_at=now;
});
test('wrong schema and query errors never leak database errors or expose production data',async()=>{
 fixture.version[0]={purpose:'admin-repair'};
 const bad=await onRequestGet(context());
 assert.equal(bad.status,503);
 fixture.version[0]={purpose:'monitor-only'};
 const broken={prepare(){throw Error('DO_NOT_REVEAL_PRIVATE_SQL');}};
 const r=await onRequestGet(context({storage:broken}));
 assert.equal(r.status,503);
 assert.doesNotMatch(await r.text(),/DO_NOT_REVEAL_PRIVATE_SQL/);
});
test('history and founder decision controls are actually rendered, never POST or approval interfaces',async()=>{
 const [html,js]=await Promise.all([
  readFile(new URL('../admin-next/index.html',import.meta.url),'utf8'),
  readFile(new URL('../admin-next/app.js',import.meta.url),'utf8')
 ]);
 for(const id of ['collector-badge','collector-summary','history-heartbeat',
   'history-status','watchdog-run-list','watchdog-observation-list',
   'decision-signal-list','technology-source-status'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(js,/fetchPrivateJson\('\/api\/admin\/evidence-history-v3'\)/);
 assert.match(js,/collector_installed_and_fresh/);
 assert.match(js,/String\(x\.id\)\.startsWith\('synthetic-'\)/);
 assert.doesNotMatch(js,/method:\s*['"](?:POST|PATCH|DELETE|PUT)['"]/i);
 assert.doesNotMatch(js,/innerHTML|document\.write|deploy\(/);
});
