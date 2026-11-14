import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const source=await readFile(new URL('../functions/api/admin/yorpmind-os-v3.ts',import.meta.url),'utf8');
const auth=[
 "export const adminJson=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});",
 "export const isAdminResponse=x=>x instanceof Response;",
 "export const requireAdmin=async c=>c.request.headers.get('x-role')==='owner'?{serviceToken:false}:c.request.headers.get('x-role')==='ci'?{serviceToken:true}:new Response('Forbidden',{status:403});"
].join('\n');
const module=stripTypeScriptTypes(source).replace(/from ["']\.\.\/\.\.\/_lib\/admin-auth["']/,
 'from '+JSON.stringify('data:text/javascript;base64,'+Buffer.from(auth).toString('base64')));
const route=await import('data:text/javascript;base64,'+Buffer.from(module).toString('base64'));
const stamp=new Date().toISOString();
const data={
 employees:[{agent_id:'yorpmind-growth-strategist',department:'growth',agent_role:'Agent and user traffic growth analyst',model_policy:'local_only',autonomy:'observe_recommend',status:'configured'}],
 runs:[{run_id:'run-1',agent_id:'yorpmind-growth-strategist',started_at:stamp,completed_at:stamp,status:'completed',model_calls:1,evidence_count:1,model_backend:'local_open_weight'}],
 briefs:[{brief_id:'brief-1',agent_id:'yorpmind-growth-strategist',run_id:'run-1',source_signal_id:'market-hn-123',classification:'growth_experiment',title:'Evidence-linked growth research',finding:'Review public user discussions for unmet needs',proposed_next_step:'Validate the idea with a small user survey',verification_plan:'Check real demand and attribution',evidence_ref:'https://news.ycombinator.com/item?id=123',confidence:'unverified',review_state:'proposed',generated_at:stamp}],
 memory:[{source_brief_id:'brief-0',outcome:'verified_helpful',founder_reviewed:1,recorded_at:stamp}]
};
const db={prepare(sql){
 assert.match(sql,/^SELECT /);
 if(sql.includes('yorpmind_os_schema_versions'))return{first:async()=>({purpose:'read-only-agent-analysis'})};
 const kind=sql.includes('FROM yorpmind_agent_roster')?'employees':
   sql.includes('FROM yorpmind_analysis_runs')?'runs':
   sql.includes('FROM yorpmind_decision_briefs')?'briefs':
   sql.includes('FROM yorpmind_feedback_memory')?'memory':null;
 assert.ok(kind,sql);
 return{all:async()=>({results:data[kind]})};
}};
const context=(role='owner',mode='staging')=>({
 request:new Request('https://admin-staging.yorphives.com/api/admin/yorpmind-os-v3',
  {headers:{'x-role':role}}),env:{HQ_MONITOR_V3_MODE:mode,DB:db}
});
test('YorpMind OS API authenticates owner and never admits CI token to model evidence',async()=>{
 assert.equal((await route.onRequestGet(context('anonymous'))).status,403);
 assert.equal((await route.onRequestGet(context('ci'))).status,403);
 assert.equal((await route.onRequestGet(context('owner','production'))).status,503);
});
test('YorpMind OS reports only completed model inference, never executable autonomy',async()=>{
 const response=await route.onRequestGet(context());
 assert.equal(response.status,200);
 const p=await response.json();
 assert.equal(p.source,'private_yorpmind_monitoring_organization');
 assert.equal(p.monitor_only,true);
 assert.equal(p.production_deployment_authorized,false);
 assert.equal(p.repo_write_capability,false);
 assert.equal(p.model_endpoint_exposed,false);
 assert.equal(p.actual_agent_inference_verified,true);
 assert.equal(p.summary.configured_employees,1);
 assert.equal(p.summary.completed_agent_runs,1);
 assert.equal(p.summary.pending_founder_reviews,1);
 assert.equal(p.summary.verified_learning_records,1);
 assert.equal(p.employees[0].activity,'has_completed_model_run');
});
test('configured workforce does not pretend a running private model',async()=>{
 const saved=data.runs;data.runs=[];
 const response=await route.onRequestGet(context());
 const p=await response.json();
 assert.equal(p.actual_agent_inference_verified,false);
 assert.equal(p.employees[0].activity,'configured_not_proven_running');
 data.runs=saved;
});
test('YorpMind UI displays real team state, learning and source-linked recommendations without POST',async()=>{
 const [html,js]=await Promise.all([
  readFile(new URL('../admin-next/index.html',import.meta.url),'utf8'),
  readFile(new URL('../admin-next/app.js',import.meta.url),'utf8')
 ]);
 for(const id of ['yorpmind-view','ym-ai-status','ym-ai-summary','ym-roster','ym-brief-list',
  'ym-lesson-list','ym-roles-count','ym-model-runs','ym-learning-count'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(js,/fetchPrivateJson\('\/api\/admin\/yorpmind-os-v3'\)/);
 assert.match(js,/configured_not_proven_running/);
 assert.doesNotMatch(js,/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i);
 assert.doesNotMatch(js,/innerHTML|document\.write/);
 assert.doesNotMatch(source,/onRequestPost|\.run\(|\.batch\(|ADMIN_AGENT_SERVICE|github\.com/);
});
