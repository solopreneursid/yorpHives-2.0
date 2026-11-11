import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";

/** Private Cloudflare Service binding to the durable Admin repair Workflow Worker. */
interface AgentService {
  fetch(request: Request): Promise<Response>;
}
interface AgentHealth {
  ready?: boolean;
  error?: string;
  github?: {
    authenticated?: boolean;
    login?: string;
    repository_access?: boolean;
    repository?: string;
  };
  workflow?: {
    access?: boolean;
    latest_run?: {
      id: number;
      status: string;
      conclusion: string | null;
      created_at: string;
      updated_at: string;
      html_url: string;
    } | null;
    jobs?: Array<{
      name: string;
      status: string;
      conclusion: string | null;
      started_at: string | null;
      completed_at: string | null;
    }>;
    detail?: string;
  };
}
interface RepairEnv {
  ADMIN_AGENT_SERVICE?: AgentService;
}
interface RepairJobRow {
  id: string;
  finding_id: string | null;
  requested_by: string;
  request_text: string;
  status: string;
  agent_name: string | null;
  branch_name: string | null;
  pull_request_url: string | null;
  result_summary: string | null;
  created_at: string;
  updated_at: string;
}
interface CreateRepairJobRequest {
  finding_id?: string | null;
  request_text?: string;
}
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

async function audit(context: AdminRequestContext, actor: string, action: string, resourceId: string, details: Record<string, unknown>) {
  await context.env.DB!.prepare(
    "INSERT INTO admin_audit_events (id,actor,action,resource_type,resource_id,details_json,created_at) VALUES (?,?,?,?,?,?,?)"
  ).bind(id(), actor, action, "repair_job", resourceId, JSON.stringify(details), now()).run();
}

function specialistState(health: AgentHealth | null, jobName: string) {
  const run = health?.workflow?.latest_run;
  const jobs = health?.workflow?.jobs || [];
  if (!health?.workflow?.access || !run) {
    return {
      status: "planned",
      last_run_at: run?.created_at || null,
      detail: health?.workflow?.detail || "Waiting for the first specialist workflow run."
    };
  }
  const job = jobs.find(item => item.name.toLowerCase().includes(jobName.toLowerCase()));
  if (!job) {
    return { status: "degraded", last_run_at: run.created_at, detail: "The latest workflow did not report this specialist job." };
  }
  const completedAt = job.completed_at || run.updated_at;
  const stale = Date.now() - Date.parse(completedAt) > 7 * 24 * 60 * 60 * 1000;
  if (job.status !== "completed") {
    return { status: "active", last_run_at: job.started_at || run.created_at, detail: "Specialist job is currently running." };
  }
  if (job.conclusion === "success" && !stale) {
    return { status: "active", last_run_at: completedAt, detail: "Latest specialist run completed successfully; evidence is retained as a GitHub Actions artifact." };
  }
  return {
    status: "degraded",
    last_run_at: completedAt,
    detail: stale ? "The last successful run is more than seven days old." : "The latest specialist run did not complete successfully."
  };
}

