import { recommendTeamActions, MAX_TEAM_AGENTS_SCANNED, MAX_TEAM_JOBS_SCANNED } from "../functions/_lib/yorpmind-team.js";

export async function scanYorpMindTeam(db, clock = () => new Date()) {
  if (!db) return { status: "unavailable", reports_created: 0 };
  const tables = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('yorpmind_staff','yorpmind_team_reports','agent_registry','agent_jobs','agent_departments')").all();
  if (new Set((tables.results || []).map(row => row.name)).size !== 5)
    return { status: "migration_required", reports_created: 0 };
  const now = clock();
  const date = now.toISOString().slice(0, 10);
  const [staff, agents, departments, jobs] = await Promise.all([
    db.prepare("SELECT staff_id,display_name,tier,domain,reports_to,max_parallel_reviews,enabled FROM yorpmind_staff WHERE enabled=1 LIMIT 20").all(),
    db.prepare("SELECT agent_id,display_name,department_id,status,enabled,autonomy_level FROM agent_registry ORDER BY agent_id LIMIT ?").bind(MAX_TEAM_AGENTS_SCANNED).all(),
    db.prepare("SELECT department_id,name FROM agent_departments LIMIT 40").all(),
    db.prepare("SELECT job_id,agent_id,title,status,priority,updated_at FROM agent_jobs ORDER BY updated_at DESC LIMIT ?").bind(MAX_TEAM_JOBS_SCANNED).all()
  ]);
  const recommendations = recommendTeamActions(staff.results || [], agents.results || [], jobs.results || [], departments.results || [], now);
  let count = 0;
  for (const item of recommendations) {
    const inserted = await db.prepare(
      "INSERT OR IGNORE INTO yorpmind_team_reports " +
      "(report_id,report_day,report_key,manager_id,subject_agent_id,source_job_id,recommendation,severity,summary,evidence_json,state,created_at) " +
      "VALUES(?,?,?,?,?,?,?,?,?,?,'proposed',?) RETURNING report_id"
    ).bind(
      crypto.randomUUID(), date, item.report_key, item.manager_id,
      item.subject_agent_id, item.source_job_id, item.recommendation, item.severity,
      item.summary, JSON.stringify(item.evidence), now.toISOString()
    ).first();
    if (inserted?.report_id) count++;
  }
  return {
    status: "completed", date, reports_created: count,
    jobs_scanned: (jobs.results || []).length, agents_scanned: (agents.results || []).length,
    model_calls: 0, agent_dispatches: 0, production_changes: 0
  };
}
