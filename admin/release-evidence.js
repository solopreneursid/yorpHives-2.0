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
    } finally {
      loading = false;
    }
  };

  function init() {
    const refresh = $("release-evidence-refresh");
    if (refresh) refresh.addEventListener("click", () => window.loadReleaseEvidence());
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