export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const result = await context.env.DB!.prepare(
    "SELECT id,finding_id,requested_by,request_text,status,agent_name,branch_name,pull_request_url,result_summary,created_at,updated_at FROM admin_repair_jobs ORDER BY created_at DESC LIMIT 50"
  ).all<RepairJobRow>();
  const env = context.env as RepairEnv;
  let agentHealth: AgentHealth | null = null;
  if (env.ADMIN_AGENT_SERVICE) {
    try {
      const response = await env.ADMIN_AGENT_SERVICE.fetch(new Request("https://admin-agent.internal/health"));
      agentHealth = await response.json().catch(() => null) as AgentHealth | null;
    } catch {
      agentHealth = null;
    }
  }
  const agentConfigured = agentHealth?.ready === true;
  const [scheduled, security, openSecurity, queuedJobs] = await Promise.all([
    context.env.DB!.prepare("SELECT MAX(started_at) AS last_run_at FROM admin_runs WHERE trigger_source='scheduled' AND status='completed'").first<{last_run_at:string|null}>(),
    context.env.DB!.prepare("SELECT MAX(created_at) AS last_run_at FROM admin_audit_events WHERE action='security_audit_completed'").first<{last_run_at:string|null}>(),
    context.env.DB!.prepare("SELECT COUNT(*) AS count FROM admin_asset_findings WHERE category='security' AND status IN ('open','investigating','awaiting_approval')").first<{count:number}>(),
    context.env.DB!.prepare("SELECT COUNT(*) AS count FROM admin_repair_jobs WHERE status IN ('queued','dispatched','running','needs_review')").first<{count:number}>()
  ]);
  const scheduledFresh = Boolean(scheduled?.last_run_at && Date.now()-Date.parse(scheduled.last_run_at)<8*60*60*1000);
  const securityFresh = Boolean(security?.last_run_at && Date.now()-Date.parse(security.last_run_at)<8*60*60*1000);
  const qa = specialistState(agentHealth, "browser smoke tests and seo crawl");
  const review = specialistState(agentHealth, "code review");
  const performance = specialistState(agentHealth, "lighthouse performance audit");
  const agents = [
    {id:"sentinel",name:"Sentinel",role:"Availability & monitoring",description:"Scheduled HTTP health checks and production change snapshots.",status:scheduledFresh?"active":"degraded",last_run_at:scheduled?.last_run_at||null,detail:scheduledFresh?"Scheduled reliability cycle is recent.":"No successful scheduled health cycle in the last eight hours."},
    {id:"asset-intelligence",name:"Asset Intelligence",role:"Inventory & discovery",description:"Discovers pages, tools, catalogue entries, APIs and dependencies.",status:scheduledFresh?"active":"degraded",last_run_at:scheduled?.last_run_at||null,detail:scheduledFresh?"Runs with the scheduled monitoring cycle.":"Waiting for the next successful inventory cycle."},
    {id:"security-auditor",name:"Security Auditor",role:"Passive security configuration",description:"Checks public HTTPS response headers and records evidence-backed findings without exploit attempts.",status:securityFresh?"active":"degraded",last_run_at:security?.last_run_at||null,detail:securityFresh?"A recent passive security audit completed.":"Waiting for the first scheduled security audit."},
    {id:"qa-engineer",name:"QA Engineer",role:"Browser & journey testing",description:"Playwright Chromium checks navigation, search, tool execution, mobile navigation, sitemap pages and internal links.",...qa},
    {id:"code-reviewer",name:"Code Reviewer",role:"Change & regression review",description:"Independent Workers AI review for repair proposals plus changed-line risk checks for dynamic execution, HTML sinks, hard-coded credentials, insecure URLs and sensitive configuration.",...review},
    {id:"performance-engineer",name:"Performance Engineer",role:"Performance & Core Web Vitals",description:"Scheduled and change-triggered Lighthouse measurements for homepage and Free Tools.",...performance},
    {id:"repair-engineer",name:"Repair Engineer",role:"Isolated code repair",description:"Workers AI repair proposals, isolated branches and CI-gated draft PRs.",status:agentConfigured?"active":"blocked",last_run_at:null,detail:agentConfigured?"GitHub token authentication and repository read access verified. Repairs still require all CI specialist checks.":(agentHealth?.error||"GitHub authentication or repository access is not verified.")}
  ];
  return adminJson({
    data: result.results,
    agentConfigured,
    github: agentHealth?.github || null,
    workflow: agentHealth?.workflow || null,
    agents,
    summary:{active:agents.filter(a=>a.status==="active").length,blocked:agents.filter(a=>a.status==="blocked").length,planned:agents.filter(a=>a.status==="planned").length,degraded:agents.filter(a=>a.status==="degraded").length,queued_repairs:queuedJobs?.count||0,open_security_findings:openSecurity?.count||0}
  });
}

