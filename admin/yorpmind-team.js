(() => {
  "use strict";
  const el = id => document.getElementById(id);
  const node = (tag, className = "", value) => {
    const out = document.createElement(tag);
    if (className) out.className = className;
    if (value !== undefined) out.textContent = String(value);
    return out;
  };
  const pretty = value => {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toLocaleString() : "Unknown";
  };
  let fetching = false;

  function renderPerson(person) {
    const card = node("article", "ym-team-person");
    const top = node("div", "ym-team-person-head");
    top.append(node("strong", "", person.display_name),
      node("span", "ym-team-tag", person.tier.toUpperCase()));
    card.append(top,
      node("p", "", person.reports_to ? "Reports to: " + person.reports_to : "Reports to: Founder"),
      node("p", "ym-team-counts",
        person.direct_bot_count + " specialist bots · " + person.active_job_count + " active jobs"),
      node("p", "ym-team-muted", "Supervision: " + person.domain + " · max parallel reviews: " + person.max_parallel_reviews));
    if (person.bots.length) {
      const agents = node("div", "ym-team-bots");
      for (const bot of person.bots.slice(0, 12)) {
        agents.append(node("span", "ym-team-bot",
          bot.display_name + " · " + (bot.enabled ? bot.status : "disabled")));
      }
      card.append(agents);
    } else {
      card.append(node("p", "ym-team-muted", "No active registry specialists assigned to this domain."));
    }
    return card;
  }

  function reportCard(report) {
    const card = node("article", "ym-team-report");
    const head = node("div", "ym-team-report-head");
    head.append(
      node("strong", "", report.recommendation.replaceAll("_", " ")),
      node("span", "ym-team-tag", report.severity.toUpperCase() + " · " + report.state)
    );
    card.append(head,
      node("p", "", report.summary),
      node("p", "ym-team-muted", report.manager_id + " → " + report.subject_agent_id),
      node("p", "ym-team-muted", "Job: " + report.source_job_id + " · " + pretty(report.created_at)));
    if (report.state !== "proposed") {
      card.append(node("p", "ym-team-muted", "Reviewed by " + (report.reviewed_by || "Unknown") +
        " on " + pretty(report.reviewed_at) + ". No execution was authorized."));
      return card;
    }
    const form = node("form", "ym-team-form");
    const label = node("label", "", "Review rationale (40–1000 characters)");
    const note = node("textarea");
    note.required = true;
    note.minLength = 40;
    note.maxLength = 1000;
    note.rows = 3;
    note.placeholder = "Explain the evidence, risks, and next permitted action.";
    label.append(note);
    const actions = node("div", "ym-team-report-actions");
    const confirm = node("button", "button primary", "Acknowledge");
    const reject = node("button", "button", "Dismiss");
    confirm.type = reject.type = "submit";
    confirm.dataset.decision = "acknowledge";
    reject.dataset.decision = "dismiss";
    actions.append(confirm, reject);
    const message = node("p", "ym-team-muted");
    message.setAttribute("role", "status");
    form.append(label, actions, message);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const decision = event.submitter?.dataset.decision || "dismiss";
      if (!window.confirm("Record this supervisor report review? This never dispatches work or approves a release.")) return;
      confirm.disabled = reject.disabled = true;
      try {
        const result = await window.api("/api/admin/yorpmind-team", {
          method: "PATCH",
          body: JSON.stringify({
            report_id: report.report_id,
            decision,
            review_note: note.value.trim()
          })
        });
        if (result.dispatch_performed !== false || result.approval_granted !== false) throw Error("Unexpected authorization response.");
        await window.loadYorpMindTeam();
      } catch (error) {
        message.textContent = error instanceof Error ? error.message : "Report review failed.";
        confirm.disabled = reject.disabled = false;
      }
    });
    card.append(form);
    return card;
  }

  function render(data) {
    const people = el("ym-team-people");
    people.replaceChildren(...data.reporting_hierarchy.staff.map(renderPerson));
    const now = el("ym-team-current");
    now.replaceChildren();
    for (const advice of data.current_recommendations) {
      now.append(node("article", "ym-team-advice",
        advice.manager_id + " · " + advice.severity.toUpperCase() + " · " +
        advice.summary + " · job " + advice.source_job_id));
    }
    if (!data.current_recommendations.length)
      now.append(node("p", "ym-team-muted", "No current bounded recommendations. This does not certify the team is healthy."));
    const reports = el("ym-team-reports");
    reports.replaceChildren();
    for (const report of data.saved_reports) reports.append(reportCard(report));
    if (!data.saved_reports.length)
      reports.append(node("p", "ym-team-muted", "No daily reports saved yet. Scheduled scanning requires an approved Worker rollout."));
    el("ym-team-status").textContent = data.reporting_hierarchy.total_specialists +
      " registered bots · " + data.reporting_hierarchy.active_jobs +
      " active jobs · " + data.reporting_hierarchy.pending_jobs +
      " pending jobs · mission budget " + data.shared_mission_budget.daily_used +
      " / " + data.shared_mission_budget.daily_limit +
      " today (UTC) · zero additional AI calls for team monitoring.";
  }

  window.loadYorpMindTeam = async () => {
    if (fetching) return;
    fetching = true;
    el("ym-team-status").textContent = "Reading private staff and mission metadata…";
    try {
      const data = await window.api("/api/admin/yorpmind-team");
      if (data.system !== "yorpmind_team_management" ||
          data.autonomous_dispatch !== false || data.production_execution !== false ||
          data.review_is_not_approval !== true ||
          data.model_calls_per_team_scan !== 0 ||
          !Array.isArray(data.reporting_hierarchy?.staff) ||
          !Array.isArray(data.saved_reports) || !Array.isArray(data.current_recommendations))
        throw Error("Supervisor safety contract was not confirmed.");
      render(data);
    } catch (error) {
      el("ym-team-status").textContent = error instanceof Error ? error.message : "Supervisor report unavailable.";
      el("ym-team-people").replaceChildren();
      el("ym-team-current").replaceChildren();
      el("ym-team-reports").replaceChildren();
    } finally { fetching = false; }
  };

  function initialize() {
    el("ym-team-refresh")?.addEventListener("click", () => window.loadYorpMindTeam());
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
