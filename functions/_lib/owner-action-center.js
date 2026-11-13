/**
 * Private founder decision queue. Deterministic, read-only advice from
 * existing Headquarters D1 receipts, never from model instructions.
 */
export const MAX_FOUNDER_ACTIONS = 6;
const priorities = { urgent: 0, attention: 1, planning: 2 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function failureCode(json) {
  if (typeof json !== "string" || json.length > 12000) return "UNCLASSIFIED_FAILURE";
  try {
    const parsed = JSON.parse(json);
    const code = parsed && typeof parsed.code === "string" ? parsed.code : "";
    if (/^BRIEF_[A-Z_]+$/.test(code)) return code;
    if (typeof parsed?.error === "string" && /valid JSON/i.test(parsed.error))
      return "BRIEF_JSON_INVALID";
  } catch { /* Never follow instructions from stored error text. */ }
  return "UNCLASSIFIED_FAILURE";
}
const safeJob = row => typeof row?.job_id === "string" && UUID.test(row.job_id);

export function founderActionQueue(facts, now = new Date()) {
  const jobs = (Array.isArray(facts.jobs) ? facts.jobs : []).slice(0, 50);
  const validJobs = jobs.filter(safeJob);
  const actions = [];
  function add(id, urgency, title, why, next_step, view, target = null) {
    actions.push({ id, urgency, title, why, next_step, view, target,
      execution_authorized: false, approval_granted: false });
  }
  const failed = validJobs.filter(j => j.status === "failed");
  for (const job of failed.slice(0, 2)) {
    const code = failureCode(job.result_json);
    add("failed-" + job.job_id, "urgent", "Investigate a failed specialist mission",
      "A recorded AI mission failed (" + code + "). No successful brief was stored.",
      "Open mission history and inspect the error. Verify a fix in staging before explicitly starting another paid mission.",
      "headquarters", "failed");
  }
  const reviews = validJobs.filter(j => j.status === "awaiting_owner_approval");
  if (reviews.length) add("review-briefs", "attention", "Review " + reviews.length + " AI planning brief" +
      (reviews.length === 1 ? "" : "s"),
      "These recommendations are awaiting your judgment; they have not been independently verified.",
      "Read the brief, check its evidence, then acknowledge or discard it. This never authorizes release.",
      "headquarters", "review");
  if (Number(facts.repairReviewCount) > 0)
    add("repair-review", "urgent", "Review verified repair candidates",
      facts.repairReviewCount + " repair job(s) are marked for owner review.",
      "Inspect exact CI receipts, issue-specific QA, and real previews before preparing any release authorization.",
      "releases");
  if (Number(facts.pendingMfaCount) > 0)
    add("mfa-release", "urgent", "Review pending release authorization",
      facts.pendingMfaCount + " scoped request(s) await independent founder MFA.",
      "Check exact commit, preview and expiry; enter OTP only in the dedicated Cloudflare Access challenge.",
      "releases");
  const failedReviews = Number(facts.pendingTeamReports) || 0;
  if (failedReviews > 0)
    add("manager-reports", "attention", "Review YorpMind team reports",
      failedReviews + " supervisor recommendation(s) need review. They are not approved changes.",
      "Open YorpMind, inspect evidence and acknowledge or dismiss. Do not treat manager agreement as independent QA.",
      "yorpmind");
  if (facts.teamSchemaReady === false)
    add("team-schema", "attention", "Finish the private team database rollout",
      "The YorpMind staff/report tables are absent in this D1 environment.",
      "Reconcile previous SQL migrations, take a verified backup, then apply and restore-test migration 0027 in isolated staging. No production DB change is authorized.",
      "yorpmind");
  const monitorAt = Date.parse(String(facts.lastMonitorAt || ""));
  if (facts.lastMonitorAt && (!Number.isFinite(monitorAt) ||
      now.getTime() - monitorAt > 8 * 3600000))
    add("monitor-freshness", "attention", "Check monitoring freshness",
      "The last recorded monitor run is older than eight hours or has an invalid timestamp.",
      "Inspect monitoring results and Worker schedules; a recorded run is not proof all routes are healthy.",
      "monitoring");
  const successful = validJobs.filter(j => j.status === "completed").length;
  if (!successful && validJobs.length > 0 && failed.length === 0 && reviews.length === 0)
    add("first-complete-mission", "planning", "Validate one specialist mission end to end",
      "No completed mission appears in the latest bounded job window.",
      "Run a staged, owner-initiated recommendation with acceptance criteria and review the saved evidence.",
      "headquarters", "active");
  actions.sort((a,b) => priorities[a.urgency] - priorities[b.urgency] ||
    a.id.localeCompare(b.id));
  const selected = actions.slice(0, MAX_FOUNDER_ACTIONS);
  return {
    actions: selected,
    pending_total_in_window: actions.length,
    truncated: actions.length > MAX_FOUNDER_ACTIONS,
    recorded_jobs_scanned: jobs.length,
    release_execution_enabled: false,
    auto_ai_dispatch_enabled: false,
    overview: {
      failed_missions: failed.length,
      awaiting_brief_review: reviews.length,
      completed_missions_in_window: successful,
      pending_repair_review: Number(facts.repairReviewCount) || 0,
      pending_release_mfa: Number(facts.pendingMfaCount) || 0,
      pending_team_reports: failedReviews
    },
    limitations: "Private D1 evidence only. Up to 50 recent missions were sampled. No live GitHub CI, production health, preview-to-SHA attestation, MFA enforcement or billing was independently verified. This read-only queue cannot authorize actions."
  };
}
