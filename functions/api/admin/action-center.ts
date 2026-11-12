import {
  adminJson, isAdminResponse, requireAdmin, type AdminRequestContext
} from "../../_lib/admin-auth";
import { founderActionQueue } from "../../_lib/owner-action-center.js";

interface SourceJob {
  job_id: string;
  status: string;
  result_json: string | null;
  updated_at: string;
}
interface CountRecord { count: number; }
interface TableRecord { name: string; }
interface MonitorRecord { started_at: string | null; }
interface ActionItem {
  id: string;
  urgency: "urgent" | "attention" | "planning";
  title: string;
  why: string;
  next_step: string;
  view: string;
  target: string | null;
  execution_authorized: false;
  approval_granted: false;
}
interface DecisionQueueResponse {
  name: "Headquarters Founder Action Center";
  scope: "private_d1_evidence_only";
  generated_at: string;
  status: "review_required" | "no_action_in_sample";
  pending_total_in_window: number;
  truncated: boolean;
  recorded_jobs_scanned: number;
  actions: ActionItem[];
  overview: {
    failed_missions: number;
    awaiting_brief_review: number;
    completed_missions_in_window: number;
    pending_repair_review: number;
    pending_release_mfa: number;
    pending_team_reports: number;
  };
  auto_ai_dispatch_enabled: false;
  release_execution_enabled: false;
  limitations: string;
}
function error(code: string, message: string, status: number): Response {
  return adminJson({ error: { code, message }, safe_to_execute: false }, status);
}
function markdown(data: DecisionQueueResponse): Response {
  const safe = (s: unknown) => String(s ?? "").replace(/[\r\n]+/g, " ")
    .replace(/[\\*_{}\[\]<>#|]/g, "\\$&");
  const lines = [
    "# Headquarters — Your next decisions", "",
    "Status: " + data.status,
    "Preview reviewed: NOT ATTESTED",
    "Approval granted: NO",
    "Production execution: DISABLED",
    "Founder decisions found in sample: " + data.pending_total_in_window, "",
    ...data.actions.flatMap((a, i) => [
      "## " + (i + 1) + ". " + safe(a.title),
      "Priority: " + safe(a.urgency),
      "Why: " + safe(a.why),
      "Next: " + safe(a.next_step),
      "Open: Headquarters / " + safe(a.view), ""
    ]),
    safe(data.limitations)
  ];
  return new Response(lines.join("\n"), { headers: {
    "content-type": "text/markdown; charset=utf-8",
    "cache-control": "no-store", "vary": "Accept",
    "x-content-type-options": "nosniff", "referrer-policy": "no-referrer"
  } });
}

export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const db = context.env.DB!;
  try {
    const [jobs, repairs, monitor, tables] = await Promise.all([
      db.prepare("SELECT job_id,status,result_json,updated_at FROM agent_jobs " +
        "WHERE job_type='owner_mission' ORDER BY updated_at DESC LIMIT 50").all<SourceJob>(),
      db.prepare("SELECT COUNT(*) AS count FROM admin_repair_jobs WHERE status='needs_review'")
        .first<CountRecord>(),
      db.prepare("SELECT started_at FROM admin_runs ORDER BY started_at DESC LIMIT 1")
        .first<MonitorRecord>(),
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' " +
        "AND name IN ('yorpmind_team_reports','yorpmind_staff','yorpmind_owner_delegations')")
        .all<TableRecord>()
    ]);
    const existing = new Set((tables.results || []).map(t => t.name));
    const [mfa, team] = await Promise.all([
      existing.has("yorpmind_owner_delegations")
        ? db.prepare("SELECT COUNT(*) AS count FROM yorpmind_owner_delegations " +
          "WHERE state='awaiting_mfa' AND request_expires_at > ?")
          .bind(new Date().toISOString()).first<CountRecord>()
        : Promise.resolve(null),
      existing.has("yorpmind_team_reports")
        ? db.prepare("SELECT COUNT(*) AS count FROM yorpmind_team_reports WHERE state='proposed'")
          .first<CountRecord>()
        : Promise.resolve(null)
    ]);
    const snapshot = founderActionQueue({
      jobs: jobs.results || [],
      repairReviewCount: Number(repairs?.count || 0),
      pendingMfaCount: Number(mfa?.count || 0),
      pendingTeamReports: Number(team?.count || 0),
      teamSchemaReady: existing.has("yorpmind_staff") && existing.has("yorpmind_team_reports"),
      lastMonitorAt: monitor?.started_at || null
    });
    const data: DecisionQueueResponse = {
      name: "Headquarters Founder Action Center",
      scope: "private_d1_evidence_only",
      generated_at: new Date().toISOString(),
      status: snapshot.actions.length ? "review_required" : "no_action_in_sample",
      ...snapshot
    };
    const query = new URL(context.request.url).searchParams;
    if (query.get("format") === "markdown" ||
        context.request.headers.get("accept")?.includes("text/markdown")) return markdown(data);
    const response = adminJson(data);
    response.headers.set("vary", "Accept");
    return response;
  } catch {
    return error("ACTION_EVIDENCE_UNAVAILABLE",
      "The private D1 action evidence could not be loaded. No approval or safe-to-deploy claim can be made.", 503);
  }
}
