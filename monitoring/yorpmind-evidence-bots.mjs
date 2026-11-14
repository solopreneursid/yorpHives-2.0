/**
 * YorpMind evidence bots, self-contained and model-free.
 * These are deterministic smart bots, not LLM employees. They consume only
 * already-persisted monitoring/research signals, prepare founder-review briefs
 * in isolated preview D1, and cannot reach websites, models, GitHub, owner
 * controls or production services.
 */
export const EVIDENCE_BOT_DEPARTMENTS=Object.freeze({
 engineering:{categories:['reliability','product'],classification:'investigate_issue'},
 security:{categories:['security'],classification:'investigate_issue'},
 market:{categories:['market','technology'],classification:'validate_tool_idea'},
 growth:{categories:['product','market'],classification:'growth_experiment'},
 revenue:{categories:['revenue','market','product'],classification:'revenue_hypothesis'},
 evolution:{categories:[],classification:'self_improvement'}
});
const fullEvidence=s=>typeof s?.id==='string'&&
 /^(?:watch-signal-|security-header-|radar-|market-hn-)/.test(s.id)&&
 typeof s.title==='string'&&s.title.length>=12&&s.title.length<=240&&
 typeof s.evidence_ref==='string'&&s.evidence_ref.length>=8&&
 typeof s.observed_at==='string'&&Number.isFinite(Date.parse(s.observed_at));
const stamp=()=>new Date().toISOString();
function caseFor(agent,signal){
 const isWeb=signal.id.startsWith('watch-signal-')||
  signal.id.startsWith('security-header-');
 const confidence=isWeb?'partially_supported':'unverified';
 const header={
  engineering:['Investigate the recorded website reliability or product issue.',
    'Re-run an independent GET or browser check against the exact affected system; document expected and actual results.'],
  security:['Review the observed security advisory without claiming an exploit.',
    'Verify the HTTP headers, dependency advisory or issue against vendor and configuration evidence in an isolated test.'],
  market:['Evaluate the public user problem or technology signal before proposing a product.',
    'Read the original discussion, compare multiple independent user needs, and test a demand hypothesis before prioritizing a tool.'],
  growth:['Research potential human and agent discovery or distribution improvements.',
    'Validate search intent, machine-readable API discoverability and distribution channels with original source evidence.'],
  revenue:['Assess potential monetization only after independent buyer and traffic verification.',
    'Confirm first-party revenue and qualified user demand before estimating earnings or making commercial commitments.'],
  evolution:['Review repeated verified lessons and propose an evidence-based improvement.',
    'Compare two owner-confirmed outcomes and document a reversible recommendation before requesting changes.']
 }[agent.department];
 return {
  classification:agent.department==='market'&&signal.category==='technology'?
   'research_update':EVIDENCE_BOT_DEPARTMENTS[agent.department].classification,
  title:('Review: '+signal.title).slice(0,200),
  finding:('An independent monitoring/research source recorded a '+signal.category+
   ' signal. This is a candidate for investigation, not proven business value, a confirmed exploit or a verified product failure.').slice(0,900),
  proposed_next_step:header[0],
  verification_plan:header[1],
  confidence
 };
}
/** At most one new source assignment per specialist per cycle.
 * Only agent_analysis tables may be written. Founder review and feedback
 * are NEVER auto-approved, and no model inference is performed.
 */
export async function runYorpMindEvidenceBots(db,{clock=stamp,maxAssignments=5}={}){
 if(!db?.prepare||!Number.isInteger(maxAssignments)||maxAssignments<1||maxAssignments>5)
  throw Error('Invalid read-only YorpMind bot context');
 const [m,a]=await Promise.all([
  db.prepare('SELECT purpose FROM monitor_schema_versions WHERE version=1 LIMIT 1').first(),
  db.prepare('SELECT purpose FROM yorpmind_os_schema_versions WHERE version=2 LIMIT 1').first()
 ]);
 if(m?.purpose!=='monitor-only'||a?.purpose!=='read-only-agent-analysis')
  throw Error('Isolated monitoring and YorpMind analysis schemas required');
 const [agents,signals]=await Promise.all([
  db.prepare("SELECT agent_id,department,agent_role FROM yorpmind_agent_roster WHERE status='configured' AND autonomy='observe_recommend' AND model_policy='local_only' ORDER BY department,agent_id LIMIT 10").all(),
  db.prepare("SELECT id,title,category,state,priority,evidence_ref,observed_at FROM monitor_signals WHERE state='unreviewed' ORDER BY priority DESC,observed_at DESC LIMIT 100").all()
 ]);
 const pool=(signals.results||[]).filter(fullEvidence);
 const result={source:'yorpmind_deterministic_evidence_bots',
  configured:agents.results?.length||0,model_calls:0,briefs_created:0,
  evidence_reviewed:0,failures:0,production_modified:false,
  ai_inference_verified:false,frontend_can_publish:false};
 const used=new Set();
 for(const agent of agents.results||[]){
  if(result.briefs_created>=maxAssignments)break;
  const policy=EVIDENCE_BOT_DEPARTMENTS[agent.department];
  if(!policy||agent.department==='evolution')continue;
  let selected=null;
  for(const signal of pool){
   if(!policy.categories.includes(signal.category)||used.has(signal.id))continue;
   const prior=await db.prepare(
    'SELECT brief_id FROM yorpmind_decision_briefs WHERE agent_id=? AND source_signal_id=? LIMIT 1'
   ).bind(agent.agent_id,signal.id).first();
   if(prior)continue;
   selected=signal;break;
  }
  if(!selected)continue;
  used.add(selected.id);
  result.evidence_reviewed++;
  const runId='ym-bot-'+crypto.randomUUID(),briefId='ym-brief-'+crypto.randomUUID();
  const started=clock(),brief=caseFor(agent,selected);
  try{
   await db.prepare(
    'INSERT INTO yorpmind_analysis_runs (run_id,agent_id,started_at,status,model_calls,evidence_count,model_backend) VALUES (?,?,?,?,?,?,?)'
   ).bind(runId,agent.agent_id,started,'running',0,1,'unavailable').run();
   await db.prepare(
    'INSERT INTO yorpmind_decision_briefs (brief_id,agent_id,run_id,source_signal_id,classification,title,finding,proposed_next_step,verification_plan,evidence_ref,confidence,review_state,generated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
   ).bind(briefId,agent.agent_id,runId,selected.id,brief.classification,
    brief.title,brief.finding,brief.proposed_next_step,brief.verification_plan,
    selected.evidence_ref,brief.confidence,'proposed',clock()).run();
   await db.prepare(
    'UPDATE yorpmind_analysis_runs SET status=?,completed_at=? WHERE run_id=?'
   ).bind('completed',clock(),runId).run();
   result.briefs_created++;
  }catch{
   result.failures++;
   await db.prepare('UPDATE yorpmind_analysis_runs SET status=?,completed_at=? WHERE run_id=?')
    .bind('failed',clock(),runId).run().catch(()=>{});
  }
 }
 return result;
}
