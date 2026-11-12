(() => {
  "use strict";
  const byId = id => document.getElementById(id);
  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = String(text);
    return el;
  };
  const moment = value => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Unknown";
  };
  let fetching = false;

  function metric(label, value, note) {
    const card = make("article", "ym-evolution-metric");
    card.append(make("span", "", label), make("strong", "", value), make("small", "", note));
    return card;
  }

  function render(data) {
    const run = data.last_runs[0] || null;
    const status = byId("ym-evolution-status");
    status.textContent = run
      ? "Last daily observation: " + moment(run.completed_at || run.created_at) +
        " · " + run.status + " · " + run.experiences_scanned + " experiences scanned"
      : "No daily evolution scan has run yet. The scheduled scanner runs only after its Worker is deployed.";
    byId("ym-evolution-metrics").replaceChildren(
      metric("Pending suggestions", data.pending_proposals, "Founder review required"),
      metric("Recently reviewed", data.reviewed_proposals, "Acknowledged or dismissed"),
      metric("Max new suggestions", "3/day", "Unique historical topics"),
      metric("Extra AI calls", "0", "Deterministic pattern scan")
    );
    const host = byId("ym-evolution-proposals");
    host.replaceChildren();
    if (!data.proposals.length) {
      host.append(make("p", "ym-empty",
        "No recurring patterns have been recorded. That doesn't prove none exist: the scanner examines a bounded recent history."));
      return;
    }
    for (const proposal of data.proposals) {
      const item = make("article", "ym-evolution-item");
      const header = make("div", "ym-entry-head");
      header.append(make("strong", "", "Recurring topic: " + proposal.topic_key.replaceAll("-", " ")),
        make("span", "ym-badge " + (proposal.status === "proposed" ? "ym-badge-draft" : "ym-badge-private"),
          proposal.status.toUpperCase()));
      item.append(header,
        make("p", "ym-entry-summary", proposal.rationale),
        make("p", "ym-source", proposal.candidate_type === "new_reference_skill"
          ? "Suggested next step: consider a NEW reference skill, with founder-written steps."
          : "Suggested next step: review an existing reference skill before proposing a new revision."),
        make("p", "ym-source", proposal.evidence_count +
          " separate historical QA observations · " + proposal.evidence_ids.join(", ")),
        make("p", "ym-source", "Found " + moment(proposal.proposed_at) +
          " · NOT independently verified or actionable.")
      );
      if (proposal.status === "proposed") {
        const form = make("form", "ym-evolution-review");
        const label = make("label", "", "Reason for reviewing this suggestion (40–1000 characters)");
        const note = make("textarea");
        note.rows = 3;
        note.required = true;
        note.minLength = 40;
        note.maxLength = 1000;
        note.placeholder = "Describe whether the historical QA supports this proposed improvement and what needs to be tested next.";
        label.append(note);
        const buttons = make("div", "ym-evolution-actions");
        const acknowledge = make("button", "button primary", "Acknowledge for planning");
        const dismiss = make("button", "button", "Dismiss suggestion");
        acknowledge.type = dismiss.type = "submit";
        acknowledge.dataset.decision = "acknowledge";
        dismiss.dataset.decision = "dismiss";
        const message = make("p", "ym-form-status");
        message.setAttribute("role", "status");
        buttons.append(acknowledge, dismiss);
        form.append(label, buttons, message);
        form.addEventListener("submit", async event => {
          event.preventDefault();
          if (!form.reportValidity()) return;
          const decision = event.submitter?.dataset.decision || "dismiss";
          if (decision === "acknowledge" && !confirm(
            "Mark this pattern reviewed for planning only? No skill, code or production change will occur."
          )) return;
          acknowledge.disabled = dismiss.disabled = true;
          message.textContent = "Recording owner review…";
          try {
            await api("/api/admin/yorpmind-evolution", {
              method: "PATCH",
              body: JSON.stringify({ proposal_id: proposal.proposal_id,
                decision, review_note: note.value.trim() })
            });
            await window.loadYorpMindEvolution();
          } catch (error) {
            message.textContent = error instanceof Error ? error.message : "Review could not be saved.";
            acknowledge.disabled = dismiss.disabled = false;
          }
        });
        item.append(form);
      } else {
        item.append(make("p", "ym-source",
          "Reviewed by " + proposal.reviewed_by + " · " + moment(proposal.reviewed_at) +
          " · No skill was modified."));
      }
      host.append(item);
    }
  }

  window.loadYorpMindEvolution = async () => {
    if (fetching) return;
    fetching = true;
    byId("ym-evolution-status").textContent = "Reading D1 evolution proposals…";
    try {
      const data = await api("/api/admin/yorpmind-evolution");
      if (data.name !== "YorpMind" || data.scope !== "headquarters" ||
          data.autonomous_skill_mutation !== false ||
          data.deployment_enabled !== false || data.model_calls_per_scan !== 0 ||
          data.maximum_proposals_per_day !== 3 || !Array.isArray(data.proposals)) {
        throw Error("Evolution safety policy could not be verified.");
      }
      render(data);
    } catch (error) {
      byId("ym-evolution-status").textContent =
        error instanceof Error ? error.message : "Evolution evidence unavailable.";
      byId("ym-evolution-metrics").replaceChildren();
      byId("ym-evolution-proposals").replaceChildren(
        make("p", "ym-empty", "No verified evolution proposals loaded. Production remains locked."));
    } finally { fetching = false; }
  };
  function initialize() {
    byId("ym-evolution-refresh").addEventListener("click", () => window.loadYorpMindEvolution());
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
