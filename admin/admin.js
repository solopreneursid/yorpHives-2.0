const $ = (id) => document.getElementById(id);
const date = (value) => value ? new Date(value).toLocaleString() : "—";
const safe = (value) => String(value ?? "");
let repairAgentReady = false;
if (document.getElementById("repair-submit")) document.getElementById("repair-submit").disabled = true;

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "Admin request failed (" + response.status + ")");
  return data;
}

function cell(row, value) {
  const td = document.createElement("td");
  td.textContent = safe(value);
  row.append(td);
  return td;
}

function emptyRow(target, message, colspan) {
  const tr = document.createElement("tr");
  const td = cell(tr, message);
  td.colSpan = colspan;
  td.className = "empty";
  target.append(tr);
}

async function load() {
  $("run-state").textContent = "Refreshing…";
  try {
    const [overview, findings, changes, assetData] = await Promise.all([
      api("/api/admin/overview"),
      api("/api/admin/findings"),
      api("/api/admin/changes"),
      api("/api/admin/assets")
    ]);

    $("identity").textContent = "Signed in: " + overview.identity;
    $("monitors").textContent = overview.counts?.active_monitors ?? 0;
    $("findings").textContent = overview.counts?.open_findings ?? 0;
    $("critical").textContent = overview.counts?.critical_findings ?? 0;
    $("last-run").textContent = date(overview.counts?.last_run_at);

    const runs = $("runs");
    runs.replaceChildren();
    if (!overview.recent_runs?.length) {
      emptyRow(runs, "No monitoring runs yet.", 5);
    } else {
      for (const item of overview.recent_runs) {
        const tr = document.createElement("tr");
        cell(tr, date(item.started_at));
        cell(tr, item.status);
        cell(tr, item.monitor_count);
        cell(tr, item.passed_count);
        cell(tr, item.failed_count);
        runs.append(tr);
      }
    }

    const list = $("findings-list");
    list.replaceChildren();
    if (!findings.data?.length) {
      emptyRow(list, "No active findings. Run checks to establish a baseline.", 5);
    } else {
      for (const item of findings.data) {
        const tr = document.createElement("tr");
        const severity = cell(tr, item.severity);
        severity.replaceChildren();
        const badge = document.createElement("span");
        badge.className = "pill " + item.severity;
        badge.textContent = item.severity;
        severity.append(badge);
        cell(tr, item.title + " — " + item.details);
        cell(tr, item.environment || "—");
        cell(tr, item.status);
        cell(tr, date(item.last_verified));
        const actions = document.createElement("td");
        const actionButton = document.createElement("button");
        actionButton.className = "button";
        actionButton.textContent = item.status === "accepted_risk" ? "Reopen" : item.status === "investigating" ? "Accept risk" : "Investigate";
        actionButton.addEventListener("click", async () => {
          const nextStatus = item.status === "accepted_risk" ? "open" : item.status === "investigating" ? "accepted_risk" : "investigating";
          if (nextStatus === "accepted_risk" && !confirm("Record this finding as an accepted risk? It will remain in the audit history.")) return;
          actionButton.disabled = true;
          try {
            await api("/api/admin/findings", { method: "PATCH", body: JSON.stringify({ id: item.id, status: nextStatus }) });
            await load();
            await loadAudit();
          } catch (error) { alert(error.message); }
          finally { actionButton.disabled = false; }
        });
        actions.append(actionButton);
        tr.append(actions);
        list.append(tr);
      }
    }

    const changeList = $("changes-list");
    changeList.replaceChildren();
    if (!changes.data?.length) {
      emptyRow(changeList, "No production changes detected yet. Initial snapshots are being established.", 4);
    } else {
      for (const item of changes.data) {
        const tr = document.createElement("tr");
        cell(tr, date(item.detected_at));
        cell(tr, item.title);
        cell(tr, item.details);
        cell(tr, item.status);
        changeList.append(tr);
      }
    }
    const counts = assetData.counts || {};
    $("asset-count").textContent = counts.assets ?? 0;
    $("website-count").textContent = counts.website_pages ?? 0;
    $("tools-count").textContent = counts.free_tools ?? 0;
    $("products-count").textContent = counts.products ?? 0;
    $("discovery-count").textContent = counts.api_discovery ?? 0;
    $("asset-down").textContent = (counts.unavailable ?? 0) + (counts.degraded ?? 0);
    $("deprecated-count").textContent = counts.deprecated_dependencies ?? 0;
    $("updates-count").textContent = counts.updates_available ?? 0;

    const assetsList = $("assets-list");
    assetsList.replaceChildren();
    if (!assetData.assets?.length) emptyRow(assetsList, "No assets have been scanned yet. Run the asset scan or wait for the scheduled cycle.", 6);
    else for (const item of assetData.assets) {
      const tr = document.createElement("tr");
      cell(tr, item.asset_type.replace("_", " "));
      cell(tr, item.title);
      const statusCell = cell(tr, item.last_status || "pending");
      const badge = document.createElement("span");
      badge.className = "pill " + (item.last_status === "healthy" ? "low" : item.last_status === "unavailable" ? "critical" : item.last_status === "degraded" ? "medium" : "info");
      badge.textContent = item.last_status || "pending";
      statusCell.replaceChildren(badge);
      cell(tr, item.last_http_status ?? "—");
      cell(tr, item.last_duration_ms == null ? "—" : item.last_duration_ms + " ms");
      cell(tr, date(item.last_checked_at));
      assetsList.append(tr);
    }

    const recommendationList = $("asset-findings-list");
    recommendationList.replaceChildren();
    if (!assetData.findings?.length) emptyRow(recommendationList, "No active asset recommendations. Run a scan to establish the baseline.", 5);
    else for (const item of assetData.findings) {
      const tr = document.createElement("tr");
      const severityCell = cell(tr, "");
      const badge = document.createElement("span");
      badge.className = "pill " + item.severity;
      badge.textContent = item.severity;
      severityCell.append(badge);
      cell(tr, item.asset_title + " · " + item.category);
      cell(tr, item.title + " — " + item.details);
      cell(tr, date(item.last_verified));
      cell(tr, item.recommendation);
      recommendationList.append(tr);
    }

    const dependencyList = $("dependencies-list");
    dependencyList.replaceChildren();
    if (!assetData.dependencies?.length) emptyRow(dependencyList, "No version-pinned npm CDN dependencies have been observed yet.", 5);
    else for (const item of assetData.dependencies) {
      const tr = document.createElement("tr");
      cell(tr, item.package_name);
      cell(tr, item.current_version);
      cell(tr, item.latest_version || "—");
      const stateCell = cell(tr, "");
      const badge = document.createElement("span");
      badge.className = "pill " + (item.status === "deprecated" ? "high" : item.status === "major_update" ? "medium" : item.status === "update_available" || item.status === "unknown" ? "info" : "low");
      badge.textContent = item.status;
      stateCell.append(badge);
      cell(tr, item.details);
      dependencyList.append(tr);
    }
    $("run-state").textContent = "Updated " + new Date().toLocaleTimeString();
  } catch (error) {
    $("run-state").textContent = "Error";
    $("identity").textContent = error.message;
    for (const [id, message, colspan] of [
      ["runs", "Unable to load monitoring history: " + error.message, 5],
      ["findings-list", "Unable to load findings: " + error.message, 5],
      ["changes-list", "Unable to load change history: " + error.message, 4],
      ["assets-list", "Unable to load asset inventory: " + error.message, 6],
      ["asset-findings-list", "Unable to load recommendations: " + error.message, 5],
      ["dependencies-list", "Unable to load dependency observations: " + error.message, 5]
    ]) {
      const target = $(id);
      target.replaceChildren();
      emptyRow(target, message, colspan);
    }
  }
}

