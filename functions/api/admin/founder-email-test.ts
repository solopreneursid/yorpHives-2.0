import {adminJson,isAdminResponse,requireAdmin,type AdminRequestContext} from "../../_lib/admin-auth";
import {otpEnabled,sendFounderMail} from "../../_lib/founder-email-otp.js";

type TestContext=AdminRequestContext & {env:AdminRequestContext["env"] & {
  FOUNDER_OWNER_EMAIL?:string;FOUNDER_OTP_FROM?:string;
  FOUNDER_OTP_ENABLED?:string;FOUNDER_OTP_HMAC_KEY?:string;
  FOUNDER_EMAIL_API_TOKEN?:string;FOUNDER_CF_ACCOUNT_ID?:string;
  FOUNDER_MAIL?:unknown;
}};
const deny=(code:string,message:string,status:number)=>
  adminJson({error:{code,message},permission_active:false,production_allowed:false},status);
/**
 * Founder-only and staging-friendly delivery test.
 * This deliberately bypasses the activation flag for a harmless test email;
 * it NEVER creates OTP challenges or temporary permissions.
 * The real grant/verify endpoint remains locked until all service identities
 * are connected and the separate security acceptance gates pass.
 */
export async function onRequestPost(context:TestContext):Promise<Response>{
  const owner=await requireAdmin(context);
  if(isAdminResponse(owner))return owner;
  if(owner.serviceToken || !context.env.FOUNDER_OWNER_EMAIL ||
    owner.email.toLowerCase()!==context.env.FOUNDER_OWNER_EMAIL.toLowerCase())
    return deny("FOUNDER_REQUIRED","Only the founder can test this email.",403);
  if(context.request.headers.get("origin")!==new URL(context.request.url).origin)
    return deny("WRONG_ORIGIN","Use your private Headquarters page.",403);
  if(context.request.headers.get("content-type")?.split(";")[0].trim()!=="application/json")
    return deny("WRONG_TYPE","Use the private email test button.",415);
  const raw=await context.request.text();
  if(new TextEncoder().encode(raw).byteLength>250||raw!=='{"action":"send_test"}')
    return deny("INVALID_REQUEST","This endpoint only sends a harmless delivery test.",400);
  // Validate all mail and HMAC settings but never flip the activation flag.
  const ready=otpEnabled({...context.env,FOUNDER_OTP_ENABLED:"yes"},owner.email);
  if(!ready)
    return deny("EMAIL_NOT_READY","Your private email transport is not ready.",503);
  const now=new Date(),ts=now.toISOString(),cutoff=
    new Date(now.getTime()-60*60_000).toISOString();
  const id=crypto.randomUUID();
  try{
    // An atomic SQL reservation prevents concurrent clicks from sending twice.
    const reserved=await context.env.DB!.prepare(
      "INSERT INTO admin_audit_events(id,actor,action,resource_type,resource_id,details_json,created_at) "+
      "SELECT ?,?,'founder_email_delivery_test_requested','founder_email',?, ?,? "+
      "WHERE NOT EXISTS (SELECT 1 FROM admin_audit_events "+
      "WHERE actor=? AND action='founder_email_delivery_test_requested' AND created_at>?) "+
      "RETURNING id"
    ).bind(id,owner.email,id,JSON.stringify({
      limited_to_verified_founder:true,no_otp:true,grant_created:false
    }),ts,owner.email,cutoff).first<{id:string}>();
    if(!reserved)return deny("RATE_LIMIT","A test email was already requested within the past hour.",429);
  }catch{return deny("AUDIT_UNAVAILABLE","Cannot record email test safely.",503);}
  try{
    await sendFounderMail(context.env,{
      from:context.env.FOUNDER_OTP_FROM!,to:owner.email,
      subject:"YorpHives Founder Control · delivery test",
      text:"This confirms your private Founder Control email sender can submit messages. "+
        "No OTP has been issued and no assistant permissions were granted.\n"+
        "If you did not request this, review your Headquarters access settings."
    });
    return adminJson({accepted:true,permission_active:false,
      production_allowed:false,note:"Cloudflare accepted the email. Check inbox or spam to confirm delivery."});
  }catch{
    return deny("DELIVERY_FAILED",
      "The email service did not accept this test. No assistant rights were changed.",503);
  }
}
