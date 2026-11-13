/**
 * Deterministic, resource-aware YorpMind reporting planner.
 * This module has no network calls, AI inference or authority to dispatch.
 * Existing agent capabilities and mission limits remain authoritative.
 */
export const MAX_TEAM_REPORTS_PER_DAY = 8;
export const MAX_TEAM_JOBS_SCANNED = 100;
export const MAX_TEAM_AGENTS_SCANNED = 80;
export const REVIEW_STALE_HOURS = 24;
export const ACTIVE_JOB_CAP = 3;
export const DAILY_MISSION_CAP = 6;

const active = new Set(["queued", "running"]);
const pending = new Set(["planned", "awaiting_owner_approval"]);
const safeTime = value => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
};
const clean = value => String(value || "").normalize("NFKC").trim().toLowerCase();
const byPriority = { high: 0, medium: 1, low: 2 };

export function teamLeadFor(departmentId, departmentName = "") {
  const source = clean(departmentId + " " + departmentName);
  if (/secur|quality|assurance|audit|compliance|test/.test(source)) return "yorpmind5";
  if (/engineer|operat|reliab|infrastructure|platform|develop|technical/.test(source)) return "yorpmind1";
  if (/research|innov|intelligen|market|discover|trend|opportunit/.test(source)) return "yorpmind2";
  if (/revenue|business|monetiz|finance|sales|commercial|partner/.test(source)) return "yorpmind4";
  if (/product|growth|marketing|design|experien|customer/.test(source)) return "yorpmind3";
  return "yorpmind";
}

export function describeTeam(staff, agents, jobs, departments) {
  const deptNames = new Map((departments || []).map(d => [d.department_id, d.name]));
  const loads = new Map();
  const validAgents = (agents || []).slice(0, MAX_TEAM_AGENTS_SCANNED);
  const validJobs = (jobs || []).slice(0, MAX_TEAM_JOBS_SCANNED);
  for (const job of validJobs) {
    if (!active.has(job.status)) continue;
    loads.set(job.agent_id, (loads.get(job.agent_id) || 0) + 1);
  }
  const people = (staff || []).filter(p => p.enabled === 1).map(member => {
    const reports = validAgents.filter(agent =>
      teamLeadFor(agent.department_id, deptNames.get(agent.department_id)) === member.staff_id);
    return {
      staff_id: member.staff_id,
      display_name: member.display_name,
      tier: member.tier,
      domain: member.domain,
      reports_to: member.reports_to,
      max_parallel_reviews: member.max_parallel_reviews,
      enabled: true,
      direct_bot_count: reports.length,
      active_job_count: reports.reduce((sum, agent) => sum + (loads.get(agent.agent_id) || 0), 0),
      bots: reports.map(agent => ({
        agent_id: agent.agent_id,
        display_name: agent.display_name,
        department_id: agent.department_id,
        status: agent.status,
        enabled: agent.enabled === 1,
        autonomy_level: agent.autonomy_level,
        active_jobs: loads.get(agent.agent_id) || 0
      }))
    };
  });
  return {
    staff: people,
    total_specialists: validAgents.length,
    active_jobs: validJobs.filter(j => active.has(j.status)).length,
    pending_jobs: validJobs.filter(j => pending.has(j.status)).length,
    jobs_scanned: validJobs.length,
    agents_scanned: validAgents.length,
    coverage_exhaustive: false
  };
}


/**
 * Verify the structural completeness of an existing model result.
 * The brief's prose is untrusted and never copied into manager instructions.
 * This is NOT independent factual verification or security attestation.
 */
