import {adminJson,isAdminResponse,requireAdmin,type AdminRequestContext}
 from "../../_lib/admin-auth";

/**
 * Owner-only READ-ONLY view of YorpMind's specialist employee organization.
 * Real model run counts derive strictly from completed durable receipts.
 * Configured employee !== active agent; recommendations != approved changes.
 * Model inference is never performed inside Cloudflare Headquarters.
 */
export async function onRequestGet(context:AdminRequestContext):Promise<Response>{
 const identity=await requireAdmin(context);
 if(isAdminResponse(identity))return identity;
 if(identity.serviceToken)return adminJson({error:'Owner session required',
  production_deployment_authorized:false},403);
 if(context.env?.HQ_MONITOR_V3_MODE!=='staging')
  return adminJson({error:'Only isolated Headquarters preview can read YorpMind OS',
   production_deployment_authorized:false},503);
 const db=context.env.DB;
 if(!db)return adminJson({error:'Isolated AI OS memory unavailable',
  production_deployment_authorized:false},503);
 try{
  const v=await db.prepare(
   'SELECT purpose FROM yorpmind_os_schema_versions WHERE version=2 LIMIT 1'
  ).first<{purpose:string}>();
  if(v?.purpose!=='read-only-agent-analysis')throw Error('Wrong analysis memory schema');
  const [employees,runs,briefs,lessons]=await Promise.all([
   db.prepare(
    'SELECT agent_id,department,agent_role,model_policy,autonomy,status FROM yorpmind_agent_roster ORDER BY department,agent_id LIMIT 15'
   ).all(),
   db.prepare(
    'SELECT run_id,agent_id,started_at,completed_at,status,model_calls,evidence_count,model_backend FROM yorpmind_analysis_runs ORDER BY started_at DESC LIMIT 30'
   ).all(),
   db.prepare(
    'SELECT brief_id,agent_id,run_id,source_signal_id,classification,title,finding,proposed_next_step,verification_plan,evidence_ref,confidence,review_state,generated_at FROM yorpmind_decision_briefs ORDER BY generated_at DESC LIMIT 50'
   ).all(),
   db.prepare(
    "SELECT m.source_brief_id,m.outcome,m.founder_reviewed,m.recorded_at FROM yorpmind_feedback_memory m WHERE m.founder_reviewed=1 ORDER BY recorded_at DESC LIMIT 15"
   ).all()
  ]);
  const staff=employees.results||[],history=runs.results||[],
   proposals=briefs.results||[],memory=lessons.results||[];
  const completed=history.filter(r=>r.status==='completed');
  const body={
   schema_version:2,source:'private_yorpmind_monitoring_organization',
   monitor_only:true,production_deployment_authorized:false,
   private_model_configured_from_provider:false,
   actual_agent_inference_verified:completed.length>0,
   model_endpoint_exposed:false,repo_write_capability:false,
   employees:staff.map(s=>({
    ...s,
    activity:completed.some(r=>r.agent_id===s.agent_id)?
     'has_completed_model_run':'configured_not_proven_running'
   })),
   recent_runs:history,decision_briefs:proposals,founder_verified_feedback:memory,
   summary:{
    configured_employees:staff.filter(x=>x.status==='configured').length,
    completed_agent_runs:completed.length,
    pending_founder_reviews:proposals.filter(x=>x.review_state==='proposed').length,
    verified_learning_records:memory.filter(x=>x.outcome!=='unverified').length
   },
   limitations:{
    private_open_weight_model:'Not verified on a connected self-hosted inference server unless actual completed runs are recorded',
    agent_program_changes:'Never permitted in Headquarters',
    self_evolution:'Only evidence-linked recommendations and founder-verified lessons',
    internet_research:'Only bounded public verified sources, not unrestricted autonomous browsing',
    autonomous_market_validation:'Not established by discussion or changelog candidates'
   }
  };
  const response=adminJson(body,200);
  response.headers.set('cache-control','private, no-store');
  return response;
 }catch{
  return adminJson({source:'private_yorpmind_monitoring_organization',
   error:'YorpMind isolated analysis memory has not been installed or validated.',
   production_deployment_authorized:false},503);
 }
}
