import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";
import { describeTeam, recommendTeamActions, MAX_TEAM_AGENTS_SCANNED, MAX_TEAM_JOBS_SCANNED } from "../../_lib/yorpmind-team.js";
import { mutationGuard, readBoundedJson } from "../../_lib/headquarters";

interface Staff { staff_id: string; display_name: string; tier: string; domain: string; reports_to: string | null; max_parallel_reviews: number; enabled: number; }
interface Specialist { agent_id: string; display_name: string; department_id: string; status: string; enabled: number; autonomy_level: string; }
interface Department { department_id: string; name: string; }
interface Job { job_id: string; agent_id: string; job_type: string; title: string; status: string; priority: string; updated_at: string; }
interface Report {
  report_id: string; report_day: string; report_key: string; manager_id: string;
  subject_agent_id: string; source_job_id: string; recommendation: string;
  severity: string; summary: string; evidence_json: string;
  state: "proposed" | "acknowledged" | "dismissed";
  created_at: string; reviewed_by: string | null; reviewed_at: string | null; review_note: string | null;
}
interface ReportReviewRequest { report_id: string; decision: "acknowledge" | "dismiss"; review_note: string; }
interface TeamResponse {
  system: "yorpmind_team_management";
  scope: "private_headquarters";
  generated_at: string;
  reporting_hierarchy: ReturnType<typeof describeTeam>;
  current_recommendations: ReturnType<typeof recommendTeamActions>;
  saved_reports: Array<Omit<Report, "evidence_json"> & { evidence: Record<string, unknown> }>;
  autonomous_observation: true;
  autonomous_dispatch: false;
  review_is_not_approval: true;
  production_execution: false;
  model_calls_per_team_scan: 0;
  limitations: string;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const denied = (code: string, message: string, status: number) =>
  adminJson({ error: { code, message }, release_approved: false, dispatch_performed: false }, status);

async function hasTeamSchema(context: AdminRequestContext): Promise<boolean> {
  const tables = await context.env.DB!.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('yorpmind_staff','yorpmind_team_reports')").all<{ name: string }>();
  return new Set((tables.results || []).map(t => t.name)).size === 2;
}

function asMarkdown(data: TeamResponse): Response {
  const safe = (v: unknown) => String(v ?? "").replace(/[\r\n]+/g," ").replace(/[\\*_{}\[\]<>#|]/g,"\\$&");
  const lines = [
    "# YorpMind — Manager headquarters", "",
    "Autonomous dispatch: DISABLED",
    "Production execution: DISABLED",
    "Additional AI inference per scan: 0", "",
    "## Reporting hierarchy",
    ...data.reporting_hierarchy.staff.map(s => "- " + safe(s.display_name) + " reports to " + safe(s.reports_to || "Founder") +
      "; bots: " + s.direct_bot_count + "; active work: " + s.active_job_count),
    "", "## Current resource advice",
    ...data.current_recommendations.map(r => "- [" + r.severity + "] " + safe(r.manager_id) + ": " + safe(r.summary) +
      "; job=" + safe(r.source_job_id)),
    "", "## Saved reports",
    ...data.saved_reports.map(r => "- " + safe(r.manager_id) + ": " + safe(r.recommendation) +
      " (" + safe(r.state) + "); job=" + safe(r.source_job_id)),
    "", safe(data.limitations)
  ];
  return new Response(lines.join("\n"), { headers: {
    "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store",
    "vary": "Accept", "x-content-type-options": "nosniff"
  } });
}

export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  if (!await hasTeamSchema(context)) return denied("TEAM_MIGRATION_REQUIRED", "Private migration 0027 is required.", 503);
  const db = context.env.DB!;
  const [staff, agents, departments, jobs, reports] = await Promise.all([
    db.prepare("SELECT staff_id,display_name,tier,domain,reports_to,max_parallel_reviews,enabled FROM yorpmind_staff ORDER BY tier,staff_id LIMIT 20").all<Staff>(),
    db.prepare("SELECT agent_id,display_name,department_id,status,enabled,autonomy_level FROM agent_registry ORDER BY agent_id LIMIT ?").bind(MAX_TEAM_AGENTS_SCANNED).all<Specialist>(),
    db.prepare("SELECT department_id,name FROM agent_departments LIMIT 40").all<Department>(),
    db.prepare("SELECT job_id,agent_id,title,status,priority,updated_at FROM agent_jobs ORDER BY updated_at DESC LIMIT ?").bind(MAX_TEAM_JOBS_SCANNED).all<Job>(),
    db.prepare("SELECT report_id,report_day,report_key,manager_id,subject_agent_id,source_job_id,recommendation,severity,summary,evidence_json,state,created_at,reviewed_by,reviewed_at,review_note FROM yorpmind_team_reports ORDER BY created_at DESC LIMIT 40").all<Report>()
  ]);
  const current = recommendTeamActions(staff.results || [], agents.results || [], jobs.results || [], departments.results || []);
  const saved = (reports.results || []).map(row => {
    let evidence: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(row.evidence_json);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) evidence = parsed as Record<string, unknown>;
    } catch { evidence = {}; }
    const { evidence_json, ...rest } = row;
    return { ...rest, evidence };
  });
  const data: TeamResponse = {
    system: "yorpmind_team_management", scope: "private_headquarters",
    generated_at: new Date().toISOString(),
    reporting_hierarchy: describeTeam(staff.results || [], agents.results || [], jobs.results || [], departments.results || []),
    current_recommendations: current, saved_reports: saved,
    autonomous_observation: true, autonomous_dispatch: false,
    review_is_not_approval: true, production_execution: false,
    model_calls_per_team_scan: 0,
    limitations: "Routing considers at most 100 recent jobs and 80 specialists; current advice is not persisted until the daily scan. Historical completion is not independent QA. A report review cannot dispatch missions, change privileges, publish code, or authorize spending. Daily scans require an explicitly deployed Worker."
  };
  const req = context.request;
  const markdown = new URL(req.url).searchParams.get("format") === "markdown" ||
    req.headers.get("accept")?.includes("text/markdown");
  if (markdown) return asMarkdown(data);
  const response = adminJson(data);
  response.headers.set("vary", "Accept");
  return response;
}

