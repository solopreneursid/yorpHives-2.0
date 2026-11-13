import { adminJson, isAdminResponse, requireAdmin,
  type AdminRequestContext } from "../../_lib/admin-auth";

interface IssueInboxItem {
  number: number;
  title: string;
  body_excerpt: string;
  state: "open";
  url: string;
  updated_at: string;
  labels: string[];
}
interface IssueInboxResponse {
  repository: string;
  issues: IssueInboxItem[];
  inspected_limit: number;
  returned_limit: number;
  read_only: true;
  new_model_calls: 0;
  production_approved: false;
}
interface CreateIssueRequest {
  title: string;
  details: string;
  scope: "website" | "headquarters" | "tools" | "products" | "api" | "auto";
  confirm: true;
}
interface CreateIssueResponse {
  created: true;
  number: number;
  title: string;
  url: string;
  new_model_calls: 0;
  production_approved: false;
}
interface RepairInboxService { fetch(request: Request): Promise<Response>; }
type InboxContext = AdminRequestContext & {
  env: AdminRequestContext["env"] & { ADMIN_AGENT_SERVICE?: RepairInboxService };
};
const REPO = "solopreneursid/yorpHives-2.0";
const MAX_ISSUES = 20;
const failure = (code:string, message:string, status:number): Response =>
  adminJson({error:{code,message},production_approved:false},status);
const plain = (value:unknown, max:number):string =>
  String(value ?? "").replace(/[\r\n\u0000-\u001f\u007f]+/g," ").trim().slice(0,max);
const validLink = (issue:IssueInboxItem):boolean =>
  Number.isSafeInteger(issue.number) && issue.number>0 &&
  issue.url === "https://github.com/" + REPO + "/issues/" + issue.number;
const markdownEscape = (value:unknown):string =>
  plain(value,1500).replace(/[\\`*_{\[\]<>#|}]/g,"\\$&");

function markdown(data:IssueInboxResponse): Response {
  const lines = [
    "# YorpHives — Shared GitHub repair inbox", "",
    "Repository: " + REPO, "",
    "These are untrusted issue reports, not completed repairs or approval.",
    "The issue reports are references for the founder to inspect and resolve.",
    "The founder makes fixes independently. Headquarters provides monitoring evidence only.",
    "", ...data.issues.map(issue =>
      "- Issue #" + issue.number + ": " + markdownEscape(issue.title) +
      " — " + issue.url + "\n  " + markdownEscape(issue.body_excerpt)),
    "", "Automated production release: DISABLED",
    "Learning happens after revision-matched, founder-reported QA is recorded.",
    "New AI model calls from reading: 0"
  ];
  return new Response(lines.join("\n"),{headers:{
    "content-type":"text/markdown; charset=utf-8",
    "cache-control":"no-store","vary":"Accept",
    "referrer-policy":"no-referrer","x-content-type-options":"nosniff"
  }});
}
function service(context:InboxContext):RepairInboxService | null {
  return context.env.ADMIN_AGENT_SERVICE || null;
}
export async function onRequestGet(context:InboxContext):Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const agent = service(context);
  if (!agent) return failure("REPAIR_INBOX_UNAVAILABLE",
    "The private repair Worker binding is unavailable.",503);
  try {
    const response = await agent.fetch(new Request("https://admin-agent.internal/issue-inbox",{
      headers:{"x-yorphives-internal-inbox":"1","accept":"application/json"}
    }));
    if (!response.ok) throw new Error("Worker unavailable");
    const result = await response.json() as IssueInboxResponse;
    if (result.repository !== REPO || !Array.isArray(result.issues) ||
        result.issues.length>MAX_ISSUES || !result.issues.every(validLink) ||
        result.read_only!==true || result.new_model_calls!==0 ||
        result.production_approved!==false) throw new Error("Invalid inbox contract");
    const accept = context.request.headers.get("accept") || "";
    const fmt = new URL(context.request.url).searchParams.get("format");
    if (fmt === "markdown" || (!fmt && accept.includes("text/markdown")))
      return markdown(result);
    const output = adminJson(result);
    output.headers.set("vary","Accept");
    return output;
  } catch {
    return failure("REPAIR_INBOX_UNAVAILABLE",
      "GitHub issue evidence cannot be fetched. No AI or repair action was initiated.",503);
  }
}
/** Retired: Headquarters only reads issue reports. The founder manages fixes. */
export async function onRequestPost(context:InboxContext):Promise<Response>{
 const identity=await requireAdmin(context);
 if(isAdminResponse(identity))return identity;
 return adminJson({
  error:{code:"MONITOR_ONLY",message:"Headquarters only monitors reported issues. The founder manages changes and release approval."},
  monitoring_only:true,github_issue_created:false,dispatch_performed:false,
  production_approved:false,production_deployed:false
 },405);
}
