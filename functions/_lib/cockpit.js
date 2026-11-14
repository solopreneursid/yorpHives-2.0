/**
 * Founder overview assembled only from recorded private database evidence.
 * Aggregates cover their whole source tables; six-row lists are explicitly
 * samples. Reading the overview never starts work or grants authority.
 */
import { readWatchtowerCoverage } from "./watchtower-coverage.js";

export const COCKPIT_RECENT_LIMIT = 6;
export const MONITOR_FRESHNESS_HOURS = 8;

const ownerMissions = "job_type='owner_mission' AND COALESCE(origin_type,'')!='staging_rehearsal'";
const number = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
const sourceState = (available, observed_at = null, partial = false) => ({
  available, partial, observed_at: typeof observed_at === "string" &&
    Number.isFinite(Date.parse(observed_at)) ? observed_at : null,
  error: available ? (partial ? "Some records could not be read." : null) : "Records are unavailable. Refresh or check this module's setup."
});
const emptyMissions = () => ({ total:null, active:null, planned:null, running:null,
  review:null, failed:null, completed:null, rehearsals:null });

async function first(db, sql, ...values) {
  const statement = db.prepare(sql);
  const row = await (values.length ? statement.bind(...values) : statement).first();
  if (!row || typeof row !== "object") throw new Error("Missing aggregate result");
  return row;
}
async function rows(db, sql) {
  const result = await db.prepare(sql).all();
  if (result?.success === false || !Array.isArray(result?.results)) throw new Error("Missing rows");
  return result.results;
}

/** Safe fixed navigation destinations, never executable actions or stored URLs. */
export function cockpitActions(metrics, sources) {
  const actions = [];
  const add = (id, title, description, view, urgency="attention", target=null) =>
    actions.push({ id, title, description, view, urgency, target });
  const critical = metrics.issues.critical ?? metrics.issues.known_critical;
  const issues = metrics.issues.active ?? metrics.issues.known_active;
  const minimum = sources.issues.partial ? "At least " : "";
  if (critical > 0) add("critical-issues", "Review critical website problems",
    `${minimum}${critical} critical finding(s) need investigation.`, "issues", "urgent");
  if (metrics.missions.failed > 0) add("failed-missions", "Resolve failed missions",
    `${metrics.missions.failed} mission(s) failed. Review the cause before retrying.`, "headquarters", "urgent", "failed");
  if (metrics.missions.review > 0) add("review-missions", "Review your team's work",
    `${metrics.missions.review} mission(s) await your review.`, "headquarters", "attention", "review");
  if (!sources.monitors.available || metrics.monitors.stale > 0 || metrics.monitors.unknown > 0)
    add("monitor-evidence", "Check website monitoring",
      "Some enabled routes have no current check. Open monitoring to investigate.", "monitoring");
  if (metrics.monitors.failing > 0) add("monitor-failures", "Inspect failing website checks",
    `${metrics.monitors.failing} enabled route(s) failed their latest current check.`, "monitoring", "urgent");
  if (critical === 0 && issues > 0) add("open-issues", "Investigate website findings",
    `${minimum}${issues} recorded finding(s) remain open.`, "issues");
  if (metrics.missions.planned > 0) add("planned-missions", "Choose the next mission",
    `${metrics.missions.planned} planned mission(s) are waiting. Review the brief before starting work.`, "headquarters", "planning", "active");
  if (metrics.opportunities.shortlisted > 0 || metrics.opportunities.proposed > 0)
    add("research-ideas", "Evaluate the next opportunity",
      "Review research hypotheses and their evidence before investing in a build.", "intelligence", "planning");
  if (sources.memory.available && metrics.memory.experiences === 0)
    add("first-learning", "Build your first verified lesson",
      "After a repair passes its checks, capture what worked in YorpMind.", "yorpmind", "planning");
  const order = { urgent:0, attention:1, planning:2 };
  return actions.sort((a,b) => order[a.urgency]-order[b.urgency]).slice(0, 6);
}

