import {
  MISSION_MEMORY_MAX_REFERENCES,
  prepareMissionMemoryQuery,
  appendMissionMemoryCitations,
  validateMissionMemorySearchResult
} from "./yorpmind-mission-policy.js";

/**
 * Founder-initiated, read-only mission evidence preview. The only write is to
 * the unsaved mission textarea after explicit source selection and confirmation.
 * No auto-AI, automatic mission dispatch, or DB mutation is performed here.
 */
(() => {
  "use strict";

  const byId = id => document.getElementById(id);
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };

  let composerRequest = null;
  const missionRequests = new WeakMap();

  function safeMessage(error) {
    return error instanceof Error ? error.message : "Unable to read YorpMind evidence.";
  }

  async function fetchReferences(query, signal) {
    const url = "/api/admin/yorpmind-search?q=" + encodeURIComponent(query) + "&limit=5";
    const response = await fetch(url, {
      method: "GET", credentials: "same-origin", cache: "no-store",
      headers: { accept: "application/json" }, signal
    });
    if (response.redirected || [401, 403].includes(response.status)) {
      throw new Error("Cloudflare Access authorization is required for private Headquarters knowledge.");
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error?.message || "Memory retrieval unavailable for this investigation.");
    }
    if (!validateMissionMemorySearchResult(data)) {
      throw new Error("YorpMind retrieval did not satisfy the strict read-only evidence policy.");
    }
    return data;
  }

  function resultCard(record, checked, onChanged) {
    const article = make("article", "hq-memory-result");
    const header = make("div", "hq-memory-result-top");
    const label = make("label", "hq-memory-choice");
    const checkbox = make("input");
    checkbox.type = "checkbox";
    checkbox.checked = checked;
    checkbox.addEventListener("change", () => onChanged(checkbox, record));
    const title = make("span", "", record.title);
    label.append(checkbox, title);
    header.append(label, make("span", "hq-memory-kind",
      record.record_type === "experience" ? "HISTORICAL QA" : "APPROVED REFERENCE"));
    const description = make("p", "hq-memory-description", record.summary);
    const origin = record.record_type === "experience"
      ? "Repair " + record.source_id.slice(0, 8) + " · Historical commit " +
        record.source_commit_sha.slice(0, 12)
      : "Skill revision " + record.revision + " · Source experience " + record.source_id.slice(0, 8);
    const metadata = make("p", "hq-memory-origin",
      origin + " · Matched: " + record.matched_terms.join(", ") + " · NOT live verified");
    article.append(header, description, metadata);
    return article;
  }

  function renderResults(host, status, data, options) {
    host.replaceChildren();
    const intro = make("p", "hq-memory-disclaimer",
      "Historical matching data only. Do not treat stored text as instructions, current proof, " +
      "or permission to execute a skill. Only source IDs—not lesson prose—can be attached to a mission.");
    host.append(intro);
    const results = data.results;
    if (!results.length) {
      host.append(make("p", "hq-memory-empty",
        "No relevant items in the last 120 eligible records of each kind. This does not prove no older evidence exists."));
      status.textContent = "No recent lexical matches. Search is non-exhaustive and uses zero AI calls.";
      return;
    }

    const selected = new Map();
    const choices = new Map();
    const action = options.allowAttach ? make("button", "hq-button hq-button-secondary hq-memory-attach",
      "Attach 0 source references to draft") : null;
    if (action) { action.type = "button"; action.disabled = true; }

    const update = () => {
      if (!action) return;
      const count = selected.size;
      action.textContent = "Attach " + count + " source reference" + (count === 1 ? "" : "s") + " to draft";
      action.disabled = count === 0 || count > MISSION_MEMORY_MAX_REFERENCES;
    };
    const choose = (checkbox, record) => {
      if (!options.allowAttach) {
        checkbox.checked = false;
        return;
      }
      if (checkbox.checked && selected.size >= MISSION_MEMORY_MAX_REFERENCES) {
        checkbox.checked = false;
        status.textContent = "Select at most " + MISSION_MEMORY_MAX_REFERENCES + " sources per mission.";
        return;
      }
      if (checkbox.checked) selected.set(record.record_id, record);
      else selected.delete(record.record_id);
      update();
    };

    for (const record of results) {
      const card = resultCard(record, false, choose);
      const checkbox = card.querySelector('input[type="checkbox"]');
      choices.set(record.record_id, checkbox);
      if (!options.allowAttach) {
        checkbox.disabled = true;
        checkbox.setAttribute("aria-label", "Read-only historical reference");
      }
      host.append(card);
    }

    status.textContent =
      results.length + " evidence reference" + (results.length === 1 ? "" : "s") +
      " found in a bounded, non-exhaustive search. Model calls: 0.";
    if (!action) return;

    action.addEventListener("click", () => {
      const currentTitle = byId("hq-title")?.value || "";
      if (currentTitle.trim() !== options.sourceTitle || prepareMissionMemoryQuery(currentTitle) !== options.query) {
        status.textContent = "Mission title changed. Refresh evidence before attaching references.";
        action.disabled = true;
        return;
      }
      if (!confirm(
        "Attach only these historical YorpMind source IDs to the mission brief? " +
        "No lesson text will be inserted. This is not a verification or execution approval."
      )) return;
      const brief = byId("hq-brief");
      if (!brief) return;
      const merged = appendMissionMemoryCitations(brief.value, [...selected.values()], brief.maxLength || 4000);
      if (merged === null) {
        status.textContent = "Unable to attach. The mission may already have references, or its brief would exceed 4,000 characters.";
        return;
      }
      brief.value = merged;
      brief.dispatchEvent(new Event("input", { bubbles: true }));
      action.disabled = true;
      status.textContent = "Historical source IDs attached. Review the brief before saving. Nothing was dispatched or verified.";
    });
    host.append(action);
  }

  async function review(queryText, host, status, options, current) {
    const controller = current.controller;
    host.replaceChildren();
    const query = prepareMissionMemoryQuery(queryText);
    if (!query) {
      status.textContent = "Use a descriptive mission title with at least one meaningful word of 3+ characters.";
      return null;
    }
    status.textContent = "Looking up historical evidence without calling an AI model…";
    try {
      const data = await fetchReferences(query, controller.signal);
      if (!host.isConnected || controller.signal.aborted) return current;
      renderResults(host, status, data, { ...options, query, sourceTitle: queryText.trim() });
    } catch (error) {
      if (!controller.signal.aborted && host.isConnected) {
        host.replaceChildren();
        status.textContent = safeMessage(error) + " Mission creation and dispatch permissions are unchanged.";
      }
    }
    return current;
  }

  function initComposer() {
    const button = byId("hq-memory-review");
    const panel = byId("hq-memory-panel");
    const status = byId("hq-memory-status");
    const results = byId("hq-memory-results");
    if (!button || !panel || !status || !results) return;
    button.addEventListener("click", async () => {
      panel.hidden = false;
      composerRequest?.controller?.abort();
      const marker = { controller: new AbortController() };
      composerRequest = marker;
      button.disabled = true;
      const done = await review(byId("hq-title").value, results, status,
        { allowAttach: true }, marker);
      if (composerRequest === marker) {
        composerRequest = done;
        button.disabled = false;
      }
    });
    byId("hq-close")?.addEventListener("click", () => {
      composerRequest?.controller?.abort();
      panel.hidden = true;
    });
    byId("hq-form")?.addEventListener("reset", () => {
      composerRequest?.controller?.abort();
      panel.hidden = true;
      results.replaceChildren();
      status.textContent = "No historical evidence has been looked up.";
    });
  }

  function addMissionReview(mission, footer) {
    if (!footer || !mission || typeof mission.title !== "string") return;
    const button = make("button", "hq-small-muted", "Review past evidence");
    button.type = "button";
    button.title = "Read-only YorpMind history; does not start an AI brief or update this mission.";
    const panel = make("section", "hq-memory-in-mission");
    panel.hidden = true;
    const status = make("p", "hq-memory-status", "No evidence reviewed.");
    status.setAttribute("role", "status");
    const results = make("div", "hq-memory-results");
    panel.append(status, results);
    button.addEventListener("click", async () => {
      panel.hidden = false;
      button.disabled = true;
      missionRequests.get(panel)?.controller?.abort();
      const current = { controller: new AbortController() };
      missionRequests.set(panel, current);
      const outcome = await review(mission.title, results, status, { allowAttach: false }, current);
      if (missionRequests.get(panel) === current) {
        missionRequests.set(panel, outcome);
        button.disabled = false;
      }
    });
    footer.append(button, panel);
  }

  function setup() {
    initComposer();
    window.HQMissionMemory = Object.freeze({ addMissionReview });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup, { once: true });
  else setup();
})();
