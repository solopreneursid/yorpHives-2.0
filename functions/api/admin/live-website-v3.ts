import {adminJson,isAdminResponse,requireAdmin,type AdminRequestContext}
 from "../../_lib/admin-auth";
import {runLiveWebsiteSnapshot} from "../../../admin-monitor/live-website-evidence.js";

/**
 * Read-only outside-in website snapshot, activated only in isolated HQ preview.
 * No arbitrary target inputs, owner data, D1 writes, GitHub, AI, repairs, OTP
 * or publishing. One GET performs fixed public HTTPS GET checks.
 */
export async function onRequestGet(context:AdminRequestContext):Promise<Response>{
 const identity=await requireAdmin(context);
 if(isAdminResponse(identity))return identity;
 if(identity.serviceToken)return adminJson({
  source:"live_public_website_get_only",error:"Owner browser session required.",
  production_deployment_authorized:false
 },403);
 if(context.env?.HQ_MONITOR_V3_MODE!=="staging")
  return adminJson({
   source:"live_public_website_get_only",error:"Only isolated preview can run live evidence.",
   production_deployment_authorized:false
  },503);
 try{
  const evidence=await runLiveWebsiteSnapshot();
  const response=adminJson(evidence,200);
  response.headers.set("cache-control","private, no-store");
  response.headers.set("x-content-type-options","nosniff");
  return response;
 }catch{
  return adminJson({
   source:"live_public_website_get_only",error:"Live public website checks unavailable.",
   production_deployment_authorized:false,observations:[],integrations:{}
  },503);
 }
}
