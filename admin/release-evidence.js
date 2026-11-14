/* Legacy file name retained for compatibility. This module is now a
 * read-only Investigation History viewer. It cannot preview or publish. */
(() => {
  "use strict";
  const byId = id => document.getElementById(id);
  const make = (tag, className, value) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined) element.textContent = String(value);
    return element;
  };
  const number = value => Number.isSafeInteger(value) && value >= 0 ? value : "—";
  const formatted = value => {
    const millis = Date.parse(value || "");
    return Number.isFinite(millis) ? new Date(millis).toLocaleString() : "Date unavailable";
  };
  const safePull = value => {
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && url.hostname === "github.com" &&
          /^\/solopreneursid\/yorpHives-2\.0\/pull\/[1-9]\d*\/?$/.test(url.pathname) &&
          !url.username && !url.password && !url.port && !url.search && !url.hash) return url.href;
    } catch { /* Do not open unknown or untrusted links. */ }
    return null;
  };
  function metric(label, value, detail) {
    const card = make("article", "release-evidence-metric");
    card.append(make("span", "release-evidence-label", label),
      make("strong", "", number(value)), make("small", "", detail));
    return card;
  }
  function render(board) {
    if (!board || board.production_deployment_enabled !== false ||
        board.production_approved !== false || !board.counts || !Array.isArray(board.repairs)) {
      throw new Error("Investigation records did not pass the read-only contract.");
    }
    byId("release-evidence-updated").textContent =
      "Recorded data retrieved " + formatted(board.generated_at) + " · not a live website inspection.";
    byId("release-evidence-summary").replaceChildren(
      metric("Historical investigations", board.counts.repairs, "Latest saved records"),
      metric("Recorded CI evidence", board.counts.ci_attested, "Historical checks, not current code status"),
      metric("Recorded issue QA", board.counts.qa_recorded, "Results require independent verification")
    );
    const list = byId("release-evidence-list");
    list.replaceChildren();
    if (!board.repairs.length) {
      list.append(make("p", "release-evidence-empty",
        "No investigation history has been recorded. This does not mean there are no current issues."));
      return;
    }
    for (const item of board.repairs.slice(0, 25)) {
      const card = make("article", "release-evidence-card");
      const header = make("div", "release-evidence-card-head");
      const details = make("div");
      details.append(make("span", "release-evidence-kicker", "SAVED INVESTIGATION"),
        make("h3", "", String(item.title || "Untitled investigation").slice(0, 180)),
        make("small", "", "Recorded state: " + String(item.job_status || "unknown").slice(0, 50) +
          " · Last updated " + formatted(item.updated_at)));
      header.append(details, make("span", "release-evidence-lock", "READ ONLY"));
      const badges = make("div", "release-evidence-badges");
      badges.append(
        make("span", item.ci_verified ? "evidence-pass" : "evidence-pending", item.ci_verified ? "CI evidence saved" : "CI evidence missing"),
        make("span", item.qa_recorded_for_ci_revision ? "evidence-pass" : "evidence-pending",
          item.qa_recorded_for_ci_revision ? "QA evidence saved" : "QA evidence missing"));
      card.append(header, badges);
      if (Array.isArray(item.blockers) && item.blockers.length) {
        const expanded = make("details", "release-evidence-blockers");
        expanded.append(make("summary", "", "Historical verification notes"));
        const notes = make("ul");
        for (const reason of item.blockers.slice(0, 20)) {
          if (typeof reason === "string") notes.append(make("li", "", reason.slice(0, 320)));
        }
        expanded.append(notes);
        card.append(expanded);
      }
      const href = safePull(item.pull_request_url);
      if (href) {
        const actions = make("div", "release-evidence-actions");
        const link = make("a", "button", "Inspect historical development record ↗");
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        actions.append(link);
        card.append(actions);
      }
      list.append(card);
    }
  }

  let inflight = null;
  window.loadInvestigationHistory = function loadInvestigationHistory() {
    if (inflight) return inflight;
    const refresh = byId("release-evidence-refresh");
    if (refresh) refresh.disabled = true;
    byId("release-evidence-updated").textContent = "Reading historical evidence…";
    inflight = (async () => {
      try {
        const response = await fetch("/api/admin/release-evidence", {
          credentials: "same-origin", redirect: "manual", cache: "no-store",
          headers: { accept: "application/json" }, signal: AbortSignal.timeout(30000)
        });
        if (!response.ok || response.redirected || !response.headers.get("content-type")?.includes("application/json"))
          throw new Error("Private history is unavailable or the session has expired.");
        render(await response.json());
      } catch {
        byId("release-evidence-summary").replaceChildren();
        byId("release-evidence-list").replaceChildren(make("p", "release-evidence-empty",
          "Investigation history could not be verified. Use Refresh to retry."));
        byId("release-evidence-updated").textContent = "Private records unavailable";
      } finally {
        if (refresh) refresh.disabled = false;
        inflight = null;
      }
    })();
    return inflight;
  };
  function init() {
    byId("release-evidence-refresh")?.addEventListener("click", () => window.loadInvestigationHistory());
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
