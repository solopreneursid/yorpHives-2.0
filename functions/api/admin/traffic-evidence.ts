import {adminJson,isAdminResponse,requireAdmin,type AdminRequestContext} from "../../_lib/admin-auth";
import {mutationGuard,readBoundedJson} from "../../_lib/headquarters";
import {queryToolTraffic,saveTrafficCapture} from "../../_lib/traffic-evidence.js";

interface TrafficCapture {
 capture_id:string;capture_day:string;observed_start:string;observed_end:string;
 source:"cloudflare_http_requests_adaptive";metric:"grouped_http_request_count";
 tool_paths:number;grouped_requests:number;candidate_groups:number;result_limit:number;
 data_quality:"sampled_top_n_not_unique_visitors";recorded_at:string;
}
interface TrafficToolPath {
 slug:string;path:string;grouped_requests:number;
}
interface TrafficSnapshot {
 configured:boolean;latest:TrafficCapture|null;previous:TrafficCapture|null;
 tools:TrafficToolPath[];recent:TrafficCapture[];
 provenance:string;limitations:string[];
}
interface TrafficMutationRequest {action:"capture";}
interface TrafficMutationResponse {
 success:true;capture_id:string;capture_day:string;paths:number;
 grouped_requests:number;top_n_limited:boolean;metric:"grouped_http_request_count";
}
interface TrafficEnv {
 CF_ANALYTICS_API_TOKEN?:string;CF_ANALYTICS_ZONE_ID?:string;
}
type TrafficContext=AdminRequestContext&{env:AdminRequestContext["env"]&TrafficEnv};
const DEFAULT_ZONE_ID="1ce6b0c59175928a8687797c3cdbff2f";
const sourceNote="First-party Cloudflare HTTP request groups for Free Tools routes, not unique users, human visits, completed tasks, search impressions, agent invocations, advertising income or verified demand.";
const limits=[
 "Cloudflare Adaptive GraphQL sampling may change values between identical requests.",
 "The top 250 grouped paths may omit low-traffic tools. An absent tool does NOT mean zero usage.",
 "Both humans and bots may appear. No visitor identity or real tool-use completions are collected.",
 "Only 2xx/3xx requests on original yorphives.com hostnames and canonical Free Tools routes are counted."
];
const esc=(v:unknown)=>String(v??"").replace(/[\r\n]+/g," ").replace(/[\\`*_{}\[\]<>#|]/g,"\\$&");
export async function trafficSnapshot(db:NonNullable<AdminRequestContext["env"]["DB"]>,configured:boolean):Promise<TrafficSnapshot>{
 const [captures,latest]=await Promise.all([
  db.prepare(
   "SELECT capture_id,capture_day,observed_start,observed_end,source,metric,tool_paths,"+
   "grouped_requests,candidate_groups,result_limit,data_quality,recorded_at "+
   "FROM hq_traffic_captures ORDER BY capture_day DESC LIMIT 14"
  ).all<TrafficCapture>(),
  db.prepare(
   "SELECT capture_id FROM hq_traffic_captures ORDER BY capture_day DESC LIMIT 1"
  ).first<{capture_id:string}>()
 ]);
 let tools:TrafficToolPath[]=[];
 if(latest?.capture_id){
  const rows=await db.prepare(
   "SELECT slug,path,grouped_requests FROM hq_traffic_tool_paths WHERE capture_id=? "+
   "ORDER BY grouped_requests DESC,slug LIMIT 100"
  ).bind(latest.capture_id).all<TrafficToolPath>();
  tools=rows.results;
 }
 return {configured,latest:captures.results[0]||null,previous:captures.results[1]||null,
  tools,recent:captures.results,provenance:sourceNote,limitations:limits};
}
export function trafficResponse(request:Request,result:TrafficSnapshot):Response{
 const u=new URL(request.url),accept=request.headers.get("accept")||"";
 const asMarkdown=u.searchParams.get("format")==="markdown"||
  (!u.searchParams.has("format")&&accept.includes("text/markdown"));
 if(!asMarkdown){const response=adminJson(result);response.headers.set("vary","Accept");return response;}
 const lines=["# YorpHives first-party tool traffic evidence","",sourceNote,"",
  "Analytics configured: "+result.configured,
  "Latest capture: "+(result.latest?.capture_day||"No measurements recorded"),
  "Period: "+(result.latest?result.latest.observed_start+" — "+result.latest.observed_end:"unknown"),
  "Grouped HTTP requests represented in captured Free Tools paths: "+
    (result.latest?.grouped_requests??"not measured"),"",
  "## Observed tool routes (not unique visitors)"];
 for(const tool of result.tools)lines.push("- "+esc(tool.slug)+": "+tool.grouped_requests+" grouped HTTP requests — "+esc(tool.path));
 lines.push("","## Measurement limitations",...limits.map(l=>"- "+esc(l)),"");
 return new Response(lines.join("\n"),{headers:{
  "content-type":"text/markdown; charset=utf-8","cache-control":"no-store",
  "x-content-type-options":"nosniff","vary":"Accept"
 }});
}
export async function onRequestGet(context:TrafficContext):Promise<Response>{
 const identity=await requireAdmin(context);
 if(isAdminResponse(identity))return identity;
 const configured=Boolean(context.env.CF_ANALYTICS_API_TOKEN);
 return trafficResponse(context.request,await trafficSnapshot(context.env.DB!,configured));
}
export async function onRequestPost(context:TrafficContext):Promise<Response>{
 const identity=await requireAdmin(context);
 if(isAdminResponse(identity))return identity;
 const forbidden=mutationGuard(context.request);
 if(forbidden)return forbidden;
 let value:unknown;
 try{value=await readBoundedJson(context.request);}
 catch{return adminJson({error:{message:"Valid bounded JSON is required."}},400);}
 if(!value||typeof value!=="object"||Array.isArray(value)||
   Object.keys(value).length!==1||(value as Record<string,unknown>).action!=="capture")
   return adminJson({error:{message:"Only the bounded capture action is supported."}},400);
 const env=context.env;
 if(!env.CF_ANALYTICS_API_TOKEN)
   return adminJson({error:{message:"Cloudflare Analytics read-only token is not configured."}},503);
 const day=new Date().toISOString().slice(0,10);
 const already=await env.DB!.prepare(
  "SELECT capture_id FROM hq_traffic_captures WHERE capture_day=?"
 ).bind(day).first<{capture_id:string}>();
 if(already)return adminJson({error:{message:"Today's first-party traffic snapshot already exists. No additional query was made."}},409);
 let observation;
 try{
  observation=await queryToolTraffic(env.CF_ANALYTICS_API_TOKEN,
   env.CF_ANALYTICS_ZONE_ID||DEFAULT_ZONE_ID);
 }catch(error){
  const safeMessage=error instanceof Error?error.message:"Analytics request failed";
  return adminJson({error:{message:safeMessage.slice(0,300)}},502);
 }
 try{
  const saved=await saveTrafficCapture(env.DB!,observation,identity.email);
  if(!saved.created||!saved.capture_id)
   return adminJson({error:{message:"Capture already stored. Retry tomorrow."}},409);
  const result:TrafficMutationResponse={success:true,capture_id:saved.capture_id,
   capture_day:observation.capture_day,paths:observation.tools.length,
   grouped_requests:observation.request_count,top_n_limited:observation.top_n_limited,
   metric:"grouped_http_request_count"};
  return adminJson(result,201);
 }catch(error){
  console.error("HQ traffic capture database insert failed",error instanceof Error?error.message:"error");
  return adminJson({error:{message:"The analytics results could not be saved to the private database."}},503);
 }
}
