/** Retired founder/assistant OTP service.
 * Historical challenge records may be inspected through separately
 * authenticated archive endpoints. Never read OTP secrets, call mail services
 * or query the shared database to offer a new release/AI grant challenge.
 */
import {adminJson,isAdminResponse,requireAdmin,type AdminRequestContext}
  from "../../_lib/admin-auth";

const disabled=()=>adminJson({
  error:{code:"ASSISTANT_GRANTS_RETIRED",
    message:"Headquarters is monitoring-only. It cannot send OTP codes, grant AI permissions, start repairs or authorize releases."},
  email_ready:false,delivery_ready:false,assistants_ready:false,
  can_request:false,collective_available:false,production_allowed:false
},410);

export async function onRequestGet(context:AdminRequestContext):Promise<Response>{
  const owner=await requireAdmin(context);
  if(isAdminResponse(owner))return owner;
  return adminJson({
    name:"Retired founder email approvals",email_ready:false,
    delivery_ready:false,assistants_ready:false,can_request:false,
    collective_available:false,production_allowed:false,
    owner_email_hint:"not applicable",status:"monitor_only",
    explanation:"No OTP or administrator-grant system operates inside Headquarters."
  });
}
export async function onRequestPost(context:AdminRequestContext):Promise<Response>{
  const owner=await requireAdmin(context);
  if(isAdminResponse(owner))return owner;
  return disabled();
}
