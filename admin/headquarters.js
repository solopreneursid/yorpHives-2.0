(() => {
  const el = id => document.getElementById(id);
  let snapshot = null;
  let requestId = crypto.randomUUID();
  const make = (tag, classes, text) => {
    const node = document.createElement(tag);
    node.className = classes;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const when = value => new Date(value).toLocaleString();
  function renderMissions() {
    const target = el("hq-missions");
    target.replaceChildren();
    const filter = el("hq-filter").value;
    const closed = ["cancelled", "completed", "failed", "rolled_back"];
    const missions = snapshot.missions.filter(m => filter === "all" || (filter === "active" ? !closed.includes(m.status) : m.status === filter));
    if (!missions.length) target.append(make("p", "text-slate-400 py-6", "No missions in this view. Create a mission to capture the next outcome."));
    for (const mission of missions) {
      const card = make("article", "rounded-xl border border-slate-700 bg-slate-950/60 p-5");
      const top = make("div", "flex justify-between gap-3 text-xs mb-3");
      top.append(make("span", "uppercase tracking-wider text-cyan-300", mission.priority), make("span", "text-slate-400", mission.status.replaceAll("_", " ")));
      const specialist = snapshot.specialists.find(a => a.agent_id === mission.agent_id);
      card.append(top, make("h3", "text-lg font-semibold mb-2", mission.title), make("p", "text-sm text-slate-400 whitespace-pre-wrap break-words", mission.request_summary), make("p", "text-xs text-slate-500 mt-4", `${specialist?.display_name || "Unassigned"} · ${when(mission.created_at)}`));
      if (mission.status === "planned") {
        const cancel = make("button", "text-button mt-4", "Cancel planned mission");
        cancel.type = "button";
        cancel.addEventListener("click", async () => {
          cancel.disabled = true;
          try {
            await api("/api/admin/headquarters", { method: "PATCH", body: JSON.stringify({ job_id: mission.job_id, action: "cancel", expected_updated_at: mission.updated_at }) });
            await window.loadHeadquarters();
          } catch (error) { showSystemMessage(error.message, { kind: "error" }); }
          finally { cancel.disabled = false; }
        });
        card.append(cancel);
      }
      target.append(card);
    }
  }
  function renderDepartments() {
    const target = el("hq-team"); target.replaceChildren();
    for (const department of snapshot.departments) {
      const card = make("article", "rounded-xl border border-slate-700 bg-slate-900/70 p-6");
      card.append(make("span", "text-xs tracking-widest text-cyan-300 uppercase", department.department_id.replaceAll("-", " ")), make("h2", "text-lg font-semibold mt-3 mb-2", department.name), make("p", "text-sm text-slate-400 mb-5", department.mission));
      for (const agent of snapshot.specialists.filter(a => a.department_id === department.department_id)) {
        const row = make("div", "border-t border-slate-800 pt-4 mt-4");
        row.append(make("strong", "block text-sm", agent.display_name), make("p", "text-xs text-slate-400 mt-2", agent.description), make("p", "text-xs text-amber-200 mt-3", `${agent.status} · ${agent.enabled ? "enabled" : "disabled"} · ${agent.autonomy_level.replaceAll("_", " ")}`));
        card.append(row);
      }
      target.append(card);
    }
  }
  window.loadHeadquarters = async () => {
    try {
      snapshot = await api("/api/admin/headquarters");
      el("hq-storage").textContent = "Connected";
      el("hq-updated").textContent = "Updated " + when(snapshot.generated_at);
      el("hq-execution").textContent = snapshot.execution;
      el("hq-open").textContent = snapshot.missions.filter(m => !["completed", "cancelled", "failed", "rolled_back"].includes(m.status)).length;
      el("hq-departments").textContent = snapshot.departments.length;
      el("hq-ready").textContent = snapshot.specialists.filter(a => a.enabled && a.status === "ready").length;
      const selected = el("hq-agent").value;
      el("hq-agent").replaceChildren(...snapshot.specialists.map(a => { const option = make("option", "", a.display_name + " · " + a.status); option.value = a.agent_id; return option; }));
      if (selected) el("hq-agent").value = selected;
      renderMissions(); renderDepartments();
      const events = el("hq-events"); events.replaceChildren();
      if (!snapshot.events.length) events.append(make("p", "text-sm text-slate-400 py-5", "No mission activity yet. New missions and cancellations are recorded automatically."));
      for (const event of snapshot.events) {
        const row = make("div", "py-4 flex flex-wrap justify-between gap-2");
        const mission = snapshot.missions.find(m => m.job_id === event.job_id);
        row.append(make("span", "text-sm text-slate-300", `${event.event_type.replaceAll("_", " ")} · ${mission?.title || event.job_id}`), make("span", "text-xs text-slate-500", when(event.created_at)));
        events.append(row);
      }
    } catch (error) {
      el("hq-storage").textContent = "Unavailable";
      el("hq-updated").textContent = "Could not load headquarters. Use Refresh to retry.";
      throw error;
    }
  };
  el("hq-new").addEventListener("click", () => { el("hq-compose").hidden = false; el("hq-title").focus(); });
  el("hq-close").addEventListener("click", () => { el("hq-compose").hidden = true; el("hq-new").focus(); });
  el("hq-filter").addEventListener("change", () => { if (snapshot) renderMissions(); });
  el("hq-form").addEventListener("input", () => { requestId = crypto.randomUUID(); });
  el("hq-form").addEventListener("submit", async event => {
    event.preventDefault();
    const save = el("hq-save"); save.disabled = true;
    el("hq-form-status").textContent = "Saving…";
    try {
      await api("/api/admin/headquarters", { method: "POST", body: JSON.stringify({ job_id: requestId, title: el("hq-title").value.trim(), request_summary: el("hq-brief").value.trim(), agent_id: el("hq-agent").value, priority: el("hq-priority").value }) });
      el("hq-form").reset(); requestId = crypto.randomUUID();
      el("hq-form-status").textContent = "Mission saved as planned. No agent execution was started.";
      await window.loadHeadquarters();
    } catch (error) { el("hq-form-status").textContent = error.message; }
    finally { save.disabled = false; }
  });
})();
