(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const safePull = value => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname === "github.com" &&
        /^\/solopreneursid\/yorpHives-2\.0\/pull\/[1-9]\d*\/?$/.test(url.pathname) &&
        !url.username && !url.password && !url.port && !url.search && !url.hash ? url.href : null;
    } catch { return null; }
  };
  const date = iso => {
    if (!iso) return "Not recorded";
    const value = new Date(iso);
    return Number.isFinite(value.getTime()) ? value.toLocaleString() : "Not recorded";
  };

  function recordMetric(label, value, detail) {
    const card = el("article", "release-evidence-metric");
    card.append(
      el("span", "release-evidence-label", label),
      el("strong", "", String(value)),
      el("small", "", detail)
    );
    return card;
  }

  function render(board) {
    // D1 historical receipts are never a live release attestation.
    // Keep Go Live inactive until a separate server-verified release endpoint
    // can bind a successful preview, exact SHA, checks and founder OTP.
    const goLive = $("release-go-live");
    const preview = $("release-launch-preview");
    if (goLive) goLive.disabled = true;
    if (preview) {
      preview.removeAttribute("href");
      preview.setAttribute("aria-disabled", "true");
    }
    if ($("release-launch-status")) $("release-launch-status").textContent = "Not production-ready";
    if ($("release-launch-description")) {
      $("release-launch-description").textContent =
        "YorpMind and the team can continue building, fixing and testing in isolated previews. " +
        "A verified release preview will appear here only after all production checks pass.";
    }
    $("release-evidence-summary").replaceChildren(
      recordMetric("Recent investigations", board.counts.repairs, "Latest 25 repair records"),
      recordMetric("CI evidence", board.counts.ci_attested, "Five signed-off job receipts"),
      recordMetric("Issue-specific QA", board.counts.qa_recorded, "Recorded against CI commit; live HEAD unchecked"),
      recordMetric("Production authorization", 0, "Disabled pending independent release gates")
    );

    $("release-evidence-updated").textContent =
      "D1 evidence read " + date(board.generated_at) + " · live GitHub HEAD and billing not checked";
    const host = $("release-evidence-list");
    host.replaceChildren();

    if (!Array.isArray(board.repairs) || board.repairs.length === 0) {
      host.append(el("p", "release-evidence-empty",
        "No recent repair records. This does not certify the site or Headquarters as production-ready."));
      return;
    }

    for (const repair of board.repairs) {
      const card = el("article", "release-evidence-card");
      const head = el("div", "release-evidence-card-head");
      const label = el("div", "");
      label.append(el("span", "release-evidence-kicker", "REPAIR " + repair.job_id.slice(0, 8)),
        el("h3", "", repair.title || "Repair investigation"),
        el("small", "", "Status: " + repair.job_status + " · Updated " + date(repair.updated_at)));
      head.append(label, el("span", "release-evidence-lock", "PRODUCTION LOCKED"));
      const badges = el("div", "release-evidence-badges");
      badges.append(
        el("span", repair.ci_verified ? "evidence-pass" : "evidence-pending",
          repair.ci_verified ? "CI evidence recorded" : "CI not verified"),
        el("span", repair.qa_recorded_for_ci_revision ? "evidence-pass" : "evidence-pending",
          repair.qa_recorded_for_ci_revision ? "Founder QA recorded" : "Founder QA missing"),
        el("span", "evidence-pending", "Live PR HEAD not checked")
      );

      const controls = el("div", "release-evidence-actions");
      const href = safePull(repair.pull_request_url);
      if (href) {
        const link = el("a", "button", "Inspect draft pull request ↗");
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        controls.append(link);
      }

      const details = el("details", "release-evidence-blockers");
      const title = el("summary", "", "Review remaining release gates (" + repair.blockers.length + ")");
      const list = el("ul");
      for (const item of repair.blockers) list.append(el("li", "", item));
      details.append(title, list);
      card.append(head, badges, details, controls);
      host.append(card);
    }
  }

  const validPreview = (value, target) => {
    try {
      const project = target === "headquarters" ? "yorphives-admin-staging" : "yorphives-2-preview";
      const url = new URL(value);
      return url.protocol === "https:" &&
        url.hostname.endsWith("." + project + ".pages.dev") &&
        url.hostname.split(".").length === 4 &&
        /^[a-z0-9-]+$/.test(url.hostname.split(".")[0]) &&
        !url.username && !url.password && !url.port && !url.search && !url.hash &&
        url.pathname === "/" ? url.origin : null;
    } catch { return null; }
  };
  async function loadGoLiveReadiness() {
    const target = $("release-target")?.value === "headquarters" ? "headquarters" : "website";
    const status = $("release-launch-status");
    const details = $("release-launch-description");
    const preview = $("release-launch-preview");
    const goLive = $("release-go-live");
    if (goLive) goLive.disabled = true; // No OTP executor exists yet.
    if (preview) {
      preview.removeAttribute("href");
      preview.setAttribute("aria-disabled", "true");
    }
    status.textContent = "Checking production readiness";
    details.textContent = "Verifying the exact code revision, automated checks and Cloudflare preview.";
    try {
      const response = await fetch("/api/admin/go-live?target=" + target, {
        credentials: "same-origin", cache: "no-store",
        headers: { accept: "application/json" }
      });
      if (response.redirected || !response.ok) throw new Error("Private release verifier unavailable");
      const data = await response.json();
      if (data.target !== target || data.production_approved !== false ||
          data.production_deployment_enabled !== false ||
          typeof data.ready_for_preview !== "boolean" ||
          !Array.isArray(data.blockers)) throw new Error("Invalid release verification evidence");
      const url = data.ready_for_preview === true ? validPreview(data.preview?.url, target) : null;
      if (url && data.status === "verified_preview" && data.blockers.length === 0) {
        preview.href = url;
        preview.setAttribute("aria-disabled", "false");
        status.textContent = "Preview verified · Go Live not connected";
        details.textContent = "All current release checks passed for " +
          (data.candidate?.title || "this change") +
          ". Open Preview to inspect the exact candidate. Publishing stays unavailable until the founder-only OTP release executor is verified.";
      } else {
        status.textContent = "Not production-ready";
        details.textContent = data.blockers.slice(0, 3).map(s => String(s).slice(0, 240)).join(" ") ||
          "Release evidence is incomplete. The team can continue working without administrator approval.";
      }
      // Founder-only, read-only diagnosis; never infer permission to publish.
      if (target === "headquarters") {
        try {
          const diagnosisResponse = await fetch("/api/admin/go-live-plan", {
            credentials: "same-origin", cache: "no-store",
            headers: { accept: "application/json" }
          });
          if (diagnosisResponse.ok && !diagnosisResponse.redirected) {
            const diagnosis = await diagnosisResponse.json();
            const drift = diagnosis?.drift;
            if (diagnosis?.production_deployment_enabled === false &&
                drift?.production_deployment_enabled === false &&
                drift.status === "source_ahead_of_served" &&
                /^[a-f0-9]{40}$/.test(drift.source_sha || "") &&
                /^[a-f0-9]{40}$/.test(drift.served_sha || "") &&
                Number.isSafeInteger(drift.ahead_by) && drift.ahead_by > 0) {
              status.textContent = "Deployment mismatch · Go Live locked";
              details.textContent = "GitHub is " + drift.ahead_by +
                " commit(s) ahead of the version Cloudflare serves. " +
                "Source " + drift.source_sha.slice(0, 12) +
                " · Served " + drift.served_sha.slice(0, 12) +
                ". Preserve the live deployment for recovery and complete the release checks before publishing.";
            }
          }
        } catch { /* Keep existing fail-closed release status. */ }
      }
    } catch {
      status.textContent = "Verification unavailable";
      details.textContent = "Live release checks could not be confirmed. Keep developing; publishing is locked.";
    }
  }

  let loading = false;
  window.loadReleaseEvidence = async function loadReleaseEvidence() {
    if (loading) return;
    loading = true;
    $("release-evidence-updated").textContent = "Reading private D1 release evidence…";
    try {
      const response = await fetch("/api/admin/release-evidence", {
        credentials: "same-origin", cache: "no-store",
        headers: { accept: "application/json" }
      });
      if (response.redirected || [401, 403].includes(response.status)) {
        throw new Error("Cloudflare Access authorization is required.");
      }
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || data.production_approved !== false ||
          data.production_deployment_enabled !== false) {
        throw new Error(data?.error?.message || "Verified release evidence is unavailable.");
      }
      render(data);
    } catch (error) {
      $("release-evidence-summary").replaceChildren();
      $("release-evidence-list").replaceChildren(
        el("p", "release-evidence-empty",
          "Evidence unavailable — production remains locked. " +
          (error instanceof Error ? error.message : "Retry from an authorized session."))
      );
      $("release-evidence-updated").textContent = "Could not verify evidence";
      if ($("release-go-live")) $("release-go-live").disabled = true;
      if ($("release-launch-preview")) {
        $("release-launch-preview").removeAttribute("href");
        $("release-launch-preview").setAttribute("aria-disabled", "true");
      }
      if ($("release-launch-status")) $("release-launch-status").textContent = "Verification unavailable";
    } finally {
      loading = false;
      await loadGoLiveReadiness();
    }
  };

  function init() {
    const refresh = $("release-evidence-refresh");
    if (refresh) refresh.addEventListener("click", () => window.loadReleaseEvidence());
    $("release-target")?.addEventListener("change", () => window.loadReleaseEvidence());
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
