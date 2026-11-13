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
    email_ready,delivery_ready,assistants_ready,can_request:email_ready&&assistants_ready,
    code_digits:6,code_expires_minutes:5,owner_email_hint:owner.email.replace(/^(.{2}).*(@.*)$/,"$1•••$2"),
    collective_available:email_ready&&assistants_ready,
    production_allowed:false});
}
export async function onRequestPost(context:Context):Promise<Response>{
  const owner=await requireAdmin(context);
  if(isAdminResponse(owner))return owner;
  if(!authenticatedOwner(context,owner.email))
    return fail("NOT_FOUNDER","Only the founder can authorize assistant access.",403);
  if(!requestOK(context.request))
    return fail("INVALID_ORIGIN","Use the private Headquarters page.",403);
  const body=await parsedBody(context.request);
  if(!body)return fail("INVALID_REQUEST","Invalid approval request.",400);
  if(body.action==="cancel"){
    if(!otpUUID.test(String(body.challenge_id||""))||Object.keys(body).length!==2)
      return fail("INVALID_CHALLENGE","Choose an existing approval code.",400);
    try{
      const updated=await context.env.DB!.prepare(
        "UPDATE founder_otp_challenges SET state='cancelled' "+
        "WHERE challenge_id=? AND owner_email=? AND state IN ('issuing','sent')"
      ).bind(body.challenge_id,owner.email).run();
      return adminJson({cancelled:true,
        previously_pending:Number(updated.meta?.changes||0)>0,production_allowed:false});
    }catch{return fail("CANCEL_UNAVAILABLE","Could not cancel the code request.",503);}
  }
  if(!otpEnabled(context.env,owner.email))
    return fail("EMAIL_NOT_READY","Founder email verification is not configured.",503);
  if(!assistantsConnected(context.env))
    return fail("ASSISTANTS_NOT_READY",
      "The assistants' separately verified private connections are not configured.",503);
  try{
    if(!await schemaReady(context))
      return fail("SCHEMA_NOT_READY","The founder approval database is not ready.",503);
  }catch{return fail("SCHEMA_NOT_READY","The founder approval database is unavailable.",503);}
  const db=context.env.DB!;
  if(body.action==="send"){
    const grant=normalizeGrantRequest(body);
    if(!grant)return fail("INVALID_SCOPE","Select an assistant, a short time, and permitted work.",400);
    const now=new Date(),timestamp=now.toISOString();
    try{
      const counts=await db.prepare(
        "SELECT SUM(CASE WHEN created_at>? THEN 1 ELSE 0 END) AS last_hour,"+
        "COUNT(*) AS last_day FROM founder_otp_challenges "+
        "WHERE owner_email=? AND created_at>?"
      ).bind(new Date(now.getTime()-60*60_000).toISOString(),
        owner.email,new Date(now.getTime()-24*60*60_000).toISOString())
        .first<{last_hour:number;last_day:number}>();
      if(Number(counts?.last_hour||0)>=3||Number(counts?.last_day||0)>=12)
        return fail("TOO_MANY_CODES","Too many email codes requested. Try again later.",429);
      const id=crypto.randomUUID();
      const code=generateSixDigitCode();
      const payload=canonicalGrantPayload(grant);
      const digest=await otpDigest(context.env.FOUNDER_OTP_HMAC_KEY!,id,owner.email,payload,code);
      const expires=new Date(now.getTime()+5*60_000).toISOString();
      await db.prepare(
        "UPDATE founder_otp_challenges SET state='cancelled' "+
        "WHERE owner_email=? AND state IN ('issuing','sent')"
      ).bind(owner.email).run();
      await db.prepare(
        "INSERT INTO founder_otp_challenges "+
        "(challenge_id,owner_email,assistant_selection,scope,permission,duration_minutes,"+
        "purpose,code_hmac,state,attempts,created_at,expires_at) "+
        "VALUES(?,?,?,?,?,?,?,?, 'issuing',0,?,?)"
      ).bind(id,owner.email,grant.assistant,grant.scope,grant.permission,
        grant.duration_minutes,grant.purpose,digest,timestamp,expires).run();
      try{
        const destination=owner.email;
        await sendFounderMail(context.env,{
          from:context.env.FOUNDER_OTP_FROM!,to:destination,
          subject:"YorpHives Founder Control · one-time approval code",
          text:"Your YorpHives approval code is "+code+"\n"+
            "Assistant: "+(grant.assistant==="both"?"YorpMind and ChatGPT":grant.assistant)+"\n"+
            "Work: "+grant.permission+" / "+grant.scope+"\n"+
            "Duration: "+grant.duration_minutes+" minutes\n"+
            "This code expires after 5 minutes and can be used once. "+
            "If you did not request this, do not share it.\n"
        });

      }catch{
        await db.prepare(
          "UPDATE founder_otp_challenges SET state='cancelled' "+
          "WHERE challenge_id=? AND state='issuing'"
        ).bind(id).run().catch(()=>null);
        return fail("EMAIL_FAILED","The approval email could not be sent. No access was granted.",503);
      }
      const sent=await db.prepare(
        "UPDATE founder_otp_challenges SET state='sent',sent_at=? "+
        "WHERE challenge_id=? AND owner_email=? AND state='issuing' RETURNING challenge_id"
      ).bind(new Date().toISOString(),id,owner.email).first<{challenge_id:string}>();
      if(!sent)return fail("EMAIL_UNCONFIRMED","The code request could not be confirmed.",503);
      return adminJson({status:"code_sent",challenge_id:id,expires_at:expires,
        selected_assistants:grant.assistant,permission_active:false,production_allowed:false},201);
    }catch{return fail("REQUEST_FAILED","The approval request could not be prepared.",503);}
  }
  if(body.action==="verify"){
    if(!otpUUID.test(String(body.challenge_id||""))||
       typeof body.code!=="string"||!/^[0-9]{6}$/.test(body.code))
      return fail("INVALID_CODE","Enter the six-digit code from your email.",400);
    const id=String(body.challenge_id);
    try{
      const challenge=await db.prepare(
        "SELECT challenge_id,owner_email,assistant_selection,scope,permission,"+
        "duration_minutes,purpose,state,attempts,expires_at "+
        "FROM founder_otp_challenges WHERE challenge_id=? AND owner_email=?"
      ).bind(id,owner.email).first<Challenge>();
      const now=new Date(),ts=now.toISOString();
      if(!challenge||challenge.state!=="sent"||challenge.expires_at<=ts||challenge.attempts>=5)
        return fail("CODE_EXPIRED","This code has expired or was already used. Request a new one.",409);
      const grant={assistant:challenge.assistant_selection,scope:challenge.scope,
        permission:challenge.permission,duration_minutes:challenge.duration_minutes,
        purpose:challenge.purpose};
      const expected=await otpDigest(context.env.FOUNDER_OTP_HMAC_KEY!,id,owner.email,
        canonicalGrantPayload(grant),body.code);
      // Atomic consume/attempt limit: concurrent submissions cannot both pass.
      const outcome=await db.prepare(
        "UPDATE founder_otp_challenges SET attempts=attempts+1,"+
        "state=CASE WHEN code_hmac=? THEN 'used' "+
        "WHEN attempts+1>=5 THEN 'cancelled' ELSE 'sent' END,"+
        "consumed_at=CASE WHEN code_hmac=? THEN ? ELSE consumed_at END "+
        "WHERE challenge_id=? AND owner_email=? AND state='sent' AND "+
        "expires_at>? AND attempts<5 RETURNING state"
      ).bind(expected,expected,ts,id,owner.email,ts).first<{state:string}>();
      if(outcome?.state!=="used")
        return fail("INCORRECT_CODE","Incorrect, expired or already-used code.",403);
      const actors=challenge.assistant_selection==="both"?
        ["yorpmind","chatgpt"]:[challenge.assistant_selection];
      const until=new Date(now.getTime()+challenge.duration_minutes*60_000).toISOString();
      const statements=[
        ...actors.map(a=>db.prepare(
          "UPDATE founder_temporary_grants SET state='expired' "+
          "WHERE assistant=? AND state='active' AND active_expires_at<=?"
        ).bind(a,ts)),
        ...actors.map(a=>db.prepare(
          "INSERT INTO founder_temporary_grants "+
          "(grant_id,assistant,scope,permission,duration_minutes,purpose,owner_email,"+
          "state,created_at,request_expires_at,activated_at,activated_by,active_expires_at) "+
          "SELECT ?,?,?,?,?,?,?,'active',?,?,?,?,? "+
          "FROM founder_otp_challenges c WHERE c.challenge_id=? AND "+
          "c.owner_email=? AND c.state='used' AND c.consumed_at=?"
        ).bind(crypto.randomUUID(),a,challenge.scope,challenge.permission,
          challenge.duration_minutes,challenge.purpose,owner.email,ts,
          challenge.expires_at,ts,owner.email,until,id,owner.email,ts)),
        db.prepare(
          "INSERT INTO admin_audit_events(id,actor,action,resource_type,resource_id,details_json,created_at) "+
          "VALUES(?,?,'temporary_permissions_email_confirmed','assistant_permissions',?,?,?)"
        ).bind(crypto.randomUUID(),owner.email,id,JSON.stringify({
          assistants:actors,scope:challenge.scope,permission:challenge.permission,
          duration_minutes:challenge.duration_minutes,expires_at:until,
          production_allowed:false,email_confirmed:true
        }),ts)
      ];
      // D1 batch is transactional: either all subordinate grants exist or none.
      const receipt=await db.batch<{meta?:{changes?:number}}>(statements);
      const inserts=receipt.slice(actors.length,actors.length*2);
      if(inserts.length!==actors.length||
          inserts.some(row=>Number(row?.meta?.changes)!==1))
        return fail("STOPPED_OR_EXPIRED",
          "This approval was cancelled or could not activate. No new access is authorized.",409);
      return adminJson({approved:true,selected_assistants:actors,active_until:until,
        production_allowed:false,limited_actions:["create_issue"],
        note:"Temporary permissions activated. Neither assistant can publish live changes."});
    }catch{return fail("ACTIVATION_UNCONFIRMED",
      "The code was not able to activate permissions. Check current grants before retrying.",503);}
  }
  return fail("INVALID_ACTION","Only send and verify are permitted.",400);
}
