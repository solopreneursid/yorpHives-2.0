(() => {
  "use strict";

  const find = id => document.getElementById(id);
  const make = (tag, className, content) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (content !== undefined) el.textContent = String(content);
    return el;
  };
  const VALID = new Set(["verified_basic", "needs_attention", "not_verified"]);
  const COPY_LIMIT = 2800;
  let lastReceipt = null;
  let running = false;
  let lastStarted = 0;

  function summaryText(receipt) {
    const intro =
      "This read-only check inspected public HTTP responses, not a production deployment. " +
      "It found " + receipt.basic_passed + " basic passes, " + receipt.needs_attention +
      " addresses to investigate and " + receipt.unverified + " unverified addresses.\n";
    const lines = receipt.checks.map(row => {
      const status = row.status === "verified_basic" ? "Basic check passed" :
        row.status === "needs_attention" ? "Needs attention" : "Could not verify";
      return row.path + " · " + status + " · HTTP " +
        (row.http_status === null ? "unknown" : row.http_status) +
        " · " + row.note;
    });
    return (intro + lines.join("\n")).slice(0, COPY_LIMIT);
  }

  function validate(data) {
    if (!data || data.source !== "real_public_http_get" ||
        data.origin !== "https://yorphives.com" ||
        data.total !== 7 || !Array.isArray(data.checks) ||
        data.checks.length !== 7 || data.new_ai_model_calls !== 0 ||
        data.database_writes !== 0 || data.production_changes !== 0 ||
        data.previous_findings_auto_resolved !== false ||
        data.documents_proven_fully_correct !== false) {
      throw new Error("Live website evidence was incomplete; nothing is marked verified.");
    }
    const paths = new Set();
    for (const item of data.checks) {
      if (!item || !VALID.has(item.status) ||
          typeof item.path !== "string" || !item.path.startsWith("/") ||
          typeof item.title !== "string" || typeof item.note !== "string" ||
          paths.has(item.path)) {
        throw new Error("Live website evidence included an invalid or repeated address.");
      }
      paths.add(item.path);
    }
    const counts = {
      verified_basic: data.checks.filter(item => item.status === "verified_basic").length,
      needs_attention: data.checks.filter(item => item.status === "needs_attention").length,
      not_verified: data.checks.filter(item => item.status === "not_verified").length
    };
    if (counts.verified_basic !== data.basic_passed ||
        counts.needs_attention !== data.needs_attention ||
        counts.not_verified !== data.unverified) {
      throw new Error("The website check totals did not match their evidence.");
    }
    return data;
  }

  function render(data) {
    const area = find("website-proof-list");
    const status = find("website-proof-status");
    const foot = find("website-proof-foot");
    area.replaceChildren();
    const labels = {
      verified_basic: "✓ Looks right",
      needs_attention: "! Needs attention",
      not_verified: "· Couldn't verify"
    };
    for (const item of data.checks) {
      const row = make("article", "website-proof-item");
      const heading = make("div", "website-proof-name");
      heading.append(make("strong", "", item.title), make("small", "", item.path));
      const state = make("span", "website-proof-pill", labels[item.status]);
      state.dataset.state = item.status;
      row.append(heading, state, make("p", "website-proof-detail", item.note));
      area.append(row);
    }
    const checked = new Date(data.checked_at);
    const when = Number.isFinite(checked.getTime()) ? checked.toLocaleString() : "just now";
    status.textContent =
      data.needs_attention > 0 ? data.needs_attention + " addresses need investigation · checked " + when :
      data.unverified > 0 ? "Some addresses could not be verified · checked " + when :
      "All seven addresses passed basic checks · checked " + when;
    status.dataset.status = data.needs_attention ? "attention" :
      data.unverified ? "inconclusive" : "passed";
    find("website-proof-count").textContent =
      data.basic_passed + " basic passes · " + data.needs_attention +
      " need attention · " + data.unverified + " not verified";
    foot.hidden = false;
  }

  async function checkWebsite() {
    const status = find("website-proof-status");
    const trigger = find("website-proof-run");
    if (running) return;
    const elapsed = Date.now() - lastStarted;
    if (elapsed < 30000) {
      status.textContent = "This check was requested recently. Use the results below, then check again after 30 seconds.";
      return;
    }
    running = true;
    lastStarted = Date.now();
    trigger.disabled = true;
    trigger.textContent = "Checking…";
    status.textContent = "Reading seven public website addresses. No changes will be made.";
    status.dataset.status = "inconclusive";
    try {
      if (typeof window.api !== "function") {
        throw new Error("The private Headquarters connection is unavailable.");
      }
      const data = validate(await window.api("/api/admin/website-proof"));
      lastReceipt = data;
      render(data);
    } catch (error) {
      status.textContent = "Couldn't verify the website: " +
        (error instanceof Error ? error.message.slice(0, 160) : "Please try again.") +
        " No website changes were made.";
      status.dataset.status = "inconclusive";
    } finally {
      running = false;
      trigger.disabled = false;
      trigger.textContent = "Check website now ↗";
    }
  }

  function handoff(assistant) {
    if (!lastReceipt || typeof window.HQChooseAssistant !== "function") return;
    window.HQChooseAssistant({
      title: "YorpHives website: real public route checks",
      why: summaryText(lastReceipt),
      next_step: "Review any observed failed public-route formats or missing browser protection. " +
        "Treat inconclusive checks as uncertain, not confirmed outages. " +
        "Suggest safe, evidence-based remedies for the founder to evaluate. " +
        "Headquarters and YorpMind never modify code or dispatch repairs. " +
        "The founder makes and tests changes, then uses Preview → Go Live → OTP.",
      link: "https://yorphives.com/"
    }, assistant);
  }

  function init() {
    find("website-proof-run")?.addEventListener("click", checkWebsite);
    find("website-proof-chatgpt")?.addEventListener("click", () => handoff("chatgpt"));
    find("website-proof-yorpmind")?.addEventListener("click", () => handoff("yorpmind"));
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once:true });
  } else init();
})();
