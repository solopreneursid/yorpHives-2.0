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
  let qaGeneration = 0;
  let qaJob = null;
  let qaActions = null;
  let qaPreviouslyFocused = null;

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

  function renderRelated(jobs, finding, actions) {
    const node = byId("incident-related");
    node.replaceChildren();
    const matches = jobs.filter(job => job.finding_id === finding.id && (job.finding_source || "monitor") === finding.source_type);
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
      if (href && job.status === "needs_review") {
        const qa = create("button", "button incident-qa-button", "Record issue-specific QA");
        qa.type = "button";
        qa.addEventListener("click", () => openQa(job, actions));
        article.append(qa);
      }
      node.append(article);
    }
  }

  async function openQa(job, actions) {
    const dialog = byId("repair-qa-dialog");
    if (!dialog || !job?.id) return;
    qaJob = job;
    qaActions = actions;
    const current = ++qaGeneration;
    qaPreviouslyFocused = document.activeElement;
    const save = byId("repair-qa-submit");
    save.disabled = true;
    byId("repair-qa-status").textContent = "Checking the current repair revision…";
    byId("repair-qa-revision").textContent = "Repair " + job.id + " · issue-specific QA only";
    byId("repair-qa-reproduction").value = "not_reproduced";
    byId("repair-qa-fix").value = "inconclusive";
    byId("repair-qa-regression").value = "not_run";
    byId("repair-qa-evidence").value = "";
    if (!dialog.open) dialog.showModal();
    try {
      const record = await actions.api("/api/admin/repair-qa?job_id=" + encodeURIComponent(job.id));
      if (current !== qaGeneration || !dialog.open) return;
      const qa = record.qa;
      if (qa) {
        byId("repair-qa-reproduction").value = qa.reproduction_status;
        byId("repair-qa-fix").value = qa.fix_status;
        byId("repair-qa-regression").value = qa.regression_status;
        byId("repair-qa-evidence").value = qa.evidence || "";
        byId("repair-qa-revision").textContent =
          "Recorded for " + qa.commit_sha.slice(0, 12) + " · " + record.revision_status + " · " + timestamp(qa.updated_at);
      }
      byId("repair-qa-status").textContent = record.issue_specific_qa_complete
        ? "QA observations recorded for the current revision. Release approval is still required."
        : qa ? "Existing QA is incomplete or the repair revision has changed. Re-test before claiming success."
          : "No issue-specific QA has been recorded for this repair.";
      save.disabled = false;
    } catch (error) {
      if (current !== qaGeneration || !dialog.open) return;
      byId("repair-qa-status").textContent = "QA is unavailable until the private database and GitHub connection are ready.";
      actions.notify(error instanceof Error ? error.message : "QA records unavailable.");
    }
  }

  async function saveQa(event) {
    event.preventDefault();
    if (!qaJob || !qaActions) return;
    const form = byId("repair-qa-form");
    if (!form.reportValidity()) return;
    const payload = {
      job_id: qaJob.id,
      reproduction_status: byId("repair-qa-reproduction").value,
      fix_status: byId("repair-qa-fix").value,
      regression_status: byId("repair-qa-regression").value,
      evidence: byId("repair-qa-evidence").value.trim()
    };
    if (payload.fix_status === "passed" && payload.reproduction_status !== "reproduced") {
      byId("repair-qa-status").textContent = "Reproduce the original issue before recording a passing fix.";
      return;
    }
    const button = byId("repair-qa-submit");
    button.disabled = true;
    try {
      const record = await qaActions.api("/api/admin/repair-qa", {
        method: "POST", body: JSON.stringify(payload)
      });
      byId("repair-qa-revision").textContent =
        "QA recorded for GitHub revision " + record.qa.commit_sha.slice(0, 12);
      byId("repair-qa-status").textContent = record.issue_specific_qa_complete
        ? "Issue-specific QA observations recorded. Production approval remains locked."
        : "QA findings recorded. The repair is not cleared for release.";
    } catch (error) {
      byId("repair-qa-status").textContent = "QA was not saved. Check authorization and current PR revision.";
      qaActions.notify(error instanceof Error ? error.message : "Unable to save QA evidence.");
    } finally {
      if (byId("repair-qa-dialog").open) button.disabled = false;
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
    const chat = byId("incident-chatgpt");
    chat.disabled = false;
    chat.onclick = () => {
      if (typeof window.HQChooseAssistant !== "function") {
        actions.notify("ChatGPT handoff is unavailable. Refresh Headquarters.");
        return;
      }
      // Keep the original monitored finding as inert text. Never execute it.
      // The founder copies the prepared message into ChatGPT deliberately.
      previouslyFocused = null;
      dialog.close();
      window.HQChooseAssistant({
        title: display(finding.title),
        why: display(finding.details),
        next_step: "Help me understand this observation and possible remedies. I will personally make and test any fixes before Preview → Go Live → OTP.",
        link: display(finding.monitor_url)
      }, "chatgpt");
    };
    prepare.onclick = async () => {
      prepare.disabled = true;
      try {
        const details = [
          "Finding ID: " + display(finding.id),
          "Finding source: " + display(finding.source_type),
          "Finding: " + display(finding.title),
          "Observed: " + display(finding.details),
          "Affected: " + display(finding.monitor_url),
          "Suggested next step: Review the evidence, make any fix yourself, test the final build, then use Preview → Go Live → OTP."
        ].join("\n").slice(0,4000);
        await navigator.clipboard.writeText(details);
        actions.notify("Finding copied. Headquarters has not started a repair or changed any code.");
      } catch {
        actions.notify("Copy unavailable. Review the finding details here and make your changes manually.");
      } finally {
        prepare.disabled = false;
      }
    };
    if (!dialog.open) dialog.showModal();
    try {
      const result = await actions.api("/api/admin/repair-jobs");
      if (generation === current && dialog.open) renderRelated(result.data || [], finding, actions);
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
    const qaDialog = byId("repair-qa-dialog");
    byId("repair-qa-close").addEventListener("click", () => qaDialog.close());
    byId("repair-qa-form").addEventListener("submit", saveQa);
    qaDialog.addEventListener("close", () => {
      qaGeneration++;
      qaJob = null;
      qaActions = null;
      if (qaPreviouslyFocused?.isConnected) qaPreviouslyFocused.focus();
    });
    dialog.addEventListener("close", () => {
      generation++;
      byId("incident-prepare").onclick = null;
      byId("incident-chatgpt").onclick = null;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    });
  }
  window.HQIncidentWorkspace = { init, open };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
