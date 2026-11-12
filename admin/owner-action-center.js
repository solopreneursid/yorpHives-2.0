(() => {
  "use strict";
  const el = id => document.getElementById(id);
  const node = (tag, cls, text) => {
    const item = document.createElement(tag);
    if (cls) item.className = cls;
    if (text !== undefined) item.textContent = String(text);
    return item;
  };
  const validViews = new Set(["headquarters", "releases", "yorpmind", "monitoring"]);
  const filters = new Set(["failed", "review", "active", "all"]);
  let fetching = false;
  let lastAttemptAt = 0;
  const RECHECK_MS = 60_000;

  function openWorkspace(action) {
    if (!validViews.has(action.view)) return;
    if (action.view === "headquarters" && filters.has(action.target)) {
      const choice = el("hq-filter");
      if (choice && [...choice.options].some(opt => opt.value === action.target)) {
        choice.value = action.target;
        choice.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    const nav = document.querySelector(".nav-item[data-view='" + action.view + "']");
    if (nav instanceof HTMLButtonElement) nav.click();
    const target = action.view === "headquarters" ? el("hq-missions") :
      action.view === "yorpmind" ? el("ym-team-title") : null;
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderAction(action, position) {
    const card = node("article", "owner-task owner-task-" + action.urgency);
    const heading = node("div", "owner-task-heading");
    heading.append(node("span", "owner-task-rank", String(position + 1).padStart(2, "0")),
      node("strong", "", action.title),
      node("span", "owner-task-priority", action.urgency === "urgent"
        ? "ACT FIRST" : action.urgency === "attention" ? "NEEDS ATTENTION" : "WHEN READY"));
    const why = node("p", "owner-task-why", action.why);
    const next = node("p", "owner-task-next", "YOUR ACTION · " + action.next_step);
    const footer = node("div", "owner-task-footer");
    footer.append(node("span", "owner-task-note", "Review only · nothing executed"));
    const button = node("button", "owner-task-button", "Open " +
      (action.view === "headquarters" ? "missions" :
        action.view === "yorpmind" ? "YorpMind" : action.view) + " →");
    button.type = "button";
    button.addEventListener("click", () => openWorkspace(action));
    footer.append(button);
    card.append(heading, why, next, footer);
    return card;
  }

  function render(data) {
    const list = el("owner-actions");
    list.replaceChildren();
    const urgent = data.actions.filter(a => a.urgency === "urgent").length;
    const intro = el("owner-action-intro");
    if (data.actions.length) {
      intro.textContent = urgent
        ? urgent + " urgent decision" + (urgent === 1 ? "" : "s") +
          " need attention. Read each recommendation before taking action."
        : data.actions.length + " decision" + (data.actions.length === 1 ? "" : "s") +
          " to consider. Nothing here approves a release or spends AI credits.";
      data.actions.forEach((a, i) => list.append(renderAction(a, i)));
    } else {
      intro.textContent = "No pending decisions in the bounded private records checked.";
      list.append(node("p", "owner-empty",
        "Nothing currently requires a founder decision in this sample. This does not certify production readiness, QA, billing or CI."));
    }
    const total = data.pending_total_in_window;
    el("owner-action-count").textContent = String(total) +
      (data.truncated ? "+ queued" : " found");
    el("owner-action-status").textContent = "Private D1 · refreshed " +
      new Date(data.generated_at).toLocaleString() +
      " · " + data.recorded_jobs_scanned + " missions inspected · read-only";
  }

  window.loadOwnerActionCenter = async () => {
    if (fetching) return;
    fetching = true;
    try {
      const data = await api("/api/admin/action-center");
      if (data.name !== "Headquarters Founder Action Center" ||
          data.auto_ai_dispatch_enabled !== false ||
          data.release_execution_enabled !== false ||
          !Array.isArray(data.actions) || data.actions.length > 6 ||
          data.actions.some(a => a.execution_authorized !== false ||
            a.approval_granted !== false || !validViews.has(a.view))) {
        throw new Error("Founder action safety contract could not be verified.");
      }
      render(data);
    } catch (error) {
      el("owner-action-count").textContent = "Unavailable";
      el("owner-action-intro").textContent =
        "Decision evidence could not be loaded. No action or deployment is authorized.";
      el("owner-action-status").textContent =
        error instanceof Error ? error.message : "Private evidence is unavailable.";
      el("owner-actions").replaceChildren(node("p", "owner-empty",
        "Refresh after checking Cloudflare Access and the private staging database."));
    } finally {
      fetching = false;
    }
  };

  function start() {
    el("owner-action-refresh")?.addEventListener("click", () => window.loadOwnerActionCenter());
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
