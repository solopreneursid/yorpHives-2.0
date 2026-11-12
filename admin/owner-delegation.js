(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const node = (tag, cls, value) => {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    if (value !== undefined) element.textContent = String(value);
    return element;
  };
  const state = { busy: false, configurationReady: false };

  async function api(path, init = {}) {
    const response = await fetch(path, {
      cache: "no-store", credentials: "same-origin",
      ...init,
      headers: {
        accept: "application/json", ...(init.method ? { "content-type": "application/json" } : {}),
        ...(init.headers || {})
      }
    });
    if (response.redirected || response.status === 401 || response.status === 403) {
      throw new Error("An authorized founder session is required.");
    }
    const value = await response.json().catch(() => null);
    if (!response.ok) throw new Error(value?.error?.message || "Release authorization service is unavailable.");
    return value;
  }

  function renderHistory(data) {
    state.configurationReady = data.step_up_configured === true;
    const list = $("owner-delegation-list");
    list.replaceChildren();
    if (!Array.isArray(data.delegations) || data.delegations.length === 0) {
      list.append(node("p", "release-evidence-empty", "No scoped owner approvals yet. Verified previews and QA are required before requesting one."));
      return;
    }
    for (const row of data.delegations) {
      const card = node("article", "owner-delegation-record");
      const head = node("div", "owner-delegation-record-header");
      head.append(node("strong", "", "Repair " + row.repair_job_id.slice(0, 8) + " · " + row.commit_sha.slice(0, 12)),
        node("span", "owner-delegation-state", row.state));
      card.append(head);
      card.append(node("p", "", "Review preview: " + row.preview_url));
      card.append(node("small", "", "Requested " + new Date(row.requested_at).toLocaleString() +
        " · Request expires " + new Date(row.request_expires_at).toLocaleString()));
      if (row.state === "awaiting_mfa" &&
          state.configurationReady && new Date(row.request_expires_at).getTime() > Date.now()) {
        const link = node("a", "button primary", "Open secure Cloudflare MFA authorization ↗");
        link.href = "/api/admin/step-up/owner-delegations?id=" + encodeURIComponent(row.delegation_id);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        card.append(link);
      } else if (row.state === "awaiting_mfa" && !state.configurationReady) {
        card.append(node("p", "owner-delegation-warning",
          "MFA authorization remains locked until a distinct Cloudflare Access MFA application is configured and verified."));
      } else if (row.state === "authorized") {
        card.append(node("p", "owner-delegation-warning",
          "Owner authorization recorded. Production deployment still requires the separately audited executor."));
      }
      list.append(card);
    }
  }

  window.loadOwnerDelegations = async () => {
    try {
      const data = await api("/api/admin/owner-delegations");
      if (data.name !== "YorpMind" || data.execution_enabled !== false ||
          data.mechanism !== "preview_review_then_owner_mfa_then_scoped_delegation") {
        throw new Error("The owner delegation policy could not be verified.");
      }
      renderHistory(data);
    } catch (error) {
      $("owner-delegation-list").replaceChildren(
        node("p", "release-evidence-empty", error instanceof Error ? error.message : "Delegation records unavailable."));
      state.configurationReady = false;
    }
  };

  async function submit(event) {
    event.preventDefault();
    if (state.busy || !$("owner-delegation-form").reportValidity()) return;
    const form = $("owner-delegation-form");
    const checks = [
      "preview_inspected", "functional_tested", "mobile_tested",
      "qa_reviewed", "security_reviewed", "rollback_reviewed"
    ];
    const checklist = Object.fromEntries(checks.map(key => [key,
      form.querySelector('input[name="' + key + '"]').checked]));
    const payload = {
      action: "deploy_verified_release",
      repair_job_id: $("owner-delegation-job").value.trim(),
      commit_sha: $("owner-delegation-sha").value.trim(),
      preview_url: $("owner-delegation-preview").value.trim(),
      owner_note: $("owner-delegation-note").value.trim(),
      checklist
    };
    state.busy = true;
    $("owner-delegation-prepare").disabled = true;
    $("owner-delegation-status").textContent = "Checking live GitHub revision, exact-commit CI and QA before recording owner preview review…";
    try {
      const data = await api("/api/admin/owner-delegations", {
        method: "POST", body: JSON.stringify(payload)
      });
      if (data.status !== "awaiting_mfa" || data.execution_enabled !== false) {
        throw new Error("Unexpected owner authorization response.");
      }
      $("owner-delegation-status").textContent =
        "Request recorded for this exact commit. Next: open the separate Cloudflare MFA checkpoint, when configured. No production action occurred.";
      await window.loadOwnerDelegations();
    } catch (error) {
      $("owner-delegation-status").textContent =
        error instanceof Error ? error.message : "Request could not be prepared.";
    } finally {
      state.busy = false;
      $("owner-delegation-prepare").disabled = false;
    }
  }

  function init() {
    $("owner-delegation-form").addEventListener("submit", submit);
    $("owner-delegation-refresh").addEventListener("click", () => window.loadOwnerDelegations());
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
