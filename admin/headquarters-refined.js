/*
 * Focused Headquarters enhancements.
 * Progressive and read-only: no API calls, no changed permissions, no jobs.
 * The full detail remains accessible in its original section when expanded.
 */
(() => {
  "use strict";

  const regions = [
    ["owner-actions", "Founder decisions"],
    ["hq-missions", "Work in progress"],
    ["hq-events", "Recent activity"],
    ["intel-ideas", "Idea proposals"],
    ["intel-journal", "Recent research runs"],
    ["demand-cards", "Market opportunities"],
    ["radar-list", "Monitoring opportunities"],
    ["market-feed-list", "Public market examples"],
    ["hq-next-actions", "Suggested priorities"],
    ["activity-list", "Observed tool activity"]
  ];

  function region(id, description) {
    const element = document.getElementById(id);
    if (!element) return;
    element.setAttribute("role", "region");
    element.setAttribute("aria-label", description);
    element.setAttribute("tabindex", "0");
  }

  function wrapOptional(sectionSelector, title, note) {
    const section = document.querySelector(sectionSelector);
    if (!section || section.closest(".compact-optional-block")) return;
    const parent = section.parentNode;
    if (!parent) return;
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    const label = document.createElement("span");
    const hint = document.createElement("small");
    details.className = "compact-optional-block";
    summary.textContent = title;
    label.textContent = "";
    hint.textContent = note;
    hint.className = "hq-fold-note";
    summary.append(hint);
    details.append(summary);
    parent.insertBefore(details, section);
    details.append(section);
  }

  function hintBefore(id, text) {
    const element = document.getElementById(id);
    if (!element || !element.parentNode ||
        element.previousElementSibling?.classList.contains("hq-scroll-hint")) return;
    const hint = document.createElement("p");
    hint.className = "hq-scroll-hint";
    hint.textContent = text;
    element.parentNode.insertBefore(hint, element);
  }

  function initialize() {
    for (const [id, description] of regions) region(id, description);
    const panels = [
      [".intel-sidebar", "Background research and reference sources"],
      [".demand-sidebar", "Market references and examples"]
    ];
    for (const [selector, name] of panels) {
      const element = document.querySelector(selector);
      if (!element) continue;
      element.setAttribute("role", "region");
      element.setAttribute("aria-label", name);
      element.setAttribute("tabindex", "0");
    }

    // The founder sees decisions first. Public-source logs and instrumentation
    // stay one click away, not hundreds of pixels of permanent extra height.
    wrapOptional("#view-demand .hq-market-feed",
      "Explore public examples", "Optional research");
    wrapOptional("#view-demand .hq-activity-panel",
      "See tool activity details", "Optional numbers");

    hintBefore("intel-ideas", "↕ Scroll this list for more ideas");
    hintBefore("demand-cards", "↕ Scroll to see more opportunities");
    hintBefore("radar-list", "↕ Scroll to see more findings");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, {once: true});
  } else {
    initialize();
  }
})();
