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
  const actor=await verifyTemporaryAssistantAccess(context.request,context.env);
  if(!actor)return deny("ASSISTANT_CONNECTION_REQUIRED",
    "The assistant's private identity could not be verified.",403);
  // Historical grant-based actions are disabled permanently. Future development
  // tools will use dedicated low-privilege job identities, never owner grants.
  return deny("ASSISTANT_GRANTS_RETIRED",
    "No AI has administrator delegation. Use dedicated, scoped development workflows.",410);
}
