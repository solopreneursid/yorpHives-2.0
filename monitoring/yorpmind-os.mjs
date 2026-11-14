/**
 * YorpMind AI OS — evidence-bound, private-model, multi-employee coordinator.
 *
 * Intelligence is autonomous in analysis ONLY; it cannot modify YorpHives
 * source, security, payments, deployment, employees' privileges or model code.
 * All SQL mutation is restricted to isolated monitoring ANALYSIS records.
 * Existing main HQ repair/mission database is never accessed.
 */
import {randomUUID} from 'node:crypto';
import {validateModelBrief} from './yorpmind-local-model.mjs';

export const YORPMIND_DEPARTMENTS=Object.freeze({
 engineering:Object.freeze({categories:['reliability','product'],classification:'investigate_issue'}),
 security:Object.freeze({categories:['security'],classification:'investigate_issue'}),
 market:Object.freeze({categories:['market','technology'],classification:'validate_tool_idea'}),
 growth:Object.freeze({categories:['product','market'],classification:'growth_experiment'}),
 revenue:Object.freeze({categories:['revenue','market','product'],classification:'revenue_hypothesis'}),
 evolution:Object.freeze({categories:[],classification:'self_improvement'})
});
const MAX_EMPLOYEES_PER_CYCLE=6;
const MAX_AGE_DAYS=30;
const iso=()=>new Date().toISOString();
function classification(dept,signal){
 if(dept==='market'&&signal.category==='technology')return'research_update';
 return YORPMIND_DEPARTMENTS[dept].classification;
}
function provenance(signal){
 return typeof signal?.id==='string'&&
  /^(?:watch-signal-|security-header-|radar-|market-hn-)/.test(signal.id)&&
  typeof signal.evidence_ref==='string'&&signal.evidence_ref.length>=8&&
  signal.state==='unreviewed'&&Number.isSafeInteger(signal.priority)&&
  signal.priority>=1&&signal.priority<=5&&
  typeof signal.title==='string'&&signal.title.length>=16&&
  signal.title.length<=240&&
  typeof signal.observed_at==='string'&&
  Number.isFinite(Date.parse(signal.observed_at));
}
function classifyConfidence(signal){
 // An actual public HEAD/HTTP anomaly can partially support an investigation
 // but does not prove an exploit or a broken website feature.
 return signal.id.startsWith('watch-signal-')||signal.id.startsWith('security-header-')?
  'partially_supported':'unverified';
}
export async function runYorpMindAnalysisCycle(db,{
 infer,clock=iso,maxCalls=MAX_EMPLOYEES_PER_CYCLE
}={}){
 if(!db?.prepare||typeof infer!=='function'||
    !Number.isInteger(maxCalls)||maxCalls<1||maxCalls>MAX_EMPLOYEES_PER_CYCLE)
  throw Error('Private local inference and isolated monitoring storage required');
 const [monitor,version]=await Promise.all([
  db.prepare('SELECT purpose FROM monitor_schema_versions WHERE version=1 LIMIT 1').first(),
  db.prepare('SELECT purpose FROM yorpmind_os_schema_versions WHERE version=2 LIMIT 1').first()
 ]);
 if(monitor?.purpose!=='monitor-only'||version?.purpose!=='read-only-agent-analysis')
  throw Error('YorpMind isolated analysis schema is not installed');
 const [roster,records,memories]=await Promise.all([
  db.prepare("SELECT agent_id,department,agent_role,status FROM yorpmind_agent_roster WHERE status='configured' ORDER BY agent_id").all(),
  db.prepare("SELECT id,title,category,state,priority,evidence_ref,observed_at FROM monitor_signals WHERE state='unreviewed' ORDER BY priority DESC,observed_at DESC LIMIT 80").all(),
  db.prepare("SELECT m.lesson,m.outcome,b.source_signal_id FROM yorpmind_feedback_memory m JOIN yorpmind_decision_briefs b ON b.brief_id=m.source_brief_id WHERE m.founder_reviewed=1 AND m.outcome IN ('verified_helpful','verified_unhelpful') ORDER BY m.recorded_at DESC LIMIT 5").all()
 ]);
 const agents=(roster.results||[]).filter(a=>YORPMIND_DEPARTMENTS[a.department]&&
   typeof a.agent_role==='string'&&a.agent_role.length>16&&
   typeof a.agent_id==='string'&&a.agent_id.startsWith('yorpmind-')).slice(0,MAX_EMPLOYEES_PER_CYCLE);
 const signals=(records.results||[]).filter(provenance);
 const lessons=(memories.results||[]).filter(m=>typeof m.lesson==='string'&&
  m.lesson.length>=25&&m.lesson.length<=900).slice(0,5);
 const result={source:'private_open_weight_analyst_organization',
  employees_configured:agents.length,model_calls:0,
  briefs_created:0,failed:0,insufficient_evidence:0,
  production_execution_enabled:false,external_tool_execution_enabled:false,
  revenue_verified:false,employees:[]};
 const used=new Set();
 const earliest=Date.now()-MAX_AGE_DAYS*86400000;
 for(const agent of agents){
  if(result.model_calls>=maxCalls)break;
  const policy=YORPMIND_DEPARTMENTS[agent.department];
  let candidate=null;
  if(agent.department==='evolution'){
   if(lessons.length>=2){
    candidate=signals.find(s=>s.id===lessons[0].source_signal_id)||
      signals.find(s=>policy.categories.includes(s.category))||null;
   }
  }else candidate=signals.find(s=>policy.categories.includes(s.category)&&
    !used.has(s.id)&&Date.parse(s.observed_at)>=earliest)||null;
  if(!candidate){result.insufficient_evidence++;result.employees.push({
   agent_id:agent.agent_id,status:'insufficient_evidence'});continue;}
  // No repeated model call or duplicate recommendation for same agent +
  // original source. Novel evidence can be analyzed in a later cycle.
  const previous=await db.prepare(
   'SELECT brief_id FROM yorpmind_decision_briefs WHERE agent_id=? AND source_signal_id=? LIMIT 1'
  ).bind(agent.agent_id,candidate.id).first();
  if(previous){result.employees.push({agent_id:agent.agent_id,
    status:'previously_reviewed_source'});continue;}
  used.add(candidate.id);
  const id='ym-run-'+randomUUID(),when=clock();
  await db.prepare(
   'INSERT INTO yorpmind_analysis_runs (run_id,agent_id,started_at,status,model_calls,evidence_count,model_backend) VALUES (?,?,?,?,?,?,?)'
  ).bind(id,agent.agent_id,when,'running',1,1,'local_open_weight').run();
  result.model_calls++;
  try{
   const answer=validateModelBrief(await infer({
    role:agent.agent_role,department:agent.department,evidence:candidate,
    memory:lessons.map(m=>({outcome:m.outcome,lesson:m.lesson}))
   }));
   // A model cannot upgrade the evidence confidence classification.
   const confidence=classifyConfidence(candidate),briefId='ym-brief-'+randomUUID();
   await db.prepare(
    'INSERT INTO yorpmind_decision_briefs (brief_id,agent_id,run_id,source_signal_id,classification,title,finding,proposed_next_step,verification_plan,evidence_ref,confidence,review_state,generated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
   ).bind(briefId,agent.agent_id,id,candidate.id,
    classification(agent.department,candidate),answer.title,answer.finding,
    answer.proposed_next_step,answer.verification_plan,
    candidate.evidence_ref,confidence,'proposed',clock()).run();
   await db.prepare(
    'UPDATE yorpmind_analysis_runs SET status=?,completed_at=? WHERE run_id=?'
   ).bind('completed',clock(),id).run();
   result.briefs_created++;
   result.employees.push({agent_id:agent.agent_id,status:'proposal_created',
    source_signal_id:candidate.id,confidence});
  }catch{
   await db.prepare(
    'UPDATE yorpmind_analysis_runs SET status=?,completed_at=? WHERE run_id=?'
   ).bind('failed',clock(),id).run().catch(()=>{});
   result.failed++;
   result.employees.push({agent_id:agent.agent_id,status:'local_model_failed'});
  }
 }
 return result;
}
