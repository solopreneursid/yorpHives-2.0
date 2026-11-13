import {adminJson,isAdminResponse,requireAdmin,type AdminRequestContext} from "../../_lib/admin-auth";
import {otpUUID,otpEnabled,generateSixDigitCode,normalizeGrantRequest,
  canonicalGrantPayload,otpDigest,sendFounderMail} from "../../_lib/founder-email-otp.js";

type Selection="yorpmind"|"chatgpt"|"both";
interface Challenge {
  challenge_id:string; owner_email:string; assistant_selection:Selection;
  scope:string; permission:string; duration_minutes:number; purpose:string;
  state:string; attempts:number; expires_at:string;
}
interface MailSender {
  send(message:{from:string;to:string;subject:string;text:string}):Promise<unknown>;
}
type Context=AdminRequestContext & {env:AdminRequestContext["env"] & {
  FOUNDER_OTP_ENABLED?:string; FOUNDER_OWNER_EMAIL?:string;
  FOUNDER_OTP_HMAC_KEY?:string; FOUNDER_OTP_FROM?:string;
  FOUNDER_MAIL?:MailSender; FOUNDER_EMAIL_API_TOKEN?:string;
  FOUNDER_CF_ACCOUNT_ID?:string; ADMIN_AGENT_SERVICE?:unknown;
}};
const fail=(code:string,message:string,status:number)=>adminJson({
  error:{code,message},permission_active:false,production_allowed:false
},status);
function authenticatedOwner(context:Context,email:string):boolean{
  return !!email && !!context.env.FOUNDER_OWNER_EMAIL &&
    email.toLowerCase()===context.env.FOUNDER_OWNER_EMAIL.toLowerCase();
}
function assistantsConnected(env:Context["env"]):boolean{
  const ownerAud=new Set(String(env.CF_ACCESS_AUD||"").split(",").map(s=>s.trim()));
  const agentAud=String(env.CF_ACCESS_AGENT_AUD||"").trim();
  const a=String(env.CF_ACCESS_YORPMIND_SERVICE_TOKEN_ID||"").trim();
  const b=String(env.CF_ACCESS_CHATGPT_SERVICE_TOKEN_ID||"").trim();
  return Boolean(agentAud&&!ownerAud.has(agentAud)&&
    agentAud!==String(env.CF_ACCESS_STEP_UP_AUD||"").trim()&&
    a.length>=8&&b.length>=8&&a!==b&&env.ADMIN_AGENT_SERVICE);
}
async function schemaReady(context:Context){
  const r=await context.env.DB!.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' "+
    "AND name IN ('founder_otp_challenges','founder_temporary_grants','admin_audit_events')"
  ).all<{name:string}>();
  return new Set((r.results||[]).map(x=>x.name)).size===3;
}
function requestOK(request:Request){
  const url=new URL(request.url);
  return request.headers.get("origin")===url.origin &&
    request.headers.get("content-type")?.split(";")[0].trim()==="application/json";
}
async function parsedBody(request:Request):Promise<Record<string,unknown>|null>{
  if(Number(request.headers.get("content-length")||0)>2400)return null;
  const body=await request.text();
  if(new TextEncoder().encode(body).length>2400)return null;
  try{
    const x=JSON.parse(body);
    return x && typeof x==="object"&&!Array.isArray(x)?x:null;
  }catch{return null;}
}
export async function onRequestGet(context:Context):Promise<Response>{
  const owner=await requireAdmin(context);
  if(isAdminResponse(owner))return owner;
  if(!authenticatedOwner(context,owner.email))
    return fail("NOT_FOUNDER","Only the founder can authorize this action.",403);
  let schema=false;
  try{schema=await schemaReady(context);}catch{schema=false;}
  const email_ready=otpEnabled(context.env,owner.email)&&schema;
  const delivery_ready=otpEnabled({...context.env,FOUNDER_OTP_ENABLED:"yes"},owner.email)&&schema;
  const assistants_ready=assistantsConnected(context.env);
  return adminJson({name:"YorpHives founder email approvals",
    email_ready:false,delivery_ready,assistants_ready:false,can_request:false,
    code_digits:6,code_expires_minutes:5,owner_email_hint:owner.email.replace(/^(.{2}).*(@.*)$/,"$1•••$2"),
    collective_available:false,
    production_allowed:false});
}
export async function onRequestPost(context:Context):Promise<Response>{
  const owner=await requireAdmin(context);
  if(isAdminResponse(owner))return owner;
  if(!authenticatedOwner(context,owner.email))
    return fail("NOT_FOUNDER","Only the founder can access this legacy endpoint.",403);
  // This was the OLD assistant-grant OTP. The new Go Live OTP will be
  // independent and bound to the immutable, production-ready release.
  return fail("ASSISTANT_GRANTS_RETIRED",
    "No administrator grants can be created or activated by OTP. Production publishing has a separate founder-only approval.",410);
}
