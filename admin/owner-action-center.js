(() => {
  "use strict";
  const el = id => document.getElementById(id);
  const node = (tag, cls, text) => {
    const item = document.createElement(tag);
    if (cls) item.className = cls;
    if (text !== undefined) item.textContent = String(text);
    return item;
  };
  const validViews = new Set(["headquarters", "investigations", "yorpmind", "monitoring"]);
  const filters = new Set(["failed", "review", "staging", "active", "all"]);
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
    const next = node("p", "owner-task-next", "Suggested next step: " + action.next_step);
    const footer = node("div", "owner-task-footer");
    footer.append(node("span", "owner-task-note", "This is an informational work item, not an admin approval request."));
    const button = node("button", "owner-task-button", "Open " +
      (action.view === "headquarters" ? "missions" :
        action.view === "yorpmind" ? "YorpMind" : action.view) + " →");
    button.type = "button";
    button.addEventListener("click", () => openWorkspace(action));
    footer.append(button);
    const choices = node("div", "founder-choice-actions");
    const chat = node("button", "founder-choice-chat", "Work with ChatGPT");
    chat.type = "button";
    chat.addEventListener("click", () => window.HQChooseAssistant?.(action, "chatgpt"));
    const mind = node("button", "founder-choice-mind", "Give to YorpMind");
    mind.type = "button";
    mind.addEventListener("click", () => window.HQChooseAssistant?.(action, "yorpmind"));
    choices.append(chat, mind);
    card.append(heading, why, next, footer, choices);
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
          " are visible as team work updates. No approval is needed to keep developing."
        : data.actions.length + " decision" + (data.actions.length === 1 ? "" : "s") +
          " being tracked. No approval is needed for normal development or testing.";
      data.actions.forEach((a, i) => list.append(renderAction(a, i)));
    } else {
      intro.textContent = "There is nothing new for you to decide in the work we checked.";
      list.append(node("p", "owner-empty",
        "Your team may still be working. This message is not a guarantee that every website feature is healthy."));
    }
    const total = data.pending_total_in_window;
    el("owner-action-count").textContent = String(total) +
      (data.truncated ? "+ to review" : " to review");
    el("owner-action-status").textContent = "Last checked " +
      new Date(data.generated_at).toLocaleString() +
      " · Nothing was changed or started.";
  }

  window.loadOwnerActionCenter = async (force = false) => {
    if (fetching || (!force && Date.now() - lastAttemptAt < RECHECK_MS)) return;
    lastAttemptAt = Date.now();
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
    el("owner-action-refresh")?.addEventListener("click", () => window.loadOwnerActionCenter(true));
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
