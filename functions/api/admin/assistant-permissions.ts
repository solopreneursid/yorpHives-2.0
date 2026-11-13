import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";
import { validGrantInput, grantDisplayState, permissionLabels, securityReady } from "../../_lib/founder-permissions.js";

type Assistant = "yorpmind" | "chatgpt";
type GrantScope = "website" | "headquarters" | "both";
type GrantPermission = "review_findings" | "prepare_fixes" | "manage_staging";
type GrantState = "awaiting_mfa" | "active" | "revoked" | "expired";
interface NewPermissionRequest {
  assistant: Assistant;
  scope: GrantScope;
  permission: GrantPermission;
  duration_minutes: 15 | 30 | 60;
  purpose: string;
  confirm: true;
}
interface RevokeRequest { grant_id: string; action: "revoke"; }
interface PermissionRow {
  grant_id: string;
  assistant: Assistant;
  scope: GrantScope;
  permission: GrantPermission;
  duration_minutes: number;
  max_actions: number;
  used_actions: number;
  purpose: string;
  owner_email: string;
  state: GrantState;
  created_at: string;
  request_expires_at: string;
  active_expires_at: string | null;
  activated_at: string | null;
  revoked_at: string | null;
}
interface PermissionView extends PermissionRow {
  display_state: string;
  labels: { assistant: string; scope: string; permission: string };
  production_allowed: false;
}
interface PermissionsResponse {
  name: "Your assistant permissions";
  owner_is_in_charge: true;
  mfa_configured: boolean;
  connected: { yorpmind: boolean; chatgpt: boolean };
  agent_execution_connected: boolean;
  active_actions_supported: string[];
  production_execution_enabled: false;
  assistants: PermissionView[];
  explanation: string;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const error=(code:string,message:string,status:number):Response =>
  adminJson({error:{code,message},production_allowed:false},status);
function markdown(data:PermissionsResponse):Response {
  const safe=(x:unknown)=>String(x??"").replace(/[\r\n]+/g," ")
    .replace(/[\\`*_{}\[\]<>#|]/g,"\\$&").slice(0,700);
  return new Response([
    "# Your assistant permissions", "",
    "You remain the owner. YorpMind and ChatGPT support you equally.",
    "Permission activation needs your separate identity check: "+
      (data.mfa_configured?"Configured":"Not configured"),
    "Current assistant connection: YorpMind="+(data.connected.yorpmind?"ready":"not connected")+
      "; ChatGPT="+(data.connected.chatgpt?"ready":"not connected"),
    "Production changes: LOCKED (separate exact-change approval required)", "",
    ...data.assistants.flatMap(row=>[
      "## "+safe(row.labels.assistant)+" — "+safe(row.display_state),
      "Area: "+safe(row.labels.scope),
      "Can do: "+safe(row.labels.permission),
      "Reason: "+safe(row.purpose),
      "Ends: "+safe(row.active_expires_at||row.request_expires_at),
      "Used actions: "+row.used_actions+"/"+row.max_actions,""
    ]),safe(data.explanation)
  ].join("\n"),{headers:{"content-type":"text/markdown; charset=utf-8",
    "vary":"Accept","cache-control":"no-store","x-content-type-options":"nosniff",
    "referrer-policy":"no-referrer"}});
}
function connections(context:AdminRequestContext) {
  const env=context.env;
  const aud=String(env.CF_ACCESS_AGENT_AUD||"").trim();
  const base=new Set(String(env.CF_ACCESS_AUD||"").split(",").map(x=>x.trim()));
  const separate=Boolean(aud && !base.has(aud) && aud!==String(env.CF_ACCESS_STEP_UP_AUD||"").trim());
  const mind=String(env.CF_ACCESS_YORPMIND_SERVICE_TOKEN_ID||"").trim();
  const chat=String(env.CF_ACCESS_CHATGPT_SERVICE_TOKEN_ID||"").trim();
  return {
    yorpmind:separate&&mind.length>=8&&chat!==mind,
    chatgpt:separate&&chat.length>=8&&chat!==mind
  };
}
async function hasSchema(context:AdminRequestContext):Promise<boolean> {
  const rows=await context.env.DB!.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND "+
    "name IN ('founder_temporary_grants','founder_grant_actions')"
  ).all<{name:string}>();
  return new Set((rows.results||[]).map(x=>x.name)).size===2;
}
async function list(context:AdminRequestContext):Promise<PermissionRow[]> {
  const rows=await context.env.DB!.prepare(
    "SELECT g.grant_id,g.assistant,g.scope,g.permission,g.duration_minutes,"+
    "g.max_actions,(SELECT COUNT(*) FROM founder_grant_actions a WHERE a.grant_id=g.grant_id) AS used_actions,"+
    "g.purpose,g.owner_email,g.state,g.created_at,g.request_expires_at,g.active_expires_at,"+
    "g.activated_at,g.revoked_at "+
    "FROM founder_temporary_grants g ORDER BY created_at DESC LIMIT 24"
  ).all<PermissionRow>();
  return rows.results||[];
}
export async function onRequestGet(context:AdminRequestContext):Promise<Response> {
  const identity=await requireAdmin(context);
  if(isAdminResponse(identity))return identity;
  try{
    if(!await hasSchema(context))
      return error("PERMISSIONS_NOT_READY","The temporary permissions database is not ready.",503);
    const data:PermissionsResponse={
      name:"Your assistant permissions",
      owner_is_in_charge:true,
      mfa_configured:securityReady(context.env),
      connected:connections(context),
      agent_execution_connected:false,
      active_actions_supported:["create_issue"],
      production_execution_enabled:false,
      assistants:(await list(context)).filter(x=>x.owner_email===identity.email)
        .map(row=>({...row,display_state:grantDisplayState(row),
          labels:permissionLabels(row),production_allowed:false})),
      explanation:"This gives limited, time-bound help only. A verified assistant connection is required "+
        "before it can act. AI cannot publish YorpHives or grant itself more powers."
    };
    const accept=context.request.headers.get("accept")||"";
    const format=new URL(context.request.url).searchParams.get("format");
    if(format==="markdown"||(!format&&accept.includes("text/markdown")))return markdown(data);
    const response=adminJson(data);response.headers.set("vary","Accept");return response;
  }catch{return error("PERMISSIONS_UNAVAILABLE","Could not read permission records. No new access was given.",503);}
}
function validBody(request:Request,raw:string) {
  return (request.headers.get("content-type")||"").split(";")[0].trim()==="application/json" &&
    new TextEncoder().encode(raw).length<=2400;
}
export async function onRequestPost(context:AdminRequestContext):Promise<Response> {
  const identity=await requireAdmin(context);
  if(isAdminResponse(identity))return identity;
  if(context.request.headers.get("origin")!==new URL(context.request.url).origin)
    return error("INVALID_ORIGIN","Use the secure Headquarters page.",403);
  const raw=await context.request.text();
  if(!validBody(context.request,raw))
    return error("INVALID_REQUEST","Use a small, valid request from Headquarters.",400);
  let body:unknown;try{body=JSON.parse(raw);}catch{return error("INVALID_JSON","Request could not be read.",400);}
  const input=validGrantInput(body) as NewPermissionRequest|null;
  if(!input)return error("INVALID_PERMISSION","Choose an assistant, allowed work, time and a clear reason.",400);
  if(!securityReady(context.env))
    return error("SECURITY_CHECK_NOT_READY",
      "Your separate security confirmation is not ready. No temporary access was given.",503);
  try{
    if(!await hasSchema(context))
      return error("PERMISSIONS_NOT_READY","Temporary permissions have not been installed.",503);
    const now=new Date(),ts=now.toISOString();
    const count=await context.env.DB!.prepare(
      "SELECT COUNT(*) AS n FROM founder_temporary_grants WHERE owner_email=? AND "+
      "substr(created_at,1,10)=?"
    ).bind(identity.email,ts.slice(0,10)).first<{n:number}>();
    if(Number(count?.n||0)>=6)
      return error("DAILY_LIMIT","You've reached today's limit of six permission requests.",429);
    const id=crypto.randomUUID();
    const expiry=new Date(now.getTime()+10*60*1000).toISOString();
    await context.env.DB!.batch([
      context.env.DB!.prepare(
        "INSERT INTO founder_temporary_grants "+
        "(grant_id,assistant,scope,permission,duration_minutes,purpose,owner_email,state,created_at,request_expires_at) "+
        "VALUES (?,?,?,?,?,?,?,'awaiting_mfa',?,?)"
      ).bind(id,input.assistant,input.scope,input.permission,input.duration_minutes,
        input.purpose,identity.email,ts,expiry),
      context.env.DB!.prepare(
        "INSERT INTO admin_audit_events(id,actor,action,resource_type,resource_id,details_json,created_at) "+
        "VALUES(?,?,'temporary_permission_requested','assistant_permission',?,?,?)"
      ).bind(crypto.randomUUID(),identity.email,id,JSON.stringify({
        assistant:input.assistant,scope:input.scope,permission:input.permission,
        duration_minutes:input.duration_minutes,activated:false,production_allowed:false
      }),ts)
    ]);
    return adminJson({status:"awaiting_security_check",grant_id:id,
      security_url:"/api/admin/step-up/assistant-permissions?id="+encodeURIComponent(id),
      request_expires_at:expiry,permission_active:false,
      production_allowed:false},201);
  }catch{return error("PERMISSION_REQUEST_FAILED",
    "Your request could not be recorded. No temporary access was given.",503);}
}
export async function onRequestPatch(context:AdminRequestContext):Promise<Response> {
  const identity=await requireAdmin(context);
  if(isAdminResponse(identity))return identity;
  if(context.request.headers.get("origin")!==new URL(context.request.url).origin)
    return error("INVALID_ORIGIN","Only your secure Headquarters page can cancel access.",403);
  const raw=await context.request.text();
  if(!validBody(context.request,raw))return error("INVALID_REQUEST","Invalid request.",400);
  let body:Record<string,unknown>;
  try{body=JSON.parse(raw);}catch{return error("INVALID_JSON","Invalid request.",400);}
  if(!body||typeof body!=="object"||Array.isArray(body))
    return error("INVALID_REVOKE","Choose a valid cancellation.",400);
  // Emergency stop is a one-click owner-only operation. It never requires an
  // OTP: revoking rights must remain possible if mail or step-up MFA is down.
  if(body.action==="revoke_all" && Object.keys(body).length===1){
    try{
      if(!await hasSchema(context))
        return error("PERMISSIONS_NOT_READY","Temporary permissions are not available.",503);
      const now=new Date().toISOString();
      const results=await context.env.DB!.batch([
        context.env.DB!.prepare(
          "UPDATE founder_temporary_grants SET state='revoked',revoked_by=?,revoked_at=? "+
          "WHERE owner_email=? AND state IN ('awaiting_mfa','active')"
        ).bind(identity.email,now,identity.email),
        context.env.DB!.prepare(
          "INSERT INTO admin_audit_events(id,actor,action,resource_type,resource_id,details_json,created_at) "+
          "VALUES(?,?,'temporary_permissions_all_revoked','assistant_permissions',?,?,?)"
        ).bind(crypto.randomUUID(),identity.email,"all",JSON.stringify({
          owner_emergency_stop:true,scope:"all_assistants",
          prevents_new_actions:true,production_allowed:false
        }),now)
      ]) as Array<{meta?:{changes?:number}}>;
      const count=Number(results[0]?.meta?.changes);
      if(!Number.isSafeInteger(count)||count<0)throw Error("Missing revocation receipt");
      return adminJson({cancelled:true,revoked_count:count,
        assistant_access_ended:true,production_allowed:false,
        note:"All current and pending temporary grants are revoked. New requests require fresh owner approval."});
    }catch{return error("CANCEL_FAILED",
      "Emergency stop could not be verified. Do not assume assistant access ended.",503);}
  }
  if(body.action!=="revoke"||!UUID.test(String(body.grant_id||"")))
    return error("INVALID_REVOKE","Choose a valid permission to cancel.",400);
  try{
    const now=new Date().toISOString();
    const changed=await context.env.DB!.prepare(
      "UPDATE founder_temporary_grants SET state='revoked',revoked_by=?,revoked_at=? "+
      "WHERE grant_id=? AND owner_email=? AND state IN ('awaiting_mfa','active') "+
      "RETURNING grant_id"
    ).bind(identity.email,now,body.grant_id,identity.email).first<{grant_id:string}>();
    if(!changed)return error("NOT_ACTIVE",
      "This permission was already cancelled, expired, or doesn't belong to you.",409);
    await context.env.DB!.prepare(
      "INSERT INTO admin_audit_events(id,actor,action,resource_type,resource_id,details_json,created_at) "+
      "VALUES(?,?,'temporary_permission_revoked','assistant_permission',?,?,?)"
    ).bind(crypto.randomUUID(),identity.email,body.grant_id,
      JSON.stringify({effective_immediately:true,production_allowed:false}),now).run();
    return adminJson({cancelled:true,grant_id:body.grant_id,
      assistant_access_ended:true,production_allowed:false});
  }catch{return error("CANCEL_FAILED",
    "Could not confirm cancellation. Check permissions again before relying on it.",503);}
}
