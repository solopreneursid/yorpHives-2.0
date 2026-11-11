import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";
interface OverviewCounts { active_monitors: number; open_findings: number; critical_findings: number; last_run_at: string | null; }
interface RecentRun { id: string; status: string; started_at: string; completed_at: string | null; monitor_count: number; passed_count: number; failed_count: number; }
export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const db = context.env.DB!;
  const counts = await db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM admin_monitors WHERE enabled = 1) AS active_monitors,
      (SELECT COUNT(*) FROM admin_findings WHERE status IN ('open', 'investigating', 'awaiting_approval')) AS open_findings,
      (SELECT COUNT(*) FROM admin_findings WHERE severity = 'critical' AND status IN ('open', 'investigating', 'awaiting_approval')) AS critical_findings,
      (SELECT MAX(started_at) FROM admin_runs) AS last_run_at
  `).first<OverviewCounts>();
  const runs = await db.prepare("SELECT id, status, started_at, completed_at, monitor_count, passed_count, failed_count FROM admin_runs ORDER BY started_at DESC LIMIT 8").all<RecentRun>();
  return adminJson({ identity: identity.email, counts, recent_runs: runs.results });
}
