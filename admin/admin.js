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

async function load() {
  $("run-state").textContent = "Refreshing…";
  try {
    const [overview, findings] = await Promise.all([
      api("/api/admin/overview"),
      api("/api/admin/findings")
    ]);

    $("identity").textContent = "Signed in: " + overview.identity;
    $("monitors").textContent = overview.counts?.active_monitors ?? 0;
    $("findings").textContent = overview.counts?.open_findings ?? 0;
    $("critical").textContent = overview.counts?.critical_findings ?? 0;
    $("last-run").textContent = date(overview.counts?.last_run_at);

    const runs = $("runs");
    runs.replaceChildren();
    if (!overview.recent_runs?.length) {
      const tr = document.createElement("tr");
      const td = cell(tr, "No monitoring runs yet.");
      td.colSpan = colspan;
      td.className = "empty";
      runs.append(tr);
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
      const tr = document.createElement("tr");
      const td = cell(tr, "No active findings. Run checks to establish a baseline.");
      td.colSpan = 5;
      td.className = "empty";
      list.append(tr);
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
    const changeList = $("changes-list");\n    changeList.replaceChildren();\n    if (!changes.data?.length) {\n      const tr = document.createElement("tr");\n      const td = cell(tr, "No production changes detected yet. Initial snapshots are being established.");\n      td.colSpan = 4;\n      td.className = "empty";\n      changeList.append(tr);\n    } else {\n      for (const item of changes.data) {\n        const tr = document.createElement("tr");\n        cell(tr, date(item.detected_at));\n        cell(tr, item.title);\n        cell(tr, item.details);\n        cell(tr, item.status);\n        changeList.append(tr);\n      }\n    }\n    $("run-state").textContent = "Updated " + new Date().toLocaleTimeString();
  } catch (error) {
    $("run-state").textContent = "Error";
    $("identity").textContent = error.message;
    $("runs").replaceChildren();
    $("findings-list").replaceChildren();
    for (const [target, message] of [
      ["runs", "Unable to load monitoring history: " + error.message],
      ["findings-list", "Unable to load findings: " + error.message]
    ]) {
      const tr = document.createElement("tr");
      const td = cell(tr, message);
      td.colSpan = 5;
      td.className = "empty";
      $(target).append(tr);
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

load();
