const $ = (id) => document.getElementById(id);
const date = (value) => value ? new Date(value).toLocaleString() : "—";
const safe = (value) => String(value ?? "");

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
    button.disabled = false;
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
    button.disabled = false;
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
  finally { button.disabled = false; button.textContent = "Run next asset scan"; }
});
