import {adminJson,isAdminResponse,requireAdmin,type AdminRequestContext}
 from "../../_lib/admin-auth";
import {readLiveGoLiveReadiness} from "../../_lib/go-live-live.js";
import {validatedReleaseBinding,sameReleaseBinding,releaseOtpPayload,constantTimeHexEqual}
 from "../../_lib/go-live-otp-core.js";
import {otpEnabled,generateSixDigitCode,otpDigest,sendFounderMail,otpUUID}
 from "../../_lib/founder-email-otp.js";

type Env=AdminRequestContext["env"]&{
 FOUNDER_OWNER_EMAIL?:string;FOUNDER_OTP_HMAC_KEY?:string;
 FOUNDER_OTP_FROM?:string;FOUNDER_CF_ACCOUNT_ID?:string;
 FOUNDER_EMAIL_API_TOKEN?:string;FOUNDER_MAIL?:unknown;
 HQ_GO_LIVE_OTP_TEST_ENABLED?:string;
};
type Context=AdminRequestContext&{env:Env};
type Challenge={
 challenge_id:string;owner_email:string;target:string;commit_sha:string;
 preview_deployment_id:string;preview_url:string;pr_number:number;
 code_hmac:string;state:string;attempts:number;created_at:string;
 expires_at:string;
};
const deny=(code:string,message:string,status:number)=>adminJson({
 error:{code,message},production_deployed:false,production_approved:false
},status);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function jsonBody(request:Request){
 if(request.headers.get("origin")!==new URL(request.url).origin)return null;
 if(request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()!=="application/json")return null;
 if(Number(request.headers.get("content-length")||0)>500)return null;
 const raw=await request.text();
 if(new TextEncoder().encode(raw).byteLength>500)return null;
 try{const obj=JSON.parse(raw);return obj&&typeof obj==="object"&&!Array.isArray(obj)?obj:null;}
 catch{return null;}
}
async function schemaReady(db:any){
 const rows=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('hq_go_live_challenges','admin_audit_events')").all();
 return new Set((rows.results||[]).map((x:any)=>x.name)).size===2;
}
async function issue(context:Context,owner:string,body:any){
 const target=body.target,sha=body.commit_sha,deployment=body.preview_deployment_id;
 if((target!=="website"&&target!=="headquarters")||!UUID.test(deployment||"")||
   !/^[a-f0-9]{40}$/.test(sha||"")||Object.keys(body).sort().join(",")!==
   "action,commit_sha,preview_deployment_id,target")
  return deny("INVALID_CANDIDATE","Select one exact verified preview and revision.",400);
 const live=await readLiveGoLiveReadiness(context.env,target);
 const binding=validatedReleaseBinding(live,target,sha,deployment);
 if(!binding)return deny("NOT_PRODUCTION_READY",
  "Independent release QA, rollback and exact preview must pass before an OTP can be issued.",409);
 const now=new Date(),stamp=now.toISOString();
 const expires=new Date(now.getTime()+5*60_000).toISOString();
 const hourAgo=new Date(now.getTime()-60*60_000).toISOString();
 const id=crypto.randomUUID(),code=generateSixDigitCode();
 const digest=await otpDigest(context.env.FOUNDER_OTP_HMAC_KEY!,id,owner,
  releaseOtpPayload(binding),code);
 const db=context.env.DB!;
 try{
  await db.prepare("UPDATE hq_go_live_challenges SET state='cancelled' "+
   "WHERE owner_email=? AND state IN ('issuing','sent') AND expires_at<=?")
   .bind(owner,stamp).run();
  const result=await db.prepare(
   "INSERT INTO hq_go_live_challenges(challenge_id,owner_email,target,commit_sha,"+
   "preview_deployment_id,preview_url,pr_number,code_hmac,state,created_at,expires_at) "+
   "SELECT ?,?,?,?,?,?,?,?,'issuing',?,? "+
   "WHERE (SELECT COUNT(*) FROM hq_go_live_challenges WHERE owner_email=? AND created_at>?)<3 "+
   "AND NOT EXISTS(SELECT 1 FROM hq_go_live_challenges WHERE owner_email=? "+
   "AND target=? AND state IN ('issuing','sent'))"
  ).bind(id,owner,target,sha,deployment,binding.preview_url,binding.pr_number,
   digest,stamp,expires,owner,hourAgo,owner,target).run();
  if(Number(result.meta?.changes||0)!==1)
   return deny("OTP_RATE_LIMIT","An existing verification or hourly limit prevents another code.",429);
 }catch{return deny("OTP_RESERVATION_UNAVAILABLE",
   "A verification could not be reserved safely; no release was approved.",503);}
 try{
  await sendFounderMail(context.env,{
   from:context.env.FOUNDER_OTP_FROM!,to:owner,
   subject:"YorpHives Go Live · verification (no deployment)",
   text:"Go Live verification for "+target+".\\n"+
    "Revision: "+sha+"\\nPreview: "+binding.preview_url+"\\n"+
    "Your verification code is: "+code+"\\nExpires in five minutes.\\n"+
    "This is a staging-only authorization test and DOES NOT deploy the site. "+
    "Never share this code with an AI assistant."
  });
  const sent=await db.prepare(
   "UPDATE hq_go_live_challenges SET state='sent',sent_at=? "+
   "WHERE challenge_id=? AND owner_email=? AND state='issuing'"
  ).bind(new Date().toISOString(),id,owner).run();
  if(Number(sent.meta?.changes||0)!==1)
   return deny("OTP_UNCONFIRMED","Email was submitted but code activation failed.",503);
  return adminJson({challenge_id:id,code_expires_minutes:5,
   code_sent:true,dry_run_only:true,production_deployed:false,production_approved:false},202);
 }catch{
  await db.prepare("UPDATE hq_go_live_challenges SET state='cancelled' "+
   "WHERE challenge_id=? AND state='issuing'").bind(id).run().catch(()=>null);
  return deny("OTP_DELIVERY_FAILED","The one-time code could not be sent.",503);
 }
}
async function verify(context:Context,owner:string,body:any){
 const id=String(body.challenge_id||""),code=body.code;
 if(!otpUUID.test(id)||typeof code!=="string"||!/^[0-9]{6}$/.test(code)||
   Object.keys(body).sort().join(",")!=="action,challenge_id,code")
  return deny("INVALID_OTP","Invalid code verification format.",400);
 const db=context.env.DB!;
 const row=await db.prepare(
  "SELECT challenge_id,owner_email,target,commit_sha,preview_deployment_id,"+
  "preview_url,pr_number,code_hmac,state,attempts,created_at,expires_at "+
  "FROM hq_go_live_challenges WHERE challenge_id=? AND owner_email=?"
 ).bind(id,owner).first<Challenge>();
 if(!row||row.state!=="sent"||row.attempts>=5||row.expires_at<=new Date().toISOString())
  return deny("OTP_EXPIRED","The code is expired, used or unavailable.",409);
 const live=await readLiveGoLiveReadiness(context.env,row.target);
 if(!sameReleaseBinding(row,live))
  return deny("STALE_RELEASE","The preview or checks changed. Reverify the exact release.",409);
 const digest=await otpDigest(context.env.FOUNDER_OTP_HMAC_KEY!,id,owner,
  releaseOtpPayload({target:row.target,sha:row.commit_sha,
   deployment_id:row.preview_deployment_id,preview_url:row.preview_url,
   pr_number:row.pr_number}),code);
 if(!constantTimeHexEqual(digest,row.code_hmac)){
  await db.prepare("UPDATE hq_go_live_challenges SET attempts=attempts+1,"+
   "state=CASE WHEN attempts>=4 THEN 'cancelled' ELSE state END "+
   "WHERE challenge_id=? AND state='sent' AND attempts<5")
   .bind(id).run();
  return deny("OTP_MISMATCH","Incorrect code.",403);
 }
 const now=new Date().toISOString();
 try{
  const [result]=await db.batch([
   db.prepare("UPDATE hq_go_live_challenges SET state='verified',consumed_at=? "+
    "WHERE challenge_id=? AND owner_email=? AND state='sent' "+
    "AND expires_at>? AND attempts<5 AND code_hmac=?")
    .bind(now,id,owner,now,digest),
   db.prepare("INSERT INTO admin_audit_events(id,actor,action,resource_type,"+
    "resource_id,details_json,created_at) "+
    "SELECT ?,?,'hq_go_live_otp_staging_verified','release_candidate',?,?,? "+
    "WHERE EXISTS(SELECT 1 FROM hq_go_live_challenges "+
    "WHERE challenge_id=? AND state='verified' AND consumed_at=?)")
    .bind(crypto.randomUUID(),owner,id,JSON.stringify({
      target:row.target,sha:row.commit_sha,
      preview_deployment_id:row.preview_deployment_id,dry_run_only:true,
      production_deployed:false
    }),now,id,now)
  ]);
  if(Number(result.meta?.changes||0)!==1)
   return deny("OTP_ALREADY_USED","This one-time code is no longer valid.",409);
  return adminJson({verified:true,dry_run_only:true,
   target:row.target,commit_sha:row.commit_sha,
   production_deployed:false,production_approved:false,
   note:"Staging verification completed. No production release occurred."});
 }catch{return deny("OTP_RECORD_UNAVAILABLE",
  "Verification could not be safely recorded. No release occurred.",503);}
}
export async function onRequestPost(context:Context):Promise<Response>{
 const identity=await requireAdmin(context);
 if(isAdminResponse(identity))return identity;
 if(identity.serviceToken||!context.env.FOUNDER_OWNER_EMAIL||
   identity.email?.toLowerCase()!==context.env.FOUNDER_OWNER_EMAIL.toLowerCase())
  return deny("FOUNDER_ONLY","Only the verified founder can authorize a production release.",403);
 // No production execution route exists. This test-only flag can NEVER publish.
 if(context.env.HQ_GO_LIVE_OTP_TEST_ENABLED!=="yes")
  return deny("OTP_TEST_DISABLED","The secure Go Live executor is not enabled.",503);
 if(!otpEnabled({...context.env,FOUNDER_OTP_ENABLED:"yes"},identity.email))
  return deny("OTP_NOT_CONFIGURED","Founder-only OTP sending is not configured.",503);
 const body=await jsonBody(context.request);
 if(!body)return deny("INVALID_REQUEST","Use a small same-origin JSON request.",403);
 if(!context.env.DB)return deny("DB_UNAVAILABLE","Private release audit database is unavailable.",503);
 try{if(!await schemaReady(context.env.DB))
  return deny("MIGRATION_REQUIRED","The isolated release OTP migration is not installed.",503);}
 catch{return deny("DB_UNAVAILABLE","Could not verify the release database schema.",503);}
 return body.action==="issue"?issue(context,identity.email,body):
  body.action==="verify"?verify(context,identity.email,body):
  deny("INVALID_ACTION","Only code issue and verification are permitted.",400);
}
