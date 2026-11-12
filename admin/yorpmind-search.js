(() => {
  "use strict";
  const get = id => document.getElementById(id);
  const make = (tag, cls, text) => {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    if (text !== undefined) element.textContent = String(text);
    return element;
  };

  const state = { requestId: 0, controller: null };

  function render(result) {
    const target = get("ym-search-results");
    target.replaceChildren();
    get("ym-search-status").textContent =
      "Scanned " + result.source_window.experiences_scanned + " recent experiences and " +
      result.source_window.skills_scanned + " approved reference skills. " +
      result.results.length + " relevant lexical matches. Older records may not be included.";

    if (!result.results.length) {
      target.append(make("p", "ym-empty",
        "No matching references in this bounded recent window. This does not prove no relevant historical record exists."));
      return;
    }

    for (const item of result.results) {
      const card = make("article", "ym-search-result");
      const heading = make("div", "ym-entry-head");
      heading.append(
        make("h3", "", item.title),
        make("span", "ym-badge " + (item.record_type === "reference_skill" ? "ym-badge-approved" : "ym-badge-private"),
          item.record_type === "reference_skill" ? "REFERENCE SKILL" : "FOUNDER QA MEMORY")
      );
      const description = make("p", "ym-entry-summary", item.summary);
      const context = make("p", "ym-source", "Matches: " + item.matched_terms.join(", ") +
        " · Source " + item.source_id.slice(0, 12) +
        " · Not live-verified · Not executable");
      card.append(heading, description, context);

      if (item.record_type === "experience") {
        card.append(make("p", "ym-source", "Historical repair commit: " + item.source_commit_sha.slice(0, 12) +
          " · Reported by founder; original QA evidence must be checked before reuse."));
      } else if (Array.isArray(item.steps)) {
        const details = make("details", "ym-procedure");
        details.append(make("summary", "", "View approved reference steps (no execution permissions)"));
        const list = make("ol");
        for (const step of item.steps) list.append(make("li", "", step));
        details.append(list);
        card.append(details);
      }
      target.append(card);
    }
  }

  async function search(event) {
    event.preventDefault();
    const query = get("ym-search-query").value.trim();
    if (query.length < 3 || query.length > 160) return;
    const current = ++state.requestId;
    if (state.controller) state.controller.abort();
    state.controller = new AbortController();
    const button = get("ym-search-submit");
    button.disabled = true;
    get("ym-search-status").textContent = "Searching bounded private evidence…";
    try {
      const response = await fetch("/api/admin/yorpmind-search?q=" + encodeURIComponent(query), {
        method: "GET", credentials: "same-origin",
        cache: "no-store", headers: { accept: "application/json" },
        signal: state.controller.signal
      });
      if (response.redirected || response.status === 401 || response.status === 403) {
        throw new Error("Cloudflare Access authorization is required.");
      }
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error?.message || "YorpMind search unavailable.");
      if (result.name !== "YorpMind" || result.scope !== "headquarters" ||
          result.search_mode !== "bounded_recent_lexical" ||
          result.execution?.skills_executable !== false ||
          result.execution?.public_access !== false ||
          result.execution?.production_approved !== false ||
          result.execution?.inference_calls !== 0 ||
          !Array.isArray(result.results)) {
        throw new Error("YorpMind search safety policy could not be validated.");
      }
      if (current === state.requestId) render(result);
    } catch (error) {
      if (current !== state.requestId || error?.name === "AbortError") return;
      get("ym-search-results").replaceChildren();
      get("ym-search-status").textContent = error instanceof Error
        ? error.message : "The private search is unavailable.";
    } finally {
      if (current === state.requestId) {
        button.disabled = false;
        state.controller = null;
      }
    }
  }
  function initialize() {
    get("ym-search-form").addEventListener("submit", search);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