export function inspectSpecialistBrief(value) {
  if (typeof value !== "string" || value.length > 20000 || value.length === 0)
    return { schema_valid: false, verification_steps: 0, risks_listed: 0, claims_verified: false };
  let parsed;
  try { parsed = JSON.parse(value); } catch {
    return { schema_valid: false, verification_steps: 0, risks_listed: 0, claims_verified: false };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return { schema_valid: false, verification_steps: 0, risks_listed: 0, claims_verified: false };
  const sections = ["summary","recommended_approach"];
  const lists = ["actions","risks","assumptions","verification_needed"];
  const valid = parsed.kind === "recommendation_brief" && parsed.verified === false &&
    sections.every(k => typeof parsed[k] === "string" && parsed[k].trim().length >= 3 && parsed[k].length <= 10000) &&
    lists.every(k => Array.isArray(parsed[k]) && parsed[k].length <= 25 &&
      parsed[k].every(item => typeof item === "string" && item.length <= 2500)) &&
    parsed.actions.length >= 1 && parsed.verification_needed.length >= 1;
  return {
    schema_valid: Boolean(valid),
    verification_steps: Array.isArray(parsed.verification_needed) ? Math.min(25,parsed.verification_needed.length) : 0,
    risks_listed: Array.isArray(parsed.risks) ? Math.min(25,parsed.risks.length) : 0,
    claims_verified: false
  };
}

function makeAdvice(kind, severity, job, agent, managerId, summary) {
  return {
    report_key: kind + ":" + job.job_id,
    manager_id: managerId,
    source_job_id: job.job_id,
    subject_agent_id: String(job.agent_id || ""),
    recommendation: kind,
    severity,
    summary,
    evidence: {
      job_id: job.job_id, agent_id: String(job.agent_id || ""),
      status: String(job.status), updated_at: String(job.updated_at || ""),
      manager_id: managerId, agent_enabled: agent?.enabled === 1,
      capability: String(agent?.autonomy_level || "unknown"),
      independent_qa_verified: false, execution_authorized: false,
      brief_review: job.status === "awaiting_owner_approval" ? inspectSpecialistBrief(job.result_json) : null
    }
  };
}

export function recommendTeamActions(staff, agents, jobs, departments, now = new Date(), limits = {}) {
  const members = new Set((staff || []).filter(x => x.enabled === 1).map(x => x.staff_id));
  const agentById = new Map((agents || []).map(a => [a.agent_id, a]));
  const deptNames = new Map((departments || []).map(d => [d.department_id, d.name]));
  const sourceJobs = (jobs || []).slice(0, MAX_TEAM_JOBS_SCANNED);
  const activeJobs = sourceJobs.filter(j => active.has(j.status)).length;
  // Stop suggesting new paid AI work while a recent task needs review,
  // an investigation is unresolved, or an in-flight mission is stale.
  // This never cancels existing jobs or changes the authoritative dispatch cap.
  const needsIntervention = sourceJobs.some(job => {
    if (job.status === "failed" || job.status === "awaiting_owner_approval") return true;
    if (!active.has(job.status)) return false;
    const updated = safeTime(job.updated_at);
    return updated !== null &&
      Math.max(0, (now.getTime() - updated) / 3600000) >= REVIEW_STALE_HOURS;
  });
  const dailyUsed = Number.isInteger(limits.dailyMissionsUsed) && limits.dailyMissionsUsed >= 0
    ? limits.dailyMissionsUsed : DAILY_MISSION_CAP;
  const supervisorCap = new Map((staff || []).map(s => [s.staff_id, s.max_parallel_reviews]));
  const activeByManager = new Map();
  const activeByAgent = new Map();
  for (const job of sourceJobs) {
    if (active.has(job.status)) {
      activeByAgent.set(job.agent_id, (activeByAgent.get(job.agent_id) || 0) + 1);
      const assigned = agentById.get(job.agent_id);
      const lead = teamLeadFor(assigned?.department_id || "", deptNames.get(assigned?.department_id));
      activeByManager.set(lead, (activeByManager.get(lead) || 0) + 1);
    }
  }
  const candidates = [];
  const seenCompleted = new Map();
  for (const job of sourceJobs) {
    if (job.status !== "completed" || !job.title) continue;
    const key = clean(job.title);
    if (!seenCompleted.has(key)) seenCompleted.set(key, job);
  }
  for (const job of sourceJobs) {
    if (!job || typeof job.job_id !== "string" || job.job_id.length > 80) continue;
    const agent = agentById.get(job.agent_id);
    const preferred = teamLeadFor(agent?.department_id || "", deptNames.get(agent?.department_id));
    const managerId = members.has(preferred) ? preferred : "yorpmind";
    if (!members.has(managerId)) continue;
    const elapsed = safeTime(job.updated_at);
    const hours = elapsed === null ? 0 : Math.max(0, (now.getTime() - elapsed) / 3600000);
    if (job.status === "awaiting_owner_approval") {
      const review = inspectSpecialistBrief(job.result_json);
      candidates.push(makeAdvice("review_specialist_output", "high", job, agent, managerId,
        review.schema_valid
          ? "Saved specialist brief has required review sections. Verify its claims and listed checks independently before any action."
          : "Saved specialist brief lacks one or more required fields or independent verification steps. Request a corrected draft before owner action."));
    } else if (job.status === "failed") {
      candidates.push(makeAdvice("investigate_failed_mission", "medium", job, agent, managerId,
        "Investigate recorded failure and evidence before proposing a bounded retry. No retry has been scheduled."));
    } else if (active.has(job.status) && hours >= REVIEW_STALE_HOURS) {
      candidates.push(makeAdvice("investigate_stalled_mission", "high", job, agent, managerId,
        "This mission has not changed for at least 24 hours. Verify live status before retrying or reallocating."));
    } else if (job.status === "planned") {
      const old = seenCompleted.get(clean(job.title));
      if (old && old.job_id !== job.job_id) {
        candidates.push(makeAdvice("verify_reusable_history", "medium", job, agent, managerId,
          "A prior completed mission has the same normalized title. Review historical results before spending inference; past completion is not verified correctness."));
      } else if (!needsIntervention && agent?.enabled === 1 && agent?.status === "ready" && agent.autonomy_level === "recommend"
          && activeJobs < ACTIVE_JOB_CAP && dailyUsed < DAILY_MISSION_CAP
          && (activeByManager.get(managerId) || 0) < (supervisorCap.get(managerId) || 1)
          && (activeByAgent.get(job.agent_id) || 0) < 2
          && (!job.job_type || job.job_type === "owner_mission")) {
        candidates.push(makeAdvice("route_planned_mission", "low", job, agent, managerId,
          "This ready specialist has spare recorded capacity. Offer the planned mission for owner-initiated dispatch under the existing daily AI budget."));
      } else {
        candidates.push(makeAdvice("review_capacity", "low", job, agent, managerId,
          needsIntervention ?
          "Existing failed, unverified or stalled work needs intervention before recommending more AI spend. Review its evidence first." :
          "Planned work is not dispatchable under observed worker capacity or permissions. Review allocation before enabling more work."));
      }
    }
  }
  candidates.sort((a, b) => byPriority[a.severity] - byPriority[b.severity] ||
    a.manager_id.localeCompare(b.manager_id) || a.report_key.localeCompare(b.report_key));
  return candidates.slice(0, MAX_TEAM_REPORTS_PER_DAY);
}
