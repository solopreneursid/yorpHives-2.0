import { assessRepairIntake } from "../../_lib/repair-intake.js";
import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";

/** Private Cloudflare Service binding to the durable Admin repair Workflow Worker. */
interface AgentService {
  fetch(request: Request): Promise<Response>;
}
interface AgentHealth {
  ready?: boolean;
  dependencies?: {
    database?: boolean;
    workers_ai?: boolean;
    durable_workflow?: boolean;
  };
  error?: string;
  github?: {
    authenticated?: boolean;
    login?: string;
    repository_access?: boolean;
    repository?: string;
    repository_write?: boolean;
    repository_context_access?: boolean;
  };
  workflow?: {
    access?: boolean;
    jobs_access?: boolean;
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
  finding_source: "monitor" | "asset" | null;
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
  finding_source?: "monitor" | "asset";
  request_text?: string;
  permission_probe?: boolean;
  confirm?: boolean;
  emergency_override?: boolean;
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
  const linksAvailable = Boolean(await context.env.DB!.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='admin_repair_finding_links'"
  ).first<{ name: string }>());
  const sql = linksAvailable
    ? "SELECT j.id,COALESCE(l.finding_id,j.finding_id) AS finding_id," +
      "COALESCE(l.finding_source,CASE WHEN j.finding_id IS NOT NULL THEN 'monitor' ELSE NULL END) AS finding_source," +
      "j.requested_by,j.request_text,j.status,j.agent_name,j.branch_name,j.pull_request_url,j.result_summary,j.created_at,j.updated_at " +
      "FROM admin_repair_jobs j LEFT JOIN admin_repair_finding_links l ON l.job_id=j.id " +
      "WHERE j.id!='github-permission-probe-singleton' ORDER BY j.created_at DESC LIMIT 50"
    : "SELECT id,finding_id,CASE WHEN finding_id IS NOT NULL THEN 'monitor' ELSE NULL END AS finding_source," +
      "requested_by,request_text,status,agent_name,branch_name,pull_request_url,result_summary,created_at,updated_at " +
      "FROM admin_repair_jobs WHERE id!='github-permission-probe-singleton' ORDER BY created_at DESC LIMIT 50";
  const result = await context.env.DB!.prepare(sql).all<RepairJobRow>();
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
  const [scheduled, securityAudit, openSecurity, queuedJobs] = await Promise.all([
    context.env.DB!.prepare("SELECT MAX(started_at) AS last_run_at FROM admin_runs WHERE trigger_source='scheduled' AND status='completed'").first<{last_run_at:string|null}>(),
    context.env.DB!.prepare("SELECT action,details_json,created_at AS last_run_at FROM admin_audit_events WHERE action IN ('security_audit_completed','security_audit_partial') ORDER BY created_at DESC LIMIT 1").first<{action:string;details_json:string|null;last_run_at:string|null}>(),
    context.env.DB!.prepare("SELECT COUNT(*) AS count FROM admin_asset_findings WHERE category='security' AND status IN ('open','investigating','awaiting_approval')").first<{count:number}>(),
    context.env.DB!.prepare("SELECT COUNT(*) AS count FROM admin_repair_jobs WHERE id!='github-permission-probe-singleton' AND status IN ('queued','dispatched','running','needs_review')").first<{count:number}>()
  ]);
  const scheduledFresh = Boolean(scheduled?.last_run_at && Date.now()-Date.parse(scheduled.last_run_at)<8*60*60*1000);
  let securityEvidence: {status?:string;checked?:number;target_count?:number;errors?:number;skipped?:number}|null = null;
  try {
    securityEvidence = securityAudit?.details_json ? JSON.parse(securityAudit.details_json) : null;
  } catch {
    securityEvidence = null;
  }
  const securityComplete = securityAudit?.action === "security_audit_completed" &&
    securityEvidence?.status === "complete" &&
    securityEvidence.checked === securityEvidence.target_count &&
    securityEvidence.errors === 0 &&
    securityEvidence.skipped === 0;
  const securityFresh = Boolean(securityComplete && securityAudit?.last_run_at &&
    Date.now()-Date.parse(securityAudit.last_run_at)<8*60*60*1000);
  const hasStructuredSecurityEvidence = typeof securityEvidence?.target_count === "number" &&
    typeof securityEvidence.checked === "number" &&
    typeof securityEvidence.errors === "number" &&
    typeof securityEvidence.skipped === "number";
  const securityDetail = !securityAudit
    ? "No security audit has run yet."
    : !hasStructuredSecurityEvidence
      ? "The last audit used an older evidence format; full target coverage cannot be verified. Waiting for a complete audit cycle."
      : !securityComplete
        ? `Last audit was partial: ${securityEvidence.checked}/${securityEvidence.target_count} targets checked, ${securityEvidence.errors} errors, ${securityEvidence.skipped} skipped.`
        : securityFresh
          ? "All configured public targets completed the passive security audit."
          : "The last complete security audit is older than eight hours.";
  const qa = specialistState(agentHealth, "browser smoke tests and seo crawl");
  const review = specialistState(agentHealth, "code review");
  const performance = specialistState(agentHealth, "lighthouse performance audit");
  const agents = [
    {id:"sentinel",name:"Sentinel",role:"Availability & monitoring",description:"Scheduled HTTP health checks and production change snapshots.",status:scheduledFresh?"active":"degraded",last_run_at:scheduled?.last_run_at||null,detail:scheduledFresh?"Scheduled reliability cycle is recent.":"No successful scheduled health cycle in the last eight hours."},
    {id:"asset-intelligence",name:"Asset Intelligence",role:"Inventory & discovery",description:"Discovers pages, tools, catalogue entries, APIs and dependencies.",status:scheduledFresh?"active":"degraded",last_run_at:scheduled?.last_run_at||null,detail:scheduledFresh?"Runs with the scheduled monitoring cycle.":"Waiting for the next successful inventory cycle."},
    {id:"security-auditor",name:"Security Auditor",role:"Passive security configuration",description:"Checks public HTTPS response headers and records evidence-backed findings without exploit attempts.",status:securityFresh?"active":"degraded",last_run_at:securityAudit?.last_run_at||null,detail:securityDetail},
    {id:"qa-engineer",name:"QA Engineer",role:"Browser & journey testing",description:"Playwright Chromium checks navigation, search, tool execution, mobile navigation, sitemap pages and internal links.",...qa},
    {id:"code-reviewer",name:"Code Reviewer",role:"Change & regression review",description:"Independent Workers AI review for repair proposals plus changed-line risk checks for dynamic execution, HTML sinks, hard-coded credentials, insecure URLs and sensitive configuration.",...review},
    {id:"performance-engineer",name:"Performance Engineer",role:"Performance & Core Web Vitals",description:"Scheduled and change-triggered Lighthouse measurements for homepage and Free Tools.",...performance},
    {id:"repair-engineer",name:"Repair Engineer",role:"Historical repair system (retired)",description:"Read-only past repair records. Headquarters monitors; the founder performs changes.",status:"planned",last_run_at:null,detail:"Autonomous repair dispatch and GitHub permission probes are permanently disabled under the founder monitoring-only policy."}
  ];
  return adminJson({
    data: result.results,
    finding_links_ready: linksAvailable,
    agentConfigured,
    monitoring_only: true, repair_dispatch_enabled: false,
    github: agentHealth?.github || null,
    workflow: agentHealth?.workflow || null,
    agents,
    summary:{active:agents.filter(a=>a.status==="active").length,blocked:agents.filter(a=>a.status==="blocked").length,planned:agents.filter(a=>a.status==="planned").length,degraded:agents.filter(a=>a.status==="degraded").length,queued_repairs:queuedJobs?.count||0,open_security_findings:openSecurity?.count||0}
  });
}

/**
 * Founder policy: Headquarters is monitoring and intelligence ONLY.
 * Historical repair records are read-only; no repair dispatch, AI inference,
 * GitHub permission probe, branch write or workflow invocation is permitted.
 * This is a permanent fail-closed endpoint, not a configurable feature flag.
 */
export async function onRequestPost(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  return adminJson({
    error: {
      code: "MONITOR_ONLY",
      message: "Headquarters only monitors and recommends. The founder makes changes independently; only their verified Preview → Go Live → OTP action may publish."
    },
    monitoring_only: true, dispatch_performed: false, permission_probe_performed: false,
    production_approved: false, production_deployed: false
  }, 405);
}