$("logout").addEventListener("click", (event) => {
  const confirmed = confirm(
    "Sign out of Cloudflare Access? This ends your Access session across all Cloudflare Access-protected applications in this browser, not only YorpHives Admin."
  );
  if (!confirmed) event.preventDefault();
});

$("refresh").addEventListener("click", load);
$("run").addEventListener("click", async () => {
  const button = $("run");
  if (!confirm("Run read-only HTTPS checks against the configured YorpHives production and preview URLs?")) return;
  button.disabled = true;
  button.textContent = "Checking…";
  try {
    const result = await api("/api/admin/run-checks", {
      method: "POST",
      body: JSON.stringify({ confirm: true })
    });
    $("run-state").textContent = result.run.failed_count + " failed / " + result.run.passed_count + " passed";
    await load();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = !repairAgentReady;
    button.textContent = "Run health checks";
  }
});


$("snapshot").addEventListener("click", async () => {
  const button = $("snapshot");
  if (!confirm("Capture read-only SHA-256 snapshots of the four approved public production pages?")) return;
  button.disabled = true;
  button.textContent = "Checking…";
  try {
    const result = await api("/api/admin/run-snapshots", {
      method: "POST",
      body: JSON.stringify({ confirm: true })
    });
    $("run-state").textContent = result.changed + " changed / " + result.targets + " snapshots checked";
    await load();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = !repairAgentReady;
    button.textContent = "Check production changes";
  }
});

