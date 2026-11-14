import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createLocalYorpMindModel,localModelEndpoint,validateModelBrief}
 from '../monitoring/yorpmind-local-model.mjs';
import {runYorpMindAnalysisCycle} from '../monitoring/yorpmind-os.mjs';
import {collectMarketCandidates,storeMarketCandidates}
 from '../monitoring/market-demand-sources.mjs';

const q=()=>({
 title:'Research the observed product problem',
 finding:'A public source suggests an unmet user need, but demand is not verified.',
 proposed_next_step:'Compare independent user conversations before proposing a new tool.',
 verification_plan:'Interview customers and verify traffic intent before any investment.'
});
const now=new Date().toISOString();
function database(){
 const core=new DatabaseSync(':memory:');
 core.exec(readFileSync(new URL('../staging/monitor-only-schema-v1.sql',import.meta.url),'utf8'));
 core.exec(readFileSync(new URL('../staging/yorpmind-readonly-os-v2.sql',import.meta.url),'utf8'));
 const sql=[];
 const adapter={prepare(query){
  assert.match(query.trim(),/^(?:SELECT|INSERT|UPDATE|DELETE)\b/i);
  sql.push(query);
  const stmt=core.prepare(query);
  return{
   bind(...p){return{
    run:async()=>({meta:{changes:stmt.run(...p).changes}}),
    all:async()=>({results:stmt.all(...p)}),
    first:async()=>stmt.get(...p)||null
   };},
   all:async()=>({results:stmt.all()}),
   first:async()=>stmt.get()||null
  };
 }};
 return{adapter,core,sql,close(){core.close();}};
}
const records=[
 ['watch-signal-home-http_500','reliability','Website home returned HTTP 500','website:home:http_500'],
 ['security-header-hsts_header_missing','security','Website home is missing HSTS transport security header','website:home:hsts'],
 ['market-hn-123','market','Ask HN: What AI tool helps small businesses?','https://news.ycombinator.com/item?id=123'],
 ['radar-tool-abc','technology','Open source tools update for agent framework','https://developers.cloudflare.com/changelog/ai/'],
 ['watch-signal-tools-invalid_json','product','Free Tools JSON discovery needs review','website:tools:invalid_json'],
 ['watch-signal-revenue-unverified','revenue','Revenue dashboard connection needs verified read-only data','website:revenue:no_source']
];
function seed(x){
 const insert=x.core.prepare('INSERT INTO monitor_signals (id,category,state,priority,title,evidence_ref,observed_at,founder_action) VALUES (?,?,?,?,?,?,?,?)');
 for(const [id,category,title,evidence_ref] of records)
  insert.run(id,category,'unreviewed',3,title,evidence_ref,now,'Review independently');
}
test('isolated YorpMind OS schema registers six observation-only employees',()=>{
 const x=database();
 try{
  const people=x.core.prepare('SELECT agent_id,department,model_policy,autonomy FROM yorpmind_agent_roster').all();
  assert.equal(people.length,6);
  assert.ok(people.every(p=>p.model_policy==='local_only'&&p.autonomy==='observe_recommend'));
  assert.deepEqual(new Set(people.map(x=>x.department)),
   new Set(['engineering','security','market','growth','revenue','evolution']));
  const tables=x.core.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);
  assert.ok(!tables.some(n=>/deploy|release|otp|payment|repair|credentials/i.test(n)));
 }finally{x.close();}
});
test('zero source evidence means zero model calls, not fake functioning employees',async()=>{
 const x=database();let calls=0;
 try{
  const r=await runYorpMindAnalysisCycle(x.adapter,{infer:async()=>{calls++;return q();}});
  assert.equal(r.model_calls,0);
  assert.equal(r.briefs_created,0);
  assert.equal(calls,0);
  assert.equal(r.insufficient_evidence,6);
 }finally{x.close();}
});
test('five different research departments create evidence-backed source references, not executable plans',async()=>{
 const x=database();seed(x);let calls=0;
 try{
  const r=await runYorpMindAnalysisCycle(x.adapter,{
   infer:async({role,department,evidence,memory})=>{
    calls++;assert.ok(role.length>16);
    assert.ok(['engineering','security','market','growth','revenue'].includes(department));
    assert.ok(evidence.evidence_ref.length>=8);
    assert.deepEqual(memory,[]);
    return q();
   }
  });
  assert.equal(r.employees_configured,6);
  assert.equal(r.model_calls,5);
  assert.equal(calls,5);
  assert.equal(r.briefs_created,5);
  assert.equal(r.insufficient_evidence,1);
  const briefs=x.core.prepare('SELECT * FROM yorpmind_decision_briefs').all();
  assert.equal(briefs.length,5);
  assert.ok(briefs.every(b=>b.review_state==='proposed'));
  assert.ok(briefs.every(b=>b.confidence!=='evidence_backed'));
  assert.ok(!x.sql.some(sql=>/UPDATE\s+monitor_signals|DELETE\s+monitor_signals/i.test(sql)));
  const repeat=await runYorpMindAnalysisCycle(x.adapter,{
   infer:async()=>{throw Error('Duplicate source should not run');}
  });
  assert.equal(repeat.model_calls,0);
 }finally{x.close();}
});
test('evolution agent uses only two founder-verified learning records',async()=>{
 const x=database();seed(x);
 try{
  await runYorpMindAnalysisCycle(x.adapter,{infer:async()=>q()});
  const briefs=x.core.prepare('SELECT brief_id,evidence_ref FROM yorpmind_decision_briefs LIMIT 2').all();
  const ins=x.core.prepare('INSERT INTO yorpmind_feedback_memory (memory_id,source_brief_id,evidence_ref,lesson,outcome,founder_reviewed,recorded_at) VALUES (?,?,?,?,?,?,?)');
  for(const [index,b] of briefs.entries())ins.run('memory-'+index,b.brief_id,b.evidence_ref,
    'Founder independently tested the recommendation and recorded an evidence-based lesson.',
    index===0?'verified_helpful':'verified_unhelpful',1,now);
  let evolved=false;
  const r=await runYorpMindAnalysisCycle(x.adapter,{infer:async(input)=>{
   if(input.department==='evolution'){
    evolved=true;assert.equal(input.memory.length,2);
    assert.ok(input.memory.every(m=>m.outcome.startsWith('verified_')));
   }
   return q();
  }});
  assert.equal(evolved,true);
  assert.equal(r.briefs_created,1);
  const decision=x.core.prepare("SELECT * FROM yorpmind_decision_briefs WHERE classification='self_improvement'").get();
  assert.equal(decision.review_state,'proposed');
  assert.notEqual(decision.confidence,'evidence_backed');
 }finally{x.close();}
});
test('local open-weight model endpoint forbids paid SaaS and non-loopback networks',()=>{
 assert.equal(localModelEndpoint('http://127.0.0.1:8080/v1'),
  'http://127.0.0.1:8080/v1/chat/completions');
 for(const addr of ['https://api.openai.com/v1','http://10.0.0.2:8080/v1',
  'http://evil.example/v1','https://localhost:8080/v1',
  'http://user:pass@localhost:8080/v1','http://localhost:8080/v1?token=secret'])
  assert.throws(()=>localModelEndpoint(addr),/Model|URL/i);
});
test('local agent inference receives bounded evidence, no functions, and generates a strict brief',async()=>{
 let requests=0;
 const infer=createLocalYorpMindModel({endpoint:'http://127.0.0.1:8080/v1',
  modelName:'local-model',
  fetcher:async(url,r)=>{
   requests++;assert.equal(url,'http://127.0.0.1:8080/v1/chat/completions');
   const body=JSON.parse(r.body);
   assert.equal(r.method,'POST');
   assert.equal(r.headers.authorization,undefined);
   assert.equal(body.tools,undefined);
   assert.equal(body.stream,false);
   return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(q())}}]}),
    {headers:{'content-type':'application/json'}});
  }});
 const result=await infer({role:'Global market research analyst',department:'market',
  evidence:{title:'Ask HN: What AI tool helps small businesses?',category:'market',
   evidence_ref:'https://news.ycombinator.com/item?id=123',observed_at:now,priority:3}});
 assert.equal(result.title,q().title);
 assert.equal(requests,1);
 assert.equal(Object.keys(result).length,4);
 assert.throws(()=>validateModelBrief({title:'Too short'}),/incomplete/i);
});
test('market radar calls only official HN public JSON, creates review candidates, and deduplicates',async()=>{
 const requests=[];
 const source=async(url)=>{
  requests.push(url);
  assert.ok(url.startsWith('https://hacker-news.firebaseio.com/v0/'));
  if(url.endsWith('askstories.json'))return Response.json([123]);
  if(url.endsWith('showstories.json'))return Response.json([456]);
  if(url.endsWith('/123.json'))return Response.json({id:123,title:'Ask HN: What AI tool helps small businesses?',score:125});
  if(url.endsWith('/456.json'))return Response.json({id:456,title:'Show HN: Open source AI agent tool for teams',score:35});
  throw Error('Unexpected URL');
 };
 const scan=await collectMarketCandidates({fetcher:source});
 assert.equal(requests.length,4);
 assert.equal(scan.candidates.length,2);
 assert.equal(scan.validated_demand,false);
 assert.equal(scan.verified_revenue,false);
 const x=database();
 try{
  assert.equal((await storeMarketCandidates(x.adapter,scan)).added,2);
  assert.equal((await storeMarketCandidates(x.adapter,scan)).added,0);
  assert.equal(x.core.prepare("SELECT COUNT(*) n FROM monitor_signals WHERE category IN ('market','product')").get().n,2);
 }finally{x.close();}
});