export async function onRequestPost(context: AdminRequestContext & { env: AdminRequestContext["env"] & RepairEnv }): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const origin = context.request.headers.get("origin");
  if (!origin || origin !== new URL(context.request.url).origin) {
    return adminJson({ error: { code: "INVALID_ORIGIN", message: "Admin actions must originate from this site." } }, 403);
  }
  if (!context.request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return adminJson({ error: { code: "INVALID_CONTENT_TYPE", message: "A JSON request body is required." } }, 415);
  }

  const body = await context.request.json().catch(() => null) as CreateRepairJobRequest | null;
  const requestText = (body?.request_text || "").trim();
  if (!requestText || requestText.length > 4000) {
    return adminJson({ error: { code: "INVALID_REQUEST", message: "Describe the repair in 1–4000 characters." } }, 400);
  }
  const findingId = body?.finding_id || null;
  if (findingId) {
    const finding = await context.env.DB!.prepare("SELECT id FROM admin_findings WHERE id = ?").bind(findingId).first<{ id: string }>();
    const assetFinding = finding ? null : await context.env.DB!.prepare("SELECT id FROM admin_asset_findings WHERE id = ?").bind(findingId).first<{ id: string }>();
    if (!finding && !assetFinding) return adminJson({ error: { code: "FINDING_NOT_FOUND", message: "The selected finding does not exist." } }, 404);
  }

  const agent = context.env.ADMIN_AGENT_SERVICE;
  if (!agent) {
    return adminJson({ error: { code: "AGENT_NOT_CONFIGURED", message: "The isolated repair workflow service binding is not configured." } }, 503);
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = await context.env.DB!.prepare(
    "SELECT COUNT(*) AS count FROM admin_repair_jobs WHERE created_at >= ?"
  ).bind(cutoff).first<{ count: number }>();
  if ((recent?.count || 0) >= 2) {
    return adminJson({ error: { code: "AGENT_DAILY_LIMIT", message: "The staging repair agent is limited to two jobs per 24 hours to protect the free inference allowance." } }, 429);
  }

  const jobId = id();
  const timestamp = now();
  await context.env.DB!.prepare(
    "INSERT INTO admin_repair_jobs (id,finding_id,requested_by,request_text,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)"
  ).bind(jobId, findingId, identity.email, requestText, "queued", timestamp, timestamp).run();
  await audit(context, identity.email, "repair_requested", jobId, { finding_id: findingId, request_text: requestText });

  try {
    const dispatch = await agent.fetch(new Request("https://admin-agent.internal/instances", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        job_id: jobId,
        finding_id: findingId,
        requested_by: identity.email,
        request_text: requestText,
        repository: "solopreneursid/yorpHives-2.0",
        base_branch: "build/yorphives-admin-reliability"
      })
    }));
    const result = await dispatch.json().catch(() => null) as { id?: string; status?: string; error?: string } | null;
    if (!dispatch.ok || !result?.id) throw new Error(result?.error || "The repair workflow could not be started.");

    await context.env.DB!.prepare("UPDATE admin_repair_jobs SET status='dispatched',result_summary=?,updated_at=?,dispatched_at=? WHERE id=?")
      .bind("Durable Cloudflare repair workflow accepted. The agent is preparing an isolated branch and CI-verified draft PR.", now(), now(), jobId).run();
    await audit(context, identity.email, "repair_dispatched", jobId, { workflow_instance_id: result.id });
    return adminJson({ job: { id: jobId, status: "dispatched" }, dispatched: true }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Repair workflow dispatch failed.";
    await context.env.DB!.prepare("UPDATE admin_repair_jobs SET status='failed',result_summary=?,updated_at=? WHERE id=?")
      .bind(message.slice(0, 3500), now(), jobId).run();
    await audit(context, identity.email, "repair_dispatch_failed", jobId, {});
    return adminJson({ job: { id: jobId, status: "failed" }, dispatched: false, message: "The request was saved, but the repair workflow could not be started." }, 202);
  }
}
