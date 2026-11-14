import {adminJson,isAdminResponse,requireAdmin,type AdminRequestContext}
 from "../../_lib/admin-auth";

/**
 * Staged read-only HQ replacement adapter, designed for the isolated
 * monitor-only D1 schema. Not used by legacy canonical /admin.
 * No repair, Cloudflare API, AI execution, OTP, GitHub or service bindings.
 */
const MAX_OBSERVATIONS=30;
const MAX_SIGNALS=30;
function unavailable(message:string){
 return adminJson({status:"unavailable",monitor_only:true,
   source:"isolated_monitor_schema",production_deployment_authorized:false,
   message},503);
}
export async function onRequestGet(context:AdminRequestContext):Promise<Response>{
 const identity=await requireAdmin(context);
 if(isAdminResponse(identity))return identity;
 if(context.env?.HQ_MONITOR_V3_MODE!=="staging")
   return unavailable("Monitoring-only staging adapter is not enabled in this environment.");
 const db=context.env.DB;
 if(!db)return unavailable("Isolated monitoring database is not configured.");
 try{
  const version=await db.prepare(
    "SELECT purpose FROM monitor_schema_versions WHERE version=1 LIMIT 1"
  ).first<{purpose:string}>();
  if(version?.purpose!=="monitor-only")
   return unavailable("Expected monitor-only schema version was not found.");
  const [targets,runs,observations,signals]=await Promise.all([
   db.prepare("SELECT id,kind,label,public_url,enabled FROM monitor_targets ORDER BY label LIMIT 100").all(),
   db.prepare("SELECT id,started_at,finished_at,collector,status FROM monitor_observation_runs ORDER BY started_at DESC LIMIT 15").all(),
   db.prepare("SELECT o.id,o.target_id,o.observed_at,o.status,o.evidence_kind,o.note FROM monitor_observations o ORDER BY o.observed_at DESC LIMIT "+MAX_OBSERVATIONS).all(),
   db.prepare("SELECT id,category,state,priority,title,evidence_ref,observed_at,founder_action FROM monitor_signals ORDER BY priority DESC,observed_at DESC LIMIT "+MAX_SIGNALS).all()
  ]);
  return adminJson({
   schema_version:1,status:"ready_for_staging_review",monitor_only:true,
   environment:"isolated_preview_only",source:"isolated_monitor_schema",
   real_world_health_attested:false,independent_watchdog_installed:false,
   external_owner_otp_verified:false,production_deployment_authorized:false,
   counts:{targets:targets.results?.length||0,
     observation_runs:runs.results?.length||0,
     observations:observations.results?.length||0,
     signals:signals.results?.length||0},
   targets:targets.results||[],recent_runs:runs.results||[],
   observations:observations.results||[],signals:signals.results||[]
  });
 }catch{
  // Do not leak D1 schema, SQL, credentials or internal source into admin UX.
  return unavailable("The isolated monitoring schema has not been fully verified.");
 }
}
