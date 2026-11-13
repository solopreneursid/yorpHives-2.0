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
    "ChatGPT can inspect or propose changes to these same GitHub issues and draft PRs.",
    "Headquarters can prepare an isolated repair investigation after founder confirmation.",
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
export async function onRequestPost(context:InboxContext):Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  if (context.request.headers.get("origin") !== new URL(context.request.url).origin)
    return failure("INVALID_ORIGIN","Use an authenticated same-origin Headquarters session.",403);
  if (context.request.headers.get("content-type")?.split(";")[0].trim()!=="application/json")
    return failure("INVALID_CONTENT_TYPE","Use application/json.",415);
  if (Number(context.request.headers.get("content-length") || 0)>7000)
    return failure("REQUEST_TOO_LARGE","Maximum request size is 7 KB.",413);
  const raw = await context.request.text();
  if (raw.length>7000) return failure("REQUEST_TOO_LARGE","Maximum request size is 7 KB.",413);
  let value:Partial<CreateIssueRequest> | null;
  try { value=JSON.parse(raw); } catch { value=null; }
  const title = typeof value?.title==="string" ? value.title.trim() : "";
  const details = typeof value?.details==="string" ? value.details.trim() : "";
  const scope = value?.scope;
  if (value?.confirm!==true || title.length<8 || title.length>160 ||
      details.length<30 || details.length>3000 ||
      /[\u0000-\u001f\u007f]/.test(title) || details.includes("\u0000") ||
      !["website","headquarters","tools","products","api","auto"].includes(String(scope)))
    return failure("INVALID_ISSUE","Provide a title, description, scope and explicit confirmation.",400);
  // Rate-limit issue creation separately from AI budget; never infer that issue
  // creation authorizes an agent dispatch or a production release.
  const used = await context.env.DB!.prepare(
    "SELECT COUNT(*) AS n FROM admin_audit_events WHERE action='github_issue_created' " +
    "AND actor=? AND substr(created_at,1,10)=date('now')"
  ).bind(identity.email).first<{n:number}>();
  if (Number(used?.n||0)>=5)
    return failure("ISSUE_DAILY_LIMIT","This owner has reached the five-issue daily limit.",429);
  const agent=service(context);
  if (!agent) return failure("REPAIR_INBOX_UNAVAILABLE",
    "The private repair Worker binding is unavailable.",503);
  try {
    const response=await agent.fetch(new Request("https://admin-agent.internal/issue-inbox",{
      method:"POST",
      headers:{"content-type":"application/json","x-yorphives-internal-inbox":"1"},
      body:JSON.stringify({title,details,scope,confirm:true})
    }));
    if(response.status!==201)throw new Error("GitHub creation failed");
    const result=await response.json() as CreateIssueResponse;
    if(result.created!==true || result.title!==title ||
       !Number.isSafeInteger(result.number) || result.number<1 ||
       result.url!=="https://github.com/"+REPO+"/issues/"+result.number ||
       result.new_model_calls!==0 || result.production_approved!==false)
      throw new Error("Issue response contract invalid");
    await context.env.DB!.prepare(
      "INSERT INTO admin_audit_events(id,actor,action,resource_type,resource_id,details_json,created_at) " +
      "VALUES (?,?,?,?,?,?,?)"
    ).bind(crypto.randomUUID(),identity.email,"github_issue_created",
      "github_issue",String(result.number),JSON.stringify({
        scope,repository:REPO,issue_number:result.number,
        automatic_agent_dispatch:false,production_approved:false
      }),new Date().toISOString()).run();
    return adminJson(result,201);
  } catch {
    return failure("ISSUE_CREATE_UNCONFIRMED",
      "Issue creation was not confirmed. Check the GitHub inbox before retrying to avoid duplicates.",503);
  }
}
