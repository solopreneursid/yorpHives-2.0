import {
  adminJson, isAdminResponse, requireOwnerStepUp, type AdminRequestContext
} from "../../../_lib/admin-auth";
import { permissionLabels, grantDisplayState } from "../../../_lib/founder-permissions.js";

interface PermissionRow {
  grant_id: string;
  assistant: "yorpmind" | "chatgpt";
  scope: "website" | "headquarters" | "both";
  permission: "review_findings" | "prepare_fixes" | "manage_staging";
  duration_minutes: number;
  owner_email: string;
  purpose: string;
  state: "awaiting_mfa" | "active" | "revoked" | "expired";
  request_expires_at: string;
  active_expires_at: string | null;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const failure=(code:string,message:string,status:number):Response =>
  adminJson({error:{code,message},permission_active:false,production_allowed:false},status);
const escape=(s:unknown)=>String(s??"").replace(/&/g,"&amp;")
  .replace(/</g,"&lt;").replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const page=(body:string,status=200)=>new Response(
  '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>Approve temporary assistant help · YorpHives</title>'+
  '<style>*{box-sizing:border-box}body{background:#08111f;color:#e2e8f0;'+
  'font-family:system-ui,sans-serif;line-height:1.7;margin:0;padding:24px}'+
  'main{max-width:650px;margin:45px auto;background:#111e30;border:1px solid #34506c;'+
  'border-radius:16px;padding:clamp(20px,4vw,36px)}h1{letter-spacing:-.04em}'+
  'p{color:#bfcede}small{color:#67e8f9;font-weight:700;text-transform:uppercase}'+
  '.notice{border:1px solid #7d6242;color:#fde68a;border-radius:10px;padding:13px;'+
  'background:#2b2219}.action{display:block;background:#0891b2;border:0;'+
  'border-radius:9px;color:#fff;padding:12px 18px;margin-top:15px;'+
  'font:inherit;font-weight:750;cursor:pointer}a{color:#67e8f9}'+
  'label{display:block;margin:18px 0}</style></head><body><main>'+
  body+'</main></body></html>',{status,headers:{
    "content-type":"text/html; charset=utf-8","cache-control":"no-store",
    "x-content-type-options":"nosniff","referrer-policy":"no-referrer",
    "content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; "+
      "form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
  }}
);
async function find(context:AdminRequestContext,id:string) {
  return context.env.DB!.prepare(
    "SELECT grant_id,assistant,scope,permission,duration_minutes,owner_email,purpose,"+
    "state,request_expires_at,active_expires_at FROM founder_temporary_grants "+
    "WHERE grant_id=?"
  ).bind(id).first<PermissionRow>();
}
export async function onRequestGet(context:AdminRequestContext):Promise<Response> {
  const owner=await requireOwnerStepUp(context);
  if(isAdminResponse(owner))return owner;
  const id=new URL(context.request.url).searchParams.get("id")||"";
  if(!UUID.test(id))return failure("INVALID_PERMISSION","Permission request not found.",400);
  const grant=await find(context,id);
  if(!grant||grant.owner_email!==owner.email)
    return failure("NOT_YOUR_REQUEST","Only the same owner can approve this request.",403);
  const labels=permissionLabels(grant);
  const ready=grantDisplayState(grant)==="awaiting_security_check";
  return page(
    '<small>YorpHives · secure owner check</small><h1>Give temporary permission?</h1>'+
    '<p>You are the owner. Your assistant can only help with the work below.</p>'+
    '<p><strong>Assistant:</strong> '+escape(labels.assistant)+'<br>'+
    '<strong>Allowed work:</strong> '+escape(labels.permission)+'<br>'+
    '<strong>Where:</strong> '+escape(labels.scope)+'<br>'+
    '<strong>For:</strong> '+grant.duration_minutes+' minutes<br>'+
    '<strong>Why:</strong> '+escape(grant.purpose)+'</p>'+
    '<p class="notice">Your account stays yours. No password or security code goes to an AI. '+
    'Only verified assistant connections may use this permission. Publishing changes '+
    'to the live website still needs a separate, exact-change approval.</p>'+
    (ready?'<form method="post" action="/api/admin/step-up/assistant-permissions?id='+encodeURIComponent(id)+'">'+
      '<input type="hidden" name="grant_id" value="'+escape(id)+'">'+
      '<label><input required type="checkbox" name="agree" value="yes"> '+
      'I approve this assistant, this work, and this short time limit.</label>'+
      '<button class="action" type="submit">Approve temporary help</button></form>':
      '<p>This request has expired, has been used, or was cancelled. No new access was granted.</p>')+
    '<p><a href="/admin/">Return to Headquarters</a></p>'
  );
}
export async function onRequestPost(context:AdminRequestContext):Promise<Response> {
  const owner=await requireOwnerStepUp(context);
  if(isAdminResponse(owner))return owner;
  if(context.request.headers.get("origin")!==new URL(context.request.url).origin)
    return failure("WRONG_PAGE","Use the secure confirmation page.",403);
  if(context.request.headers.get("content-type")?.split(";")[0].trim()!=="application/x-www-form-urlencoded")
    return failure("WRONG_FORM","Use the secure confirmation form.",415);
  const raw=await context.request.text();
  if(new TextEncoder().encode(raw).length>1200)
    return failure("TOO_LARGE","Request is too large.",413);
  const fields=new URLSearchParams(raw);
  const id=new URL(context.request.url).searchParams.get("id")||"";
  if(!UUID.test(id) || fields.getAll("grant_id").length!==1 ||
      fields.get("grant_id")!==id || fields.getAll("agree").length!==1 ||
      fields.get("agree")!=="yes")
    return failure("NOT_CONFIRMED","You must confirm this exact assistant and permission.",400);
  const grant=await find(context,id);
  if(!grant || grant.owner_email!==owner.email ||
      grantDisplayState(grant)!=="awaiting_security_check")
    return failure("EXPIRED","This permission request is not available to approve.",409);
  const now=new Date();
  const ts=now.toISOString();
  const until=new Date(now.getTime()+grant.duration_minutes*60*1000).toISOString();
  try {
    // Expired permissions are made inactive in D1 before the unique-active
    // index is checked. This transaction is never called by an AI agent.
    const entries=await context.env.DB!.batch([
      context.env.DB!.prepare(
        "UPDATE founder_temporary_grants SET state='expired' "+
        "WHERE assistant=? AND state='active' AND active_expires_at<=?"
      ).bind(grant.assistant,ts),
      context.env.DB!.prepare(
        "UPDATE founder_temporary_grants SET state='active',activated_by=?,"+
        "activated_at=?,active_expires_at=? WHERE grant_id=? AND owner_email=? "+
        "AND state='awaiting_mfa' AND request_expires_at>? "+
        "AND NOT EXISTS (SELECT 1 FROM founder_temporary_grants "+
        "WHERE assistant=? AND state='active')"
      ).bind(owner.email,ts,until,id,owner.email,ts,grant.assistant)
    ]) as Array<{meta?:{changes?:number}}>;
    if(Number(entries[1]?.meta?.changes||0)!==1)
      return failure("ALREADY_ACTIVE",
        "The assistant already has temporary permission or the request has expired.",409);
    await context.env.DB!.prepare(
      "INSERT INTO admin_audit_events(id,actor,action,resource_type,resource_id,details_json,created_at) "+
      "VALUES(?,?,'temporary_permission_activated','assistant_permission',?,?,?)"
    ).bind(crypto.randomUUID(),owner.email,id,JSON.stringify({
      assistant:grant.assistant,scope:grant.scope,permission:grant.permission,
      expires:until,production_allowed:false,approved_after_separate_mfa:true
    }),ts).run();
    const result={approved:true,assistant:grant.assistant,grant_id:id,
      active_until:until,production_allowed:false,
      note:"Permission ends automatically. You can cancel it from Headquarters at any time."};
    if(context.request.headers.get("accept")?.includes("application/json"))
      return adminJson(result);
    return page('<small>Confirmed by your security check</small>'+
      '<h1>Temporary help approved</h1><p>'+escape(permissionLabels(grant).assistant)+
      ' may now perform the selected limited work until '+escape(until)+
      ', provided its secure connection is configured.</p>'+
      '<p class="notice">Live publishing remains locked. You can cancel this permission anytime.</p>'+
      '<a href="/admin/">Return to Headquarters</a>');
  }catch{return failure("APPROVAL_FAILED",
    "Approval could not be confirmed. Check Headquarters before retrying.",503);}
}
