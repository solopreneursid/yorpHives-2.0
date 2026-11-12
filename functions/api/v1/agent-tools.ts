import {verifyAdminAccess,type AdminEnv} from "../../_lib/admin-auth";
import {recordActivity,CHANNELS} from "../../_lib/tool-activity.js";

interface AgentToolEnv extends AdminEnv {
 HQ_TOOL_SERVICE_TOKEN_IDS?:string;
 DB?:AdminEnv["DB"];
}
interface Context {request:Request;env:AgentToolEnv;}
export interface AgentToolRequest {tool:"sha256-text"|"json-compact";input:string;}
export interface AgentToolResponse {
 tool:AgentToolRequest["tool"];output:string;
 execution:"access_authenticated_server_execution";
 metric_recorded:true;scope:"private_service_token";
}
export interface ToolDefinition {
 name:AgentToolRequest["tool"];description:string;max_input_bytes:8192;
 access:"cloudflare_access_service_token";side_effects:"none";
}
const TOOLS:ToolDefinition[]=[
 {name:"sha256-text",description:"Compute a SHA-256 digest of supplied UTF-8 text. Not intended for password storage.",
  max_input_bytes:8192,access:"cloudflare_access_service_token",side_effects:"none"},
 {name:"json-compact",description:"Validate and compact a JSON document without storing its contents.",
  max_input_bytes:8192,access:"cloudflare_access_service_token",side_effects:"none"}
];
const json=(result:unknown,status:number)=>Response.json(result,{
 status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});
export async function onRequestGet({request,env}:Context):Promise<Response>{
 const enabled=Boolean(env.HQ_TOOL_SERVICE_TOKEN_IDS?.trim());
 const data={tools:TOOLS,available_for_execution:enabled,
  execution_access:"separate allowlisted Cloudflare Access service token",
  privacy:"Inputs and outputs are not stored. Only successful, scoped authenticated execution counts are aggregated.",
  not_a_public_mcp_server:true};
 const url=new URL(request.url);
 if(url.searchParams.get("format")==="markdown"||(request.headers.get("accept")||"").includes("text/markdown")){
  const content=["# YorpHives private agent tool prototype","",
   "Enabled for authenticated executions: "+enabled,
   "Discovery does not imply public access or a production MCP service.",
   "Credentials: separately allowlisted Cloudflare Access service tokens.",
   "No payment and no persistent input/output storage.","",
   ...TOOLS.flatMap(t=>["## "+t.name,t.description,
    "Max input: "+t.max_input_bytes+" bytes; side effects: none.",""])].join("\n");
  return new Response(content,{headers:{"content-type":"text/markdown; charset=utf-8",
   "vary":"Accept","cache-control":"no-store","x-content-type-options":"nosniff"}});
 }
 return json(data,200);
}
export async function onRequestPost({request,env}:Context):Promise<Response>{
 if(!env.DB)return json({error:"Execution database is unavailable."},503);
 const serviceIds=(env.HQ_TOOL_SERVICE_TOKEN_IDS||"").trim();
 if(!serviceIds)return json({error:"Agent execution is not enabled for this environment."},503);
 // CI's existing Admin token is NEVER permitted to execute a service.
 const identity=await verifyAdminAccess(request,{
  ...env,ADMIN_ALLOWED_EMAILS:"",
  ADMIN_CI_SERVICE_TOKEN_IDS:serviceIds
 });
 if(!identity?.serviceToken)return json({error:"A separately authorized service token is required."},401);
 const suppliedOrigin=request.headers.get("origin");
 if(suppliedOrigin&&suppliedOrigin!==new URL(request.url).origin)
  return json({error:"Cross-origin agent execution is not allowed."},403);
 if(!(request.headers.get("content-type")||"").toLowerCase().startsWith("application/json"))
  return json({error:"Expected application/json."},415);
 if(Number(request.headers.get("content-length")||0)>8700)
  return json({error:"Request exceeds the 8KB input budget."},413);
 let candidate:unknown;
 try{
  const text=await request.text();
  if(text.length>8700)return json({error:"Request exceeds size budget."},413);
  candidate=JSON.parse(text);
 }catch{return json({error:"Invalid JSON request."},400);}
 if(!candidate||typeof candidate!=="object"||Array.isArray(candidate))
  return json({error:"Expected one tool and a string input."},400);
 const body=candidate as Record<string,unknown>;
 if(Object.keys(body).length!==2||!["sha256-text","json-compact"].includes(String(body.tool))||
  typeof body.input!=="string"||
  new TextEncoder().encode(body.input).byteLength>8192)
  return json({error:"Unsupported tool or input exceeds the 8KB limit."},400);
 const tool=body.tool as AgentToolRequest["tool"];
 let output:string;
 try{
  if(tool==="sha256-text"){
   const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(body.input));
   output=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
  }else{
   output=JSON.stringify(JSON.parse(body.input));
   if(output===undefined||output.length>16000)throw Error("Input cannot be normalized.");
  }
 }catch{return json({error:"Input failed validation; no execution was counted."},422);}
 // Only after real successful server execution do we aggregate the agent count.
 // No user payloads, token contents or caller identity are persisted.
 try{
  const receipt=await recordActivity(env.DB,tool,CHANNELS.AGENT);
  if(!receipt.accepted)return json({error:"Execution not registered or daily limit reached."},429);
 }catch{return json({error:"Execution metrics unavailable; result was not released."},503);}
 const data:AgentToolResponse={tool,output,execution:"access_authenticated_server_execution",
  metric_recorded:true,scope:"private_service_token"};
 const url=new URL(request.url);
 if(url.searchParams.get("format")==="markdown"||(request.headers.get("accept")||"").includes("text/markdown")){
  return new Response(["# Authenticated tool execution","",
   "Tool: "+tool,"Result:","",
   ...output.split("\n").map(line=>"    "+line),"",
   "Successful server execution was counted; input and output were not stored."].join("\n"),
   {headers:{"content-type":"text/markdown; charset=utf-8","cache-control":"no-store",
    "vary":"Accept","x-content-type-options":"nosniff"}});
 }
 return json(data,200);
}