export async function cockpitSnapshot(db, now = new Date()) {
  const generated_at = now.toISOString();
  const metrics = {
    missions: emptyMissions(),
    issues: { active:null, critical:null, known_active:null, known_critical:null },
    monitors: { enabled:null, passing:null, failing:null, stale:null, unknown:null,
      last_checked_at:null, freshness_window_hours:MONITOR_FRESHNESS_HOURS },
    memory: { experiences:null, approved_skills:null },
    opportunities: { proposed:null, shortlisted:null }
  };
  const sources = {};
  let recent_missions = [], recent_activity = [], coverage = null;

  await Promise.all([
    (async () => {
      try {
        const [count, recent] = await Promise.all([
          first(db, `SELECT COUNT(*) AS total,
            COALESCE(SUM(status IN ('observed','triaged','planned','queued','running','awaiting_verification','awaiting_owner_approval')),0) AS active,
            COALESCE(SUM(status='planned'),0) AS planned,
            COALESCE(SUM(status IN ('queued','running')),0) AS running,
            COALESCE(SUM(status='awaiting_owner_approval'),0) AS review,
            COALESCE(SUM(status='failed'),0) AS failed,
            COALESCE(SUM(status='completed'),0) AS completed,
            MAX(updated_at) AS observed_at,
            (SELECT COUNT(*) FROM agent_jobs WHERE job_type='owner_mission' AND origin_type='staging_rehearsal') AS rehearsals
            FROM agent_jobs WHERE ${ownerMissions}`),
          rows(db, `SELECT job_id,substr(title,1,160) AS title,status,priority,updated_at
            FROM agent_jobs WHERE ${ownerMissions} ORDER BY updated_at DESC,job_id DESC LIMIT ${COCKPIT_RECENT_LIMIT}`)
        ]);
        for (const key of Object.keys(metrics.missions)) metrics.missions[key] = number(count[key]);
        recent_missions = recent;
        sources.missions = sourceState(true, count.observed_at);
      } catch { sources.missions = sourceState(false); }
    })(),
    (async () => {
      const results = await Promise.allSettled([
        first(db, "SELECT COUNT(*) AS active,COALESCE(SUM(severity='critical'),0) AS critical,MAX(last_verified) AS observed_at " +
          "FROM admin_findings WHERE status IN ('open','investigating','awaiting_approval')"),
        first(db, "SELECT COUNT(*) AS active,COALESCE(SUM(severity='critical'),0) AS critical,MAX(last_verified) AS observed_at " +
          "FROM admin_asset_findings WHERE status IN ('open','investigating','awaiting_approval')")
      ]);
      const available = results.filter(result => result.status === "fulfilled").map(result => result.value);
      const complete = available.length === results.length;
      if (available.length) {
        metrics.issues.known_active = available.reduce((sum,row) => sum+number(row.active),0);
        metrics.issues.known_critical = available.reduce((sum,row) => sum+number(row.critical),0);
        if (complete) {
          metrics.issues.active = metrics.issues.known_active;
          metrics.issues.critical = metrics.issues.known_critical;
        }
      }
      sources.issues = sourceState(available.length>0,
        available.map(row=>row.observed_at).filter(Boolean).sort().at(-1)||null, !complete && available.length>0);
    })(),
    (async () => {
      try {
        const count = await first(db, `WITH latest AS (
          SELECT c.ok,c.checked_at FROM admin_monitors m LEFT JOIN admin_checks c ON c.id=(
            SELECT newest.id FROM admin_checks newest WHERE newest.monitor_id=m.id
            ORDER BY newest.checked_at DESC,newest.id DESC LIMIT 1) WHERE m.enabled=1
          ) SELECT COUNT(*) AS enabled,
          COALESCE(SUM(julianday(checked_at) BETWEEN julianday(?) AND julianday(?) AND ok=1),0) AS passing,
          COALESCE(SUM(julianday(checked_at) BETWEEN julianday(?) AND julianday(?) AND ok=0),0) AS failing,
          COALESCE(SUM(julianday(checked_at)<julianday(?)),0) AS stale,
          COALESCE(SUM(julianday(checked_at) IS NULL OR julianday(checked_at)>julianday(?)),0) AS unknown,
          MAX(CASE WHEN julianday(checked_at)<=julianday(?) THEN checked_at END) AS last_checked_at FROM latest`,
          new Date(now.getTime()-MONITOR_FRESHNESS_HOURS*3600000).toISOString(), generated_at,
          new Date(now.getTime()-MONITOR_FRESHNESS_HOURS*3600000).toISOString(), generated_at,
          new Date(now.getTime()-MONITOR_FRESHNESS_HOURS*3600000).toISOString(), generated_at, generated_at);
        for (const key of ["enabled","passing","failing","stale","unknown"]) metrics.monitors[key] = number(count[key]);
        metrics.monitors.last_checked_at = count.last_checked_at || null;
        sources.monitors = sourceState(true, count.last_checked_at);
      } catch { sources.monitors = sourceState(false); }
    })(),
    (async () => {
      try {
        coverage = await readWatchtowerCoverage(db,now);
        const observed = ["website","products","headquarters"]
          .map(key => coverage.surfaces[key].last_checked_at).filter(Boolean).sort().at(-1) || null;
        sources.coverage = sourceState(true,observed,coverage.truncated);
      } catch {
        coverage = null;
        sources.coverage = sourceState(false);
      }
    })(),
    (async () => {
      const results = await Promise.allSettled([
        first(db, "SELECT COUNT(*) AS count,MAX(created_at) AS observed_at FROM yorpmind_experiences WHERE status='recorded' AND scope='headquarters'"),
        first(db, "SELECT COUNT(*) AS count,MAX(updated_at) AS observed_at FROM yorpmind_skills WHERE status='approved' AND approved_revision=current_revision")
      ]);
      if (results[0].status === "fulfilled") metrics.memory.experiences = number(results[0].value.count);
      if (results[1].status === "fulfilled") metrics.memory.approved_skills = number(results[1].value.count);
      const available = results.filter(result=>result.status==="fulfilled").map(result=>result.value);
      sources.memory = sourceState(available.length>0,
        available.map(row=>row.observed_at).filter(Boolean).sort().at(-1)||null, available.length===1);
    })(),
    (async () => {
      try {
        const count = await first(db, "SELECT COALESCE(SUM(status='proposed'),0) AS proposed," +
          "COALESCE(SUM(status='shortlisted'),0) AS shortlisted,MAX(updated_at) AS observed_at FROM hq_intelligence_ideas");
        metrics.opportunities = { proposed:number(count.proposed), shortlisted:number(count.shortlisted) };
        sources.opportunities = sourceState(true, count.observed_at);
      } catch { sources.opportunities = sourceState(false); }
    })(),
    (async () => {
      try {
        recent_activity = await rows(db, `SELECT e.event_id,e.job_id,substr(j.title,1,160) AS title,
          substr(e.event_type,1,100) AS event_type,e.actor_type,e.created_at
          FROM agent_job_events e JOIN agent_jobs j ON j.job_id=e.job_id
          WHERE j.job_type='owner_mission' AND COALESCE(j.origin_type,'')!='staging_rehearsal'
          ORDER BY e.created_at DESC,e.event_id DESC LIMIT ${COCKPIT_RECENT_LIMIT}`);
        sources.activity = sourceState(true, recent_activity[0]?.created_at||null);
      } catch { sources.activity = sourceState(false); }
    })()
  ]);

  const available = Object.values(sources).filter(source=>source.available).length;
  return {
    name: "YorpHives Founder Cockpit", generated_at, scope:"private_database_evidence",
    availability: available===0 ? "unavailable" : available===Object.keys(sources).length &&
      Object.values(sources).every(source=>!source.partial) ? "ready" : "partial",
    metrics, sources, coverage, recent_missions, recent_activity,
    next_actions: cockpitActions(metrics,sources),
    finances: { revenue:null, operating_cost:null, status:"not_connected",
      message:"Revenue and provider bills are not connected. Dispatch counts are not financial costs." },
    read_only:true,
    limitations:"Counts cover each whole source table. Recent mission and activity lists contain at most six records. " +
      "Monitoring and Watchtower show only stored HTTP reachability and Access-boundary checks, not product functionality or HQ runtime uptime. Research ideas are unvalidated hypotheses. " +
      "Memory contains recorded QA lessons; skill approval does not grant execution."
  };
}
