import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";

interface AgentRow {
  id: string;
  name: string;
  role: string;
  description: string;
  status: "active" | "blocked" | "planned" | "degraded";
  last_run_at: string | null;
  detail: string;
}
interface AgentService {
  fetch(request: Request): Promise<Response>;
}
interface AgentEnv { ADMIN_AGENT_SERVICE?: AgentService; }

export async function onRequestGet(context: AdminRequestContext & { env: AdminRequestContext["env"] & AgentEnv }): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const db = context.env.DB!;
  const [scheduled, security, agentHealth] = await Promise.all([
    db.prepare("SELECT MAX(started_at) AS last_run_at FROM admin_runs WHERE trigger_source='scheduled' AND status='completed'").first<{ last_run_at: string | null }>(),
    db.prepare("SELECT MAX(created_at) AS last_run_at, details_json FROM admin_audit_events WHERE action='security_audit_completed'").first<{ last_run_at: string | null; details_json: string }>(),
    (async () => {
      try {
        if (!context.env.ADMIN_AGENT_SERVICE) return false;
        const response = await context.env.ADMIN_AGENT_SERVICE.fetch(new Request("https://admin-agent.internal/health"));
        const body = await response.json().catch(() => null) as { ready?: boolean } | null;
        return response.ok && body?.ready === true;
      } catch { return false; }
    })()
  ]);
  const scheduledFresh = Boolean(scheduled?.last_run_at && Date.now() - Date.parse(scheduled.last_run_at) < 8 * 60 * 60 * 1000);
  const securityFresh = Boolean(security?.last_run_at && Date.now() - Date.parse(security.last_run_at) < 8 * 60 * 60 * 1000);
  const agents: AgentRow[] = [
    { id:"sentinel", name:"Sentinel", role:"Availability & monitoring", description:"Scheduled HTTP health checks and production change snapshots.", status:scheduledFresh?"active":"degraded", last_run_at:scheduled?.last_run_at || null, detail:scheduledFresh?"Scheduled reliability cycle is recent.":"No successful scheduled health cycle in the last eight hours." },
    { id:"asset-intelligence", name:"Asset Intelligence", role:"Inventory & discovery", description:"Discovers pages, tools, catalogue entries, APIs and dependency observations.", status:scheduledFresh?"active":"degraded", last_run_at:scheduled?.last_run_at || null, detail:scheduledFresh?"Runs with the scheduled monitoring cycle.":"Waiting for the next successful inventory cycle." },
    { id:"security-auditor", name:"Security Auditor", role:"Passive security configuration", description:"Checks public HTTPS security headers and records evidence-backed findings. No exploit attempts or destructive probes.", status:securityFresh?"active":"degraded", last_run_at:security?.last_run_at || null, detail:securityFresh?"A recent passive security audit completed.":"Security audit has not completed recently." },
    { id:"qa-engineer", name:"QA Engineer", role:"Browser & journey testing", description:"Cross-device browser journeys, forms, tool interactions and accessibility checks.", status:"planned", last_run_at:null, detail:"Browser Rendering and a controlled test-account strategy are not configured." },
    { id:"code-reviewer", name:"Code Reviewer", role:"Change & regression review", description:"Reviews diffs, risky patterns, dependency changes and regression evidence.", status:"planned", last_run_at:null, detail:"Automated review orchestration and repository event triggers are not yet configured." },
    { id:"performance-engineer", name:"Performance Engineer", role:"Performance & Core Web Vitals", description:"Measures page performance, resource loading and regressions.", status:"planned", last_run_at:null, detail:"Real-browser performance measurement is not yet configured." },
    { id:"repair-engineer", name:"Repair Engineer", role:"Isolated code repair", description:"Uses Workers AI to propose bounded changes, then opens a draft PR after CI checks.", status:agentHealth?"active":"blocked", last_run_at:null, detail:agentHealth?"Private GitHub repair workflow is ready.":"Blocked: GITHUB_TOKEN is not configured on the private repair Worker." }
  ];
  const [jobs, openFindings] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM admin_repair_jobs WHERE status IN ('queued','dispatched','running','needs_review')").first<{count:number}>(),
    db.prepare("SELECT COUNT(*) AS count FROM admin_asset_findings WHERE category='security' AND status IN ('open','investigating','awaiting_approval')").first<{count:number}>()
  ]);
  return adminJson({
    identity: identity.email,
    agents,
    summary: {
      active: agents.filter(agent=>agent.status==="active").length,
      blocked: agents.filter(agent=>agent.status==="blocked").length,
      planned: agents.filter(agent=>agent.status==="planned").length,
      degraded: agents.filter(agent=>agent.status==="degraded").length,
      queued_repairs: jobs?.count || 0,
      open_security_findings: openFindings?.count || 0
    }
  });
}
