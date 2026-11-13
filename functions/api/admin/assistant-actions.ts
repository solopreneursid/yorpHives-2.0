import {
  verifyTemporaryAssistantAccess, adminJson, type AdminRequestContext
} from "../../_lib/admin-auth";
import { grantAllows } from "../../_lib/founder-permissions.js";

type Assistant = "yorpmind" | "chatgpt";
type TargetScope = "website" | "headquarters";
interface AssistantActionRequest {
  request_id: string;
  action: "create_issue";
  scope: TargetScope;
  title: string;
  details: string;
  confirm: true;
}
interface GrantRow {
  grant_id: string;
  assistant: Assistant;
  permission: "review_findings" | "prepare_fixes" | "manage_staging";
  scope: "website" | "headquarters" | "both";
  owner_email: string;
  state: string;
  max_actions: number;
  used_actions: number;
  active_expires_at: string;
}
interface IssueResult {
  created: true;
  number: number;
  url: string;
  new_model_calls: 0;
  production_approved: false;
}
interface AssistantActionResponse {
  completed: true;
  action_id: string;
  action: "create_issue";
  assistant: Assistant;
  issue_number: number;
  issue_url: string;
  production_allowed: false;
  cost: "no_new_ai_call";
}
interface InternalIssueService {
  fetch(request:Request):Promise<Response>;
}
type AgentContext=AdminRequestContext & {
  env: AdminRequestContext["env"] & {ADMIN_AGENT_SERVICE?:InternalIssueService};
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REPO="https://github.com/solopreneursid/yorpHives-2.0/issues/";
const deny=(code:string,message:string,status:number):Response =>
  adminJson({error:{code,message},permission_granted:false,production_allowed:false},status);
function parse(input:unknown):AssistantActionRequest|null {
  if(!input||typeof input!=="object"||Array.isArray(input))return null;
  const p=input as Record<string,unknown>;
  if(!UUID.test(String(p.request_id||"")) || p.action!=="create_issue" ||
      !["website","headquarters"].includes(String(p.scope)) ||
      p.confirm!==true || typeof p.title!=="string" ||
      typeof p.details!=="string")return null;
  const title=p.title.trim(),details=p.details.trim();
  if(title.length<8||title.length>160||details.length<30||details.length>3000||
      /[\u0000-\u001f\u007f]/.test(title)||details.includes("\u0000"))return null;
  return {request_id:p.request_id as string,action:"create_issue",
    scope:p.scope as TargetScope,title,details,confirm:true};
}
export async function onRequestPost(context:AgentContext):Promise<Response> {
  // No CI access, ordinary owner browser token, model-generated identity string,
  // or pasted ChatGPT message can pass this separate Access audience.
  const actor=await verifyTemporaryAssistantAccess(context.request,context.env);
  if(!actor)return deny("ASSISTANT_CONNECTION_REQUIRED",
    "The assistant's separately verified private connection is not available.",403);
  if(context.request.headers.get("content-type")?.split(";")[0].trim()!=="application/json")
    return deny("INVALID_TYPE","Use a small JSON request.",415);
  if(Number(context.request.headers.get("content-length")||0)>5000)
    return deny("TOO_LARGE","The request is too large.",413);
  const raw=await context.request.text();
  if(new TextEncoder().encode(raw).length>5000)
    return deny("TOO_LARGE","The request is too large.",413);
  let payload:unknown;
  try{payload=JSON.parse(raw);}catch{return deny("INVALID_REQUEST","Request could not be read.",400);}
  const input=parse(payload);
  if(!input)return deny("INVALID_ACTION","This work is not supported by temporary assistant permissions.",400);
  const worker=context.env.ADMIN_AGENT_SERVICE;
  if(!worker)return deny("INBOX_UNAVAILABLE","The private issue service is not connected.",503);
  const db=context.env.DB;
  if(!db)return deny("DATABASE_UNAVAILABLE","Permissions cannot be checked.",503);
  const now=new Date().toISOString();
  try {
    const grant=await db.prepare(
      "SELECT g.grant_id,g.assistant,g.permission,g.scope,g.owner_email,g.state,"+
      "g.max_actions,g.active_expires_at,"+
      "(SELECT COUNT(*) FROM founder_grant_actions a WHERE a.grant_id=g.grant_id) AS used_actions "+
      "FROM founder_temporary_grants g WHERE g.assistant=? AND g.state='active' "+
      "ORDER BY g.activated_at DESC LIMIT 1"
    ).bind(actor).first<GrantRow>();
    if(!grantAllows(grant,actor,input.action,input.scope,new Date()))
      return deny("NOT_ALLOWED",
        "The owner has not given this assistant permission for this work, or that permission has ended.",403);
    const actionId=crypto.randomUUID();
    // A single D1 INSERT reserves one action. SQLite serializes writes; the
    // COUNT guard is checked atomically, and duplicate request IDs are rejected.
    const reserved=await db.prepare(
      "INSERT OR IGNORE INTO founder_grant_actions "+
      "(action_id,grant_id,request_id,action,target_scope,state,created_at) "+
      "SELECT ?,g.grant_id,?,'create_issue',?,'reserved',? FROM founder_temporary_grants g "+
      "WHERE g.grant_id=? AND g.assistant=? AND g.state='active' "+
      "AND g.active_expires_at>? AND g.permission IN ('prepare_fixes','manage_staging') "+
      "AND (g.scope='both' OR g.scope=?) "+
      "AND (SELECT COUNT(*) FROM founder_grant_actions a WHERE a.grant_id=g.grant_id)<g.max_actions "+
      "RETURNING action_id"
    ).bind(actionId,input.request_id,input.scope,now,grant.grant_id,
      actor,now,input.scope).first<{action_id:string}>();
    if(!reserved)return deny("LIMIT_OR_DUPLICATE",
      "This action was already requested or the temporary permission has been used up.",409);
    try {
      const reply=await worker.fetch(new Request("https://admin-agent.internal/issue-inbox",{
        method:"POST",headers:{"content-type":"application/json",
          "x-yorphives-internal-inbox":"1"},
        body:JSON.stringify({title:input.title,details:input.details,
          scope:input.scope,confirm:true})
      }));
      if(reply.status!==201)throw Error("Unconfirmed issue creation");
      const result=await reply.json() as IssueResult;
      if(result.created!==true || !Number.isSafeInteger(result.number) ||
          result.number<1 || result.url!==REPO+result.number ||
          result.new_model_calls!==0 || result.production_approved!==false)
        throw Error("Invalid issue receipt");
      await db.prepare(
        "UPDATE founder_grant_actions SET state='completed',completed_at=?,result_reference=? "+
        "WHERE action_id=? AND state='reserved'"
      ).bind(new Date().toISOString(),result.url,actionId).run();
      await db.prepare(
        "INSERT INTO admin_audit_events(id,actor,action,resource_type,resource_id,details_json,created_at) "+
        "VALUES(?,?,'assistant_temporary_issue_created','assistant_permission',?,?,?)"
      ).bind(crypto.randomUUID(),"assistant:"+actor,grant.grant_id,
        JSON.stringify({issue_number:result.number,action_id:actionId,
          exact_grant:grant.grant_id,production_allowed:false,model_calls:0}),now).run();
      const response:AssistantActionResponse={completed:true,action_id:actionId,
        action:"create_issue",assistant:actor,issue_number:result.number,
        issue_url:result.url,production_allowed:false,cost:"no_new_ai_call"};
      return adminJson(response,201);
    }catch{
      await db.prepare(
        "UPDATE founder_grant_actions SET state='failed',completed_at=? "+
        "WHERE action_id=? AND state='reserved'"
      ).bind(new Date().toISOString(),actionId).run().catch(()=>null);
      return deny("ACTION_UNCONFIRMED",
        "The issue could not be confirmed. This request cannot be repeated automatically; the owner should check the issue inbox.",503);
    }
  }catch{return deny("PERMISSION_CHECK_FAILED",
    "The assistant action was blocked because permission could not be verified.",503);}
}