export async function onRequestPatch(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const blocked = mutationGuard(context.request);
  if (blocked) return blocked;
  if (Number(context.request.headers.get("content-length") || 0) > 1800)
    return denied("TOO_LARGE", "Review cannot exceed 1,800 bytes.", 413);
  let raw: unknown;
  try { raw = await readBoundedJson(context.request); }
  catch { return denied("INVALID_JSON", "Valid JSON is required.", 400); }
  const body = raw as Partial<ReportReviewRequest> | null;
  const note = typeof body?.review_note === "string" ? body.review_note.trim() : "";
  if (!body || typeof body !== "object" || !UUID.test(body.report_id || "") ||
      !["acknowledge","dismiss"].includes(body.decision || "") ||
      note.length < 40 || note.length > 1000 || note.includes("\0"))
    return denied("INVALID_REVIEW", "Provide report ID, decision and 40–1000 characters of reasoning.", 400);
  if (!await hasTeamSchema(context)) return denied("TEAM_MIGRATION_REQUIRED", "Private migration 0027 is required.", 503);
  const db = context.env.DB!;
  const state = body.decision === "acknowledge" ? "acknowledged" : "dismissed";
  const time = new Date().toISOString();
  const [updated] = await db.batch([
    db.prepare("UPDATE yorpmind_team_reports SET state=?,reviewed_by=?,reviewed_at=?,review_note=? WHERE report_id=? AND state='proposed'")
      .bind(state, identity.email, time, note, body.report_id),
    db.prepare("INSERT INTO admin_audit_events(id,actor,action,resource_type,resource_id,details_json,created_at) " +
      "SELECT ?,?,'yorpmind_team_report_review','yorpmind_team_report',?,?,? " +
      "WHERE EXISTS(SELECT 1 FROM yorpmind_team_reports WHERE report_id=? AND state=? AND reviewed_by=? AND reviewed_at=?)")
      .bind(crypto.randomUUID(), identity.email, body.report_id,
        JSON.stringify({ decision: body.decision, can_execute: false }),time,
        body.report_id,state,identity.email,time)
  ]);
  if (Number((updated as { meta?: { changes?: number } })?.meta?.changes || 0) !== 1)
    return denied("REPORT_CHANGED", "Report was already reviewed or no longer exists.", 409);
  return adminJson({
    success: true, report_id: body.report_id, state,
    dispatch_performed: false, approval_granted: false, production_deployed: false
  });
}
