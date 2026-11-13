import { adminJson,isAdminResponse,requireAdmin,type AdminRequestContext }
 from "../../_lib/admin-auth";
import { readLiveGoLiveReadiness } from "../../_lib/go-live-live.js";
export async function onRequestGet(context:AdminRequestContext):Promise<Response>{
 const identity=await requireAdmin(context);
 if(isAdminResponse(identity))return identity;
 const target=new URL(context.request.url).searchParams.get("target")||"website";
 if(target!=="website"&&target!=="headquarters")
  return adminJson({error:{code:"INVALID_TARGET",message:"Select website or headquarters."},
   production_deployment_enabled:false},400);
 return adminJson(await readLiveGoLiveReadiness(context.env,target));
}
