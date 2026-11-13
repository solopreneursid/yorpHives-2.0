/** Retired owner step-up delegation. No new production authorizations. */
import {adminJson,isAdminResponse,requireOwnerStepUp,type AdminRequestContext}
 from "../../../_lib/admin-auth";
const reject=():Response=>adminJson({
 error:{code:"LEGACY_APPROVAL_RETIRED",
  message:"This legacy approval flow is retired. The founder-only Go Live process is separate."},
 execution_enabled:false,production_deployed:false
},410);
export async function onRequestGet(context:AdminRequestContext):Promise<Response>{
 const identity=await requireOwnerStepUp(context);
 if(isAdminResponse(identity))return identity;
 return reject();
}
export async function onRequestPost(context:AdminRequestContext):Promise<Response>{
 const identity=await requireOwnerStepUp(context);
 if(isAdminResponse(identity))return identity;
 return reject();
}
