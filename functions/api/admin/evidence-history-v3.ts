import {adminJson,isAdminResponse,requireAdmin,type AdminRequestContext}
 from "../../_lib/admin-auth";

/**
 * Independent scheduler's persisted audit trail, READ-ONLY on HQ.
 * Only isolated preview DB, only the five monitor-only tables.
 * HTTP caller cannot choose SQL, targets, retention, providers or action.
 */
export async function onRequestGet(context:AdminRequestContext):Promise<Response>{
 const owner=await requireAdmin(context);
 if(isAdminResponse(owner))return owner;
 if(owner.serviceToken)return adminJson({
  error:"Owner browser identity required.",production_deployment_authorized:false
 },403);
 if(context.env?.HQ_MONITOR_V3_MODE!=="staging")
  return adminJson({error:"Isolated monitoring preview required.",
   production_deployment_authorized:false},503);
 const db=context.env.DB;
 if(!db)return adminJson({error:"Independent evidence database unavailable.",
   production_deployment_authorized:false},503);
 try{
  const version=await db.prepare(
   "SELECT purpose FROM monitor_schema_versions WHERE version=1 LIMIT 1"
  ).first<{purpose:string}>();
  if(version?.purpose!=="monitor-only")throw Error("Wrong schema");
  const [runs,observations,signals]=await Promise.all([
   db.prepare(
    "SELECT id,started_at,finished_at,status FROM monitor_observation_runs WHERE collector='external-watchdog' ORDER BY started_at DESC LIMIT 30"
   ).all(),
   db.prepare(
    "SELECT o.target_id,o.observed_at,o.status,o.evidence_kind,o.note,r.status AS run_status FROM monitor_observations o JOIN monitor_observation_runs r ON r.id=o.run_id WHERE r.collector='external-watchdog' ORDER BY o.observed_at DESC LIMIT 270"
   ).all(),
   db.prepare(
    "SELECT id,category,state,priority,title,evidence_ref,observed_at,founder_action FROM monitor_signals WHERE id LIKE 'watch-signal-%' OR id LIKE 'radar-%' ORDER BY priority DESC,observed_at DESC LIMIT 100"
   ).all()
  ]);
  const safeRuns=(runs.results||[]).map(x=>({
   id:x.id,started_at:x.started_at,finished_at:x.finished_at,status:x.status
  }));
  const safeObs=(observations.results||[]).map(x=>({
   target_id:x.target_id,observed_at:x.observed_at,status:x.status,
   evidence_kind:x.evidence_kind,note:x.note,run_status:x.run_status
  }));
  const safeSignals=(signals.results||[]).map(x=>({
   id:x.id,category:x.category,state:x.state,priority:x.priority,title:x.title,
   evidence_ref:x.evidence_ref,observed_at:x.observed_at,founder_action:x.founder_action
  }));
  const latest=safeRuns[0]||null;
  const checkedMs=latest?.finished_at?Date.parse(latest.finished_at):NaN;
  const ageMs=Date.now()-checkedMs;
  const fresh=latest?.status==="completed"&&Number.isFinite(ageMs)&&
   ageMs>=0&&ageMs<=15*60*1000;
  const result={
   schema_version:1,source:"independent_readonly_watchdog_history",
   monitor_only:true,production_deployment_authorized:false,
   writes_permitted_from_headquarters:false,
   collector_installed_and_fresh:fresh,
   collector_state:fresh?"fresh":latest?"stale_or_failed":"not_installed",
   latest_run:latest,run_history:safeRuns,observations:safeObs,
   signals:safeSignals,
   counts:{recent_runs:safeRuns.length,recent_observations:safeObs.length,
    review_signals:safeSignals.filter(x=>x.state==="unreviewed").length,
    recorded_signals:safeSignals.length},
   revenue:{state:"not_connected",verified_amount:null,currency:null},
   market_sources:{state:safeSignals.some(x=>x.id.startsWith("radar-"))?
    "source_candidates_unvalidated":"not_connected"},
   alerts_outside_dashboard:{state:"not_connected",
    reason:"No independently tested outbound notification transport installed"}
  };
  const response=adminJson(result,200);
  response.headers.set("cache-control","private, no-store");
  response.headers.set("x-content-type-options","nosniff");
  return response;
 }catch{
  return adminJson({source:"independent_readonly_watchdog_history",
   error:"Historical monitoring evidence unavailable or schema incompatible.",
   production_deployment_authorized:false},503);
 }
}
