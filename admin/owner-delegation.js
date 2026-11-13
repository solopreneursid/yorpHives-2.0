(() => {
  "use strict";
  // Retired approvals: audit history ONLY. The sole publishing path is founder
  // Preview -> Go Live -> OTP. No POST, step-up links or delegation controls.
  const $ = id => document.getElementById(id);
  const node = (tag, cls, value) => {
    const item = document.createElement(tag);
    if (cls) item.className = cls;
    if (value !== undefined) item.textContent = String(value);
    return item;
  };
  const stamp = value => {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toLocaleString() : "Unknown";
  };
  function renderHistory(records) {
    const list = $("owner-delegation-list");
    if (!list) return;
    list.replaceChildren();
    if (!records.length) {
      list.append(node("p", "release-evidence-empty",
        "No historical delegation records. New permissions and release delegations cannot be created."));
      return;
    }
    for (const row of records.slice(0, 20)) {
      const card = node("article", "owner-delegation-record");
      const head = node("div", "owner-delegation-record-header");
      const job = typeof row.repair_job_id === "string" ? row.repair_job_id.slice(0, 8) : "unknown";
      const sha = typeof row.commit_sha === "string" ? row.commit_sha.slice(0, 12) : "unknown";
      head.append(node("strong", "", "Historical repair " + job + " · " + sha),
        node("span", "owner-delegation-state", String(row.state || "unknown")));
      card.append(head, node("p", "owner-delegation-warning",
        "Archived for audit. This record does not authorize an AI agent or production release."),
        node("small", "", "Recorded " + stamp(row.requested_at)));
      list.append(card);
    }
  }
  window.loadOwnerDelegations = async () => {
    const list = $("owner-delegation-list");
    if (!list) return;
    try {
      const response = await fetch("/api/admin/owner-delegations", {
        credentials: "same-origin", cache: "no-store",
        headers: {accept: "application/json"}
      });
      if (!response.ok || response.redirected) throw Error("Private history unavailable");
      const data = await response.json();
      if (data.name !== "YorpMind" || data.mechanism !== "retired_delegation_history" ||
          data.execution_enabled !== false || data.can_create !== false ||
          data.can_authorize !== false || data.production_deployed !== false ||
          !Array.isArray(data.delegations))
        throw Error("Retired delegation policy could not be verified");
      renderHistory(data.delegations);
    } catch {
      list.replaceChildren(node("p", "release-evidence-empty",
        "Archived history unavailable. Legacy approval and publishing remain disabled."));
    }
  };
  function init() {
    $("owner-delegation-refresh")?.addEventListener("click", window.loadOwnerDelegations);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once: true});
  else init();
})();