load();


$("assets-run").addEventListener("click", async () => {
  const button = $("assets-run");
  if (!confirm("Run the next bounded batch of approved YorpHives website, Free Tools and available internal product checks, including pinned npm CDN dependency versions? This is read-only.")) return;
  button.disabled = true;
  button.textContent = "Scanning…";
  try {
    const result = await api("/api/admin/run-assets", { method: "POST", body: JSON.stringify({ confirm: true }) });
    $("run-state").textContent = result.assets + " assets · " + result.unavailable + " unavailable · " + result.dependencies + " dependencies";
    await load();
  } catch (error) { alert(error.message); }
  finally { button.disabled = !repairAgentReady; button.textContent = "Run next asset scan"; }
});


let analyticsRange = "7d";
const numberFormat = (value) => new Intl.NumberFormat().format(Number(value || 0));
async function loadAnalytics() {
  const status = $("analytics-status");
  status.textContent = "Loading Cloudflare traffic analytics…";
  try {
    const result = await api("/api/admin/analytics?range=" + analyticsRange);
    if (!result.configured) {
      status.textContent = result.message;
      $("metric-views").textContent = "—";
      $("metric-requests").textContent = "—";
      $("metric-bandwidth").textContent = "—";
      $("top-paths").replaceChildren();
      emptyRow($("top-paths"), "Connect Cloudflare Analytics to view popular pages.", 2);
      return;
    }
    if (result.error) throw new Error(result.error);
    status.textContent = "Cloudflare edge analytics · " + result.range;
    $("metric-views").textContent = numberFormat(result.totals.pageViews);
    $("metric-requests").textContent = numberFormat(result.totals.requests);
    $("metric-bandwidth").textContent = (Number(result.totals.bytes || 0) / 1073741824).toFixed(2) + " GB";
    const target = $("top-paths");
    target.replaceChildren();
    if (!result.topPaths?.length) emptyRow(target, "No path data returned for this range.", 2);
    else for (const item of result.topPaths) {
      const tr = document.createElement("tr");
      cell(tr, item.path || "/");
      cell(tr, numberFormat(item.requests));
      target.append(tr);
    }
  } catch (error) {
    status.textContent = "Analytics unavailable: " + error.message;
  }
}

