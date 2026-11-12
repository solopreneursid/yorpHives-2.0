(() => {
  "use strict";
  const byId = id => document.getElementById(id);
  const create = (tag, className = "", text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const display = value => value == null || value === "" ? "Not recorded" : String(value);
  const timestamp = value => {
    if (!value) return "Not recorded";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "Not recorded" : parsed.toLocaleString();
  };
  const safeGithubPr = value => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" &&
        url.hostname === "github.com" &&
        /^\/solopreneursid\/yorpHives-2\.0\/pull\/\d+\/?$/.test(url.pathname) &&
        !url.username && !url.password && !url.search && !url.hash ? url.href : null;
    } catch { return null; }
  };
  const safeEvidence = value => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" &&
        (url.hostname === "yorphives.com" || url.hostname.endsWith(".yorphives.com")) &&
        !url.username && !url.password ? url.href : null;
    } catch { return null; }
  };
  let generation = 0;
  let previouslyFocused = null;

  function labeled(label, value) {
    const line = create("div", "incident-field");
    line.append(create("dt", "", label), create("dd", "", display(value)));
    return line;
  }

  function renderFinding(finding) {
    byId("incident-title").textContent = display(finding.title);
    byId("incident-subtitle").textContent = "Finding " + display(finding.id) +
      " · " + display(finding.source_type) + " · " + display(finding.status);
    const fields = byId("incident-fields");
    fields.replaceChildren(
      labeled("Severity", finding.severity),
      labeled("Status", finding.status),
      labeled("Environment", finding.environment),
      labeled("Affected area", finding.monitor_name),
      labeled("First detected", timestamp(finding.first_detected)),
      labeled("Last verified", timestamp(finding.last_verified)),
      labeled("Resolved", timestamp(finding.resolved_at))
    );
    byId("incident-evidence").textContent = display(finding.details);
    byId("incident-recommendation").textContent = finding.recommendation
      ? finding.recommendation : "No verified remediation recommendation has been recorded.";
    const link = byId("incident-source");
    const href = safeEvidence(finding.monitor_url);
    link.hidden = !href;
    if (href) link.href = href;
    else link.removeAttribute("href");
  }

  function renderRelated(jobs, finding) {
    const node = byId("incident-related");
    node.replaceChildren();
    const matches = jobs.filter(job => job.finding_id === finding.id);
    if (!matches.length) {
      node.append(create("p", "incident-empty", "No linked repair job appears in the latest 50 recorded jobs. This does not prove none exists."));
      return;
    }
    for (const job of matches.slice(0, 20)) {
      const article = create("article", "incident-repair");
      const heading = create("div", "incident-repair-heading");
      heading.append(create("strong", "", "Repair " + display(job.id).slice(0, 8)),
        create("span", "incident-repair-status", job.status));
      article.append(heading, create("p", "", job.result_summary || job.request_text || "No result yet."),
        create("small", "", "Updated: " + timestamp(job.updated_at)));
      const href = safeGithubPr(job.pull_request_url);
      if (href) {
        const link = create("a", "incident-link", "Review draft pull request ↗");
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        article.append(link);
      }
      node.append(article);
    }
  }

  async function open(finding, actions) {
    const dialog = byId("incident-dialog");
    if (!dialog || !finding || !actions) return;
    const current = ++generation;
    previouslyFocused = document.activeElement;
    renderFinding(finding);
    byId("incident-related").replaceChildren(create("p", "incident-empty", "Loading linked repair history…"));
    const prepare = byId("incident-prepare");
    prepare.disabled = false;
    prepare.onclick = async () => {
      prepare.disabled = true;
      try {
        // Preparing this form is read-only. Dispatch still requires the founder to
        // submit the existing authenticated form after inspecting the proposed text.
        dialog.close();
        actions.showView("agents");
        await actions.loadAgents();
        const select = byId("repair-finding");
        const option = Array.from(select.options).find(item => item.value === finding.id);
        select.value = option ? finding.id : "";
        const input = byId("repair-request");
        input.value = [
          "Investigate finding: " + display(finding.title),
          "Observed: " + display(finding.details),
          "Affected: " + display(finding.monitor_url),
          "Determine a reproducible cause; propose a scoped fix with tests and independent QA. Do not deploy production."
        ].join("\n").slice(0, 4000);
        input.focus();
      } catch (error) {
        const text = error instanceof Error ? error.message : "Could not open the investigation form.";
        actions.notify(text);
      } finally {
        prepare.disabled = false;
      }
    };
    if (!dialog.open) dialog.showModal();
    try {
      const result = await actions.api("/api/admin/repair-jobs");
      if (generation === current && dialog.open) renderRelated(result.data || [], finding);
    } catch {
      if (generation === current && dialog.open) {
        byId("incident-related").replaceChildren(create("p", "incident-empty",
          "Repair history is temporarily unavailable. No investigation was started."));
      }
    }
  }
  function init() {
    const dialog = byId("incident-dialog");
    if (!dialog) return;
    byId("incident-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      generation++;
      byId("incident-prepare").onclick = null;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    });
  }
  window.HQIncidentWorkspace = { init, open };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
