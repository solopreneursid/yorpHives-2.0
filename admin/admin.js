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
    const [overview, findings, changes] = await Promise.all([
      api("/api/admin/overview"),
      api("/api/admin/findings"),
      api("/api/admin/changes")
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
    $("run-state").textContent = "Updated " + new Date().toLocaleTimeString();
  } catch (error) {
    $("run-state").textContent = "Error";
    $("identity").textContent = error.message;
    for (const [id, message, colspan] of [
      ["runs", "Unable to load monitoring history: " + error.message, 5],
      ["findings-list", "Unable to load findings: " + error.message, 5],
      ["changes-list", "Unable to load change history: " + error.message, 4]
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

load();
