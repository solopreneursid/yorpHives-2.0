import {recordActivity,CHANNELS} from "../../_lib/tool-activity.js";

interface BrowserActivityEnv {
 DB?:{
  prepare(query:string):{
   bind(...values:unknown[]):{first<T>():Promise<T|null>};
   first<T>():Promise<T|null>;
  };
 };
}
interface Context {request:Request;env:BrowserActivityEnv;}
export interface BrowserActivityRequest {slug:string;event:"completed";}
export interface BrowserActivityResponse {
 accepted:boolean;metric:"browser_client_reported";verified_server_execution:false;
 reason?:"not_instrumented"|"daily_budget_exhausted";
}
function json(data:unknown,status:number):Response{
 return Response.json(data,{status,headers:{"cache-control":"no-store",
  "x-content-type-options":"nosniff","access-control-allow-origin":"null"}});
}
export async function onRequestPost({request,env}:Context):Promise<Response>{
 if(!env.DB)return json({error:"Tool activity is not configured."},503);
 const site=new URL(request.url).origin;
 // A matching Origin blocks cross-site browser posts but is not proof of a
 // genuine human or of a successfully executed tool. Never claim otherwise.
 if(request.headers.get("origin")!==site)return json({error:"Same-origin only."},403);
 const fetchSite=request.headers.get("sec-fetch-site");
 if(fetchSite&&fetchSite!=="same-origin")return json({error:"Cross-site request."},403);
 if(!(request.headers.get("content-type")||"").toLowerCase().startsWith("application/json"))
  return json({error:"Expected JSON."},415);
 const contentLength=Number(request.headers.get("content-length")||0);
 if(contentLength>180)return json({error:"Event exceeds size limit."},413);
 let payload:unknown;
 try{
  const raw=await request.text();
  if(raw.length>180)return json({error:"Event exceeds size limit."},413);
  payload=JSON.parse(raw);
 }catch{return json({error:"Invalid JSON."},400);}
 if(!payload||typeof payload!=="object"||Array.isArray(payload))
  return json({error:"Invalid activity."},400);
 const value=payload as Record<string,unknown>;
 if(Object.keys(value).length!==2||value.event!=="completed"||
  typeof value.slug!=="string"||!/^[a-z0-9](?:[a-z0-9-]{1,70}[a-z0-9])$/.test(value.slug))
  return json({error:"Only registered successful tool actions are accepted."},400);
 try{
  const receipt=await recordActivity(env.DB,value.slug,CHANNELS.BROWSER);
  const response:BrowserActivityResponse={accepted:receipt.accepted,
   metric:"browser_client_reported",verified_server_execution:false,
   ...(receipt.accepted?{}:{reason:receipt.reason})};
  return json(response,202);
 }catch{
  return json({error:"Activity could not be aggregated."},503);
 }
}