async function loadRepairDesk() {
  try {
    const [jobs, findings] = await Promise.all([
      api("/api/admin/repair-jobs"),
      api("/api/admin/findings")
    ]);
    repairAgentReady = jobs.agentConfigured === true;
    $("agent-state").textContent = repairAgentReady ? "Cloudflare repair agent ready" : "Agent setup required · add GITHUB_TOKEN to Worker secrets";
    $("repair-submit").disabled = !repairAgentReady;
    const select = $("repair-finding");
    const selected = select.value;
    select.replaceChildren();
    const general = document.createElement("option");
    general.value = "";
    general.textContent = "General investigation";
    select.append(general);
    for (const finding of findings.data || []) {
      const option = document.createElement("option");
      option.value = finding.id;
      option.textContent = "[" + finding.severity + "] " + finding.title;
      select.append(option);
    }
    select.value = selected;
    const target = $("repair-jobs");
    target.replaceChildren();
    if (!jobs.data?.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No repair requests yet.";
      target.append(empty);
      return;
    }
    for (const job of jobs.data) {
      const article = document.createElement("article");
      article.className = "job";
      const head = document.createElement("div");
      head.className = "job-head";
      const title = document.createElement("strong");
      title.textContent = "Repair " + job.id.slice(0, 8);
      const status = document.createElement("span");
      status.className = "pill " + (job.status === "failed" ? "high" : job.status === "completed" ? "low" : "medium");
      status.textContent = job.status;
      head.append(title, status);
      const request = document.createElement("p");
      request.textContent = job.request_text;
      const meta = document.createElement("p");
      meta.textContent = "Requested " + date(job.created_at) + " by " + job.requested_by;
      article.append(head, request, meta);
      if (job.branch_name) {\n        const branchLink = document.createElement("a");\n        branchLink.href = "https://github.com/solopreneursid/yorpHives-2.0/tree/" + job.branch_name.split("/").map(encodeURIComponent).join("/");\n        branchLink.target = "_blank";\n        branchLink.rel = "noopener noreferrer";\n        branchLink.textContent = "Inspect agent branch ↗";\n        article.append(branchLink);\n      }\n      if (job.pull_request_url) {
        const link = document.createElement("a");
        link.href = job.pull_request_url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Review pull request ↗";
        article.append(link);
      }
      if (job.result_summary) {
        const summary = document.createElement("p");
        summary.textContent = job.result_summary;
        article.append(summary);
      }
      target.append(article);
    }
  } catch (error) {
    repairAgentReady = false;
    $("repair-submit").disabled = true;
    $("agent-state").textContent = "Repair desk unavailable: " + error.message;
  }
}
$("analytics-7d").addEventListener("click", () => { analyticsRange = "7d"; loadAnalytics(); });
$("analytics-30d").addEventListener("click", () => { analyticsRange = "30d"; loadAnalytics(); });
$("repair-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("repair-submit");
  const requestText = $("repair-request").value.trim();
  if (!requestText) return;
  if (!repairAgentReady) { $("repair-message").textContent = "Configure the GITHUB_TOKEN Worker secret before starting an agent job."; return; }
  button.disabled = true;
  button.textContent = "Submitting…";
  $("repair-message").textContent = "";
  try {
    const result = await api("/api/admin/repair-jobs", {
      method: "POST",
      body: JSON.stringify({ finding_id: $("repair-finding").value || null, request_text: requestText })
    });
    $("repair-message").textContent = result.dispatched
      ? "Repair dispatched to the agent. Changes must return through a pull request."
      : result.message || "Repair request saved.";
    $("repair-request").value = "";
    await loadRepairDesk();
  } catch (error) {
    $("repair-message").textContent = "Could not submit repair: " + error.message;
  } finally {
    button.disabled = !repairAgentReady;
    button.textContent = "Request repair";
  }
});
loadAnalytics();
loadRepairDesk();
setInterval(loadRepairDesk, 30000);


async function loadAudit() {
  const target = $("audit-list");
  if (!target) return;
  try {
    const result = await api("/api/admin/audit");
    target.replaceChildren();
    if (!result.data?.length) { emptyRow(target, "No recorded admin actions yet.", 5); return; }
    for (const item of result.data) {
      const tr = document.createElement("tr");
      cell(tr, date(item.created_at));
      cell(tr, item.actor);
      cell(tr, item.action);
      cell(tr, item.resource_type + (item.resource_id ? " · " + item.resource_id.slice(0, 10) : ""));
      cell(tr, item.details_json);
      target.append(tr);
    }
  } catch (error) {
    target.replaceChildren();
    emptyRow(target, "Audit history unavailable: " + error.message, 5);
  }
}
loadAudit();
