/**
 * Legacy YorpMind production delegation HISTORY ONLY.
 * No separate approvals or administrator grants. Founder Go Live is separate.
 */
import {adminJson,isAdminResponse,requireAdmin,type AdminRequestContext}
 from "../../_lib/admin-auth";
const error=(code:string,message:string,status:number):Response=>
 adminJson({error:{code,message},execution_enabled:false,production_deployed:false},status);
export async function onRequestGet(context:AdminRequestContext):Promise<Response>{
 const identity=await requireAdmin(context);
 if(isAdminResponse(identity))return identity;
 if(!context.env.DB)return error("DB_UNAVAILABLE","Headquarters history database unavailable.",503);
 try{
  const known=await context.env.DB.prepare(
   "SELECT name FROM sqlite_master WHERE type='table' AND name='yorpmind_owner_delegations'"
  ).first();
  if(!known)return error("DELEGATION_MIGRATION_REQUIRED","Private migration 0026 is required.",503);
  const rows=await context.env.DB.prepare(
   "SELECT delegation_id,repair_job_id,action,commit_sha,pull_request_number,"+
   "preview_url,state,requested_at,request_expires_at,authorized_at,authorization_expires_at,consumed_at "+
   "FROM yorpmind_owner_delegations ORDER BY requested_at DESC LIMIT 20"
  ).all();
  return adminJson({name:"YorpMind",mechanism:"retired_delegation_history",
   execution_enabled:false,can_create:false,can_authorize:false,
   production_deployed:false,delegations:rows.results||[]});
 }catch{return error("DELEGATION_HISTORY_UNAVAILABLE","Historical records cannot be inspected.",503);}
}
export async function onRequestPost(context:AdminRequestContext):Promise<Response>{
 const identity=await requireAdmin(context);
 if(isAdminResponse(identity))return identity;
 return error("LEGACY_APPROVAL_RETIRED",
  "Separate administrator or production delegation approvals are retired. The founder authorizes only a verified Go Live release.",410);
}
