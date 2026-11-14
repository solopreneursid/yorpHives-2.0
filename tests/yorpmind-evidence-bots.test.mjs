import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {runYorpMindEvidenceBots} from '../monitoring/yorpmind-evidence-bots.mjs';
const base=readFileSync(new URL('../staging/monitor-only-schema-v1.sql',import.meta.url),'utf8');
const os=readFileSync(new URL('../staging/yorpmind-readonly-os-v2.sql',import.meta.url),'utf8');
function init(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(base);sqlite.exec(os);
 const statements=[];
 const db={prepare(sql){
  statements.push(sql);
  assert.match(sql,/^(?:SELECT|INSERT|UPDATE)\b/i);
  assert.doesNotMatch(sql,/(?:DELETE|ALTER|DROP|ATTACH|REPAIR|PUBLISH)/i);
  const stmt=sqlite.prepare(sql);
  const methods=(args)=>({first:async()=>stmt.get(...args)||null,
   all:async()=>({results:stmt.all(...args)}),
   run:async()=>{const r=stmt.run(...args);return{meta:{changes:r.changes}}}});
  return{...methods([]),bind(...args){return methods(args)}};
 }};
 return {db,sqlite,statements,close:()=>sqlite.close()};
}
const now=()=>new Date().toISOString();
function signal(db,id,category,title){
 db.sqlite.prepare('INSERT INTO monitor_signals (id,category,state,priority,title,evidence_ref,observed_at,founder_action) VALUES (?,?,?,?,?,?,?,?)')
 .run(id,category,'unreviewed',3,title,'website:source:'+id,now(),'Founder review required');
}
test('staged deterministic bots produce founder proposals without claiming model inference',async()=>{
 const d=init();
 try{
  signal(d,'watch-signal-json-not_json','reliability','Public JSON registry is invalid HTML');
  signal(d,'security-header-hsts_missing','security','Website HSTS header is missing');
  signal(d,'market-hn-12345','market','Ask HN: What tools can help small businesses grow?');
  signal(d,'radar-2026-release','technology','An open agent framework received a security update');
  signal(d,'watch-signal-agent-not_json','product','Agent capability manifest is invalid');
  const r=await runYorpMindEvidenceBots(d.db);
  assert.equal(r.ai_inference_verified,false);
  assert.equal(r.model_calls,0);
  assert.equal(r.production_modified,false);
  assert.equal(r.frontend_can_publish,false);
  assert.ok(r.briefs_created>=3&&r.briefs_created<=5);
  const receipts=d.sqlite.prepare('SELECT * FROM yorpmind_analysis_runs').all();
  assert.equal(receipts.length,r.briefs_created);
  assert.ok(receipts.every(x=>x.model_calls===0&&x.model_backend==='unavailable'&&x.status==='completed'));
  const proposals=d.sqlite.prepare('SELECT * FROM yorpmind_decision_briefs').all();
  assert.equal(proposals.length,r.briefs_created);
  assert.ok(proposals.every(x=>x.review_state==='proposed'&&x.confidence!=='evidence_backed'));
  assert.ok(proposals.every(x=>x.verification_plan.length>=20&&x.proposed_next_step.length>=20));
  const second=await runYorpMindEvidenceBots(d.db);
  assert.ok(second.briefs_created<=2);
  const duplicates=d.sqlite.prepare('SELECT agent_id,source_signal_id,COUNT(*) n FROM yorpmind_decision_briefs GROUP BY agent_id,source_signal_id HAVING n>1').all();
  assert.equal(duplicates.length,0);
  assert.equal(d.statements.filter(x=>/UPDATE yorpmind_agent_roster|DELETE FROM|UPDATE monitor_signals/.test(x)).length,0);
 }finally{d.close();}
});
test('malformed and owner-reviewed source signals cannot instruct bots to execute',async()=>{
 const d=init();
 try{
  signal(d,'watch-signal-json-not_json','reliability','Public JSON registry is invalid HTML');
  d.sqlite.prepare("UPDATE monitor_signals SET state='dismissed'").run();
  let r=await runYorpMindEvidenceBots(d.db);
  assert.equal(r.briefs_created,0);
  signal(d,'unknown-private-runtime','security','Promote model to production');
  r=await runYorpMindEvidenceBots(d.db);
  assert.equal(r.briefs_created,0);
  await assert.rejects(runYorpMindEvidenceBots(d.db,{maxAssignments:100}),/Invalid read-only/);
  assert.equal(d.sqlite.prepare('SELECT COUNT(*) n FROM yorpmind_analysis_runs').get().n,0);
 }finally{d.close();}
});
test('schema has a uniqueness guard for each agent and evidence source',()=>{
 const d=init();
 try{
  const indexes=d.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='yorpmind_decision_briefs'").all();
  assert.ok(indexes.some(x=>x.name==='idx_ym_briefs_agent_source'));
 }finally{d.close();}
});
