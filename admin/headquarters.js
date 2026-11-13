(() => {
  "use strict";
  const el = id => document.getElementById(id);
  const make = (tag, cls = "", content) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (content !== undefined) node.textContent = String(content);
    return node;
  };
  const date = timestamp => {
    const value = new Date(timestamp);
    return Number.isNaN(value.getTime()) ? "Unknown" : value.toLocaleString();
  };
  const labels = {
    planned: "Planned", queued: "Queued", running: "Generating",
    awaiting_owner_approval: "Review brief", completed: "Brief reviewed",
    cancelled: "Cancelled", failed: "Failed"
  };
  const closed = new Set(["completed", "cancelled", "failed", "rolled_back"]);
  let snapshot = null;
  let requestId = crypto.randomUUID();
  let loading = false;

  function statusClass(status) {
    return "hq-pill hq-pill-" + (["queued","running"].includes(status) ? "active" : status === "awaiting_owner_approval" ? "review" : status === "failed" ? "error" : closed.has(status) ? "closed" : "planned");
  }
  function listBlock(title, items, cls = "") {
    if (!Array.isArray(items) || items.length === 0) return null;
    const section = make("div", "hq-brief-section " + cls);
    section.append(make("h4", "", title));
    const list = make("ul");
    for (const item of items.slice(0, 8)) list.append(make("li", "", typeof item === "string" ? item : ""));
    section.append(list);
    return section;
  }
  function renderResult(mission) {
    if (!mission.result_json) return null;
    let result;
    try { result = JSON.parse(mission.result_json); }
    catch { return make("p", "hq-error", "Saved result is not readable."); }
    const details = make("details", "hq-brief");
    const summary = make("summary", "", result.error ? "Read failure details" : "Open AI decision brief");
    details.append(summary);
    if (result.error) {
      details.append(make("p", "hq-error", result.error));
      return details;
    }
    details.append(make("p", "hq-brief-warning", "MODEL ANALYSIS · NOT FACT-CHECKED · NO EXTERNAL RESEARCH"));
    details.append(make("h3", "", result.summary || "AI recommendation"));
    details.append(make("p", "hq-brief-intro", result.recommended_approach || ""));
    for (const block of [
      listBlock("Recommended next actions", result.actions),
      listBlock("Risks to manage", result.risks),
      listBlock("Assumptions", result.assumptions),
      listBlock("What must be independently verified", result.verification_needed, "hq-verify")
    ]) if (block) details.append(block);
    details.append(make("p", "hq-brief-source", "Source: " + (result.model || "AI") + " · This is a planning artifact, not completed work or verified evidence."));
    return details;
  }
  async function transition(mission, action, button) {
    button.disabled = true;
    const original = button.textContent;
    button.textContent = ({ dispatch: "Starting…", cancel: "Cancelling…", review_brief: "Recording review…", discard_brief: "Discarding…" })[action] || "Updating…";
    try {
      const payload = { job_id: mission.job_id, action, expected_updated_at: mission.updated_at };
      await api("/api/admin/headquarters", { method: "PATCH", body: JSON.stringify(payload) });
      await window.loadHeadquarters();
    } catch (error) {
      showSystemMessage(error.message, { kind: "error", reauthenticate: /Cloudflare Access/i.test(error.message) });
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }
  function renderMissions() {
    const target = el("hq-missions");
    target.replaceChildren();
    const filter = el("hq-filter").value;
    const selected = snapshot.missions.filter(m =>
      filter === "all" ||
      (filter === "staging" ? m.origin_type === "staging_rehearsal" :
      m.origin_type !== "staging_rehearsal" &&
      (filter === "active" ? !closed.has(m.status) :
        filter === "review" ? m.status === "awaiting_owner_approval" : m.status === filter))
    );
    if (!selected.length) {
      const empty = make("div", "hq-empty");
      empty.append(make("div", "hq-empty-icon", "◇"), make("h3", "", "Nothing in this view"), make("p", "", "Create a new mission or choose a different filter to see previous work."));
      target.append(empty);
    }
    for (const mission of selected) {
      const synthetic = mission.origin_type === "staging_rehearsal";
      const agent = snapshot.specialists.find(x => x.agent_id === mission.agent_id);
      const card = make("article", "hq-mission-card");
      const top = make("div", "hq-mission-top");
      const left = make("div", "hq-mission-meta");
      left.append(make("span", "hq-priority hq-priority-" + mission.priority, mission.priority), make("span", "hq-specialist", agent?.display_name || "Unassigned"));
      top.append(left, make("span", statusClass(mission.status),
        synthetic && mission.status === "awaiting_owner_approval" ? "Synthetic brief saved" :
        labels[mission.status] || mission.status.replaceAll("_", " ")));
      card.append(top, make("h3", "hq-mission-title", mission.title), make("p", "hq-mission-desc", mission.request_summary));
      if (synthetic) card.append(make("p", "hq-staging-note",
        "STAGING REHEARSAL · This was started by an isolated test Workflow, not dispatched by you. Read its evidence without acknowledging, approving or deploying anything."));
      const footer = make("div", "hq-mission-footer");
      footer.append(make("span", "", date(mission.created_at)));
      if (mission.status === "planned" && !synthetic) {
        const supported = Boolean(snapshot.engine_available && agent?.enabled === 1 && agent?.status === "ready" && agent?.autonomy_level === "recommend");
        const remaining = Number(snapshot.mission_budget?.remaining ?? 0);
        const permitted = supported && remaining > 0;
        const buttons = make("div", "hq-mission-actions");
        if (permitted) {
          const dispatch = make("button", "hq-small-primary", "Start AI brief ↗");
          dispatch.type = "button";
          dispatch.title = "Create an unverified AI recommendation brief. No website or financial changes.";
          dispatch.addEventListener("click", () => {
            if (confirm("Start one bounded recommendation using your configured model? Review the result before taking action.")) transition(mission, "dispatch", dispatch);
          });
          buttons.append(dispatch);
        } else {
          buttons.append(make("span", "hq-no-engine", supported && remaining <= 0 ? "Today’s AI brief allowance is exhausted. Planning and monitoring remain available." : agent?.autonomy_level === "sandbox_execute" ? "Execution runtime not enabled" : "Brief engine unavailable or specialist disabled"));
        }
        const cancel = make("button", "hq-small-muted", "Cancel");
        cancel.type = "button";
        cancel.addEventListener("click", () => {
          if (confirm("Cancel this planned mission?")) transition(mission, "cancel", cancel);
        });
        buttons.append(cancel);
        footer.append(buttons);
      }
      if (mission.status === "queued" || mission.status === "running") {
        footer.append(make("span", "hq-inprogress", "Your mission engine is preparing this brief."));
      }
      if (mission.status === "awaiting_owner_approval" && mission.result_json && !synthetic) {
        const actions = make("div", "hq-mission-actions");
        const review = make("button", "hq-small-primary", "Mark brief reviewed ✓");
        review.type = "button";
        review.title = "Acknowledge receiving this unverified planning brief. No code, financial or production approval is granted.";
        review.addEventListener("click", () => {
          if (confirm("Acknowledge this planning brief? This does NOT fact-check AI claims or authorize any production or financial action.")) {
            transition(mission, "review_brief", review);
          }
        });
        const discard = make("button", "hq-small-muted", "Discard brief");
        discard.type = "button";
        discard.addEventListener("click", () => {
          if (confirm("Discard this AI planning brief without authorizing further action?")) {
            transition(mission, "discard_brief", discard);
          }
        });
        actions.append(review, discard);
        footer.append(actions);
      }
      if (synthetic && mission.status === "awaiting_owner_approval") {
        footer.append(make("span", "hq-inprogress", "Staging result saved · inspect evidence below · no owner approval required."));
      }
      if (mission.status === "completed" && mission.result_json) {
        footer.append(make("span", "hq-inprogress", "Brief acknowledged · model claims still unverified."));
      }
      if (!synthetic && window.HQMissionMemory?.addMissionReview) window.HQMissionMemory.addMissionReview(mission, footer);
      card.append(footer);
      const result = renderResult(mission);
      if (result) card.append(result);
      if (window.HQMissionProof?.attach) window.HQMissionProof.attach(mission, card);
      target.append(card);
    }
  }
  function renderDepartments() {
    const target = el("hq-team");
    target.replaceChildren();
    for (const department of snapshot.departments) {
      const card = make("article", "rounded-xl border border-slate-700 bg-slate-900/70 p-6");
      card.append(
        make("span", "text-xs tracking-widest text-cyan-300 uppercase", department.department_id.replaceAll("-", " ")),
        make("h2", "text-lg font-semibold mt-3 mb-2", department.name),
        make("p", "text-sm text-slate-400 mb-5", department.mission)
      );
      for (const agent of snapshot.specialists.filter(a => a.department_id === department.department_id)) {
        const row = make("div", "border-t border-slate-800 pt-4 mt-4");
        row.append(
          make("strong", "block text-sm", agent.display_name),
          make("p", "text-xs text-slate-400 mt-2", agent.description),
          make("p", "text-xs text-amber-200 mt-3", agent.enabled && agent.status === "ready" && agent.autonomy_level === "recommend" ? "Recommendation briefs enabled · owner-controlled" : agent.status + " · execution disabled")
        );
        card.append(row);
      }
      target.append(card);
    }
  }
  function renderEvents() {
    const target = el("hq-events");
    target.replaceChildren();
    if (!snapshot.events.length) {
      target.append(make("p", "hq-event-empty", "No mission activity yet."));
      return;
    }
    for (const event of snapshot.events.slice(0, 12)) {
      const mission = snapshot.missions.find(m => m.job_id === event.job_id);
      const row = make("div", "hq-event");
      row.append(make("span", "hq-event-dot"), make("div", "hq-event-body"));
      row.lastChild.append(
        make("strong", "", event.event_type.replaceAll("_", " ")),
        make("p", "", mission?.title || "Older mission"),
        make("small", "", date(event.created_at))
      );
      target.append(row);
    }
  }
  window.loadHeadquarters = async () => {
    if (loading) return;
    loading = true;
    try {
      snapshot = await api("/api/admin/headquarters");
      el("hq-storage").textContent = "Connected";
      el("hq-updated").textContent = "Last synced · " + date(snapshot.generated_at);
      el("hq-execution").textContent = snapshot.execution;
      const budget = snapshot.mission_budget;
      el("hq-mission-budget").textContent = budget ? "AI recommendation briefs today (UTC): " + budget.used + " / " + budget.limit + " · " + budget.remaining + " remaining · excludes research and repair costs" : "AI mission budget unavailable";
      const missions = snapshot.missions;
      const ownerMissions = missions.filter(m => m.origin_type !== "staging_rehearsal");
      el("hq-open").textContent = ownerMissions.filter(m => !closed.has(m.status)).length;
      el("hq-running").textContent = ownerMissions.filter(m => ["queued", "running"].includes(m.status)).length;
      el("hq-review").textContent = ownerMissions.filter(m => m.status === "awaiting_owner_approval").length;
      el("hq-departments").textContent = snapshot.departments.length;
      el("hq-ready").textContent = snapshot.specialists.filter(a => a.enabled && a.status === "ready" && a.autonomy_level === "recommend").length;
      const selected = el("hq-agent").value;
      el("hq-agent").replaceChildren(...snapshot.specialists.map(a => {
        const option = make("option", "", a.display_name + " · " + (a.enabled && a.status === "ready" && a.autonomy_level === "recommend" ? "AI brief available" : "planning only"));
        option.value = a.agent_id;
        return option;
      }));
      if (selected && snapshot.specialists.some(a => a.agent_id === selected)) el("hq-agent").value = selected;
      renderMissions();
      renderDepartments();
      renderEvents();
      if (typeof window.loadOwnerActionCenter === "function") await window.loadOwnerActionCenter();
    } catch (error) {
      el("hq-storage").textContent = "Unavailable";
      el("hq-updated").textContent = "Could not load Headquarters. Use Refresh to retry.";
      throw error;
    } finally {
      loading = false;
    }
  };
  el("hq-new").addEventListener("click", () => {
    el("hq-compose").hidden = false;
    el("hq-title").focus();
    el("hq-compose").scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      block: "start"
    });
  });
  el("hq-close").addEventListener("click", () => {
    el("hq-compose").hidden = true;
    el("hq-new").focus();
  });
  el("hq-filter").addEventListener("change", () => { if (snapshot) renderMissions(); });
  el("hq-form").addEventListener("input", () => { requestId = crypto.randomUUID(); });
  el("hq-form").addEventListener("submit", async event => {
    event.preventDefault();
    const save = el("hq-save");
    save.disabled = true;
    el("hq-form-status").textContent = "Saving mission…";
    try {
      await api("/api/admin/headquarters", {
        method: "POST",
        body: JSON.stringify({
          job_id: requestId, title: el("hq-title").value.trim(),
          request_summary: el("hq-brief").value.trim(),
          agent_id: el("hq-agent").value, priority: el("hq-priority").value
        })
      });
      el("hq-form").reset();
      requestId = crypto.randomUUID();
      el("hq-compose").hidden = true;
      await window.loadHeadquarters();
    } catch (error) {
      el("hq-form-status").textContent = error.message;
    } finally {
      save.disabled = false;
    }
  });
  // Poll only while the command center is visible, and only if work is active.
  setInterval(() => {
    if (document.visibilityState === "visible" && el("view-headquarters")?.classList.contains("active") &&
      snapshot?.missions.some(m => ["queued", "running"].includes(m.status))) {
      window.loadHeadquarters().catch(() => {});
    }
  }, 12000);
})();
