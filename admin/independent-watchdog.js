/* Independent supervisor evidence is optional. The regular cockpit only
 * knows about stored HTTP/Access checks. This read-only module upgrades the HQ
 * tile when a fresh outside-in watchdog snapshot exists on self-hosted HQ.
 */
(() => {
  "use strict";
  const id = name => document.getElementById(name);
  let inflight = null, lastAt = 0;
  const allowed = new Set(["headquarters-ready","website-home","website-tools","website-studio","website-discovery","website-manifest"]);
  function show(area,value,details,label,state) {
    const display = id("hq-watchtower-"+area+"-value");
    if (!display) return;
    display.textContent = value;
    id("hq-watchtower-"+area+"-detail").textContent = details;
    id("hq-watchtower-"+area+"-state").textContent = label;
    const card = display.closest(".hq-watchtower-card");
    if (card) card.dataset.state = state;
  }
  function render(data) {
    if (!data || data.source !== "independent_local_watchdog" ||
        data.connected !== true || !["ready","degraded"].includes(data.status) ||
        data.repairs_authorized !== false || data.production_execution_enabled !== false ||
        !Array.isArray(data.observations) || data.observations.length > 6) return;
    const names = new Set();
    for (const entry of data.observations) {
      if (!entry || !allowed.has(entry.target) || names.has(entry.target) ||
          !["ready","reachable","degraded","unavailable"].includes(entry.state) ||
          typeof entry.reason !== "string" ||
          !Number.isFinite(Date.parse(entry.checked_at))) return;
      names.add(entry.target);
    }
    const hq = data.observations.find(item => item.target === "headquarters-ready");
    if (!hq) return;
    const observed = Date.parse(data.observed_at);
    if (!Number.isFinite(observed) || observed > Date.now() + 5000) return;
    const when = new Date(observed).toLocaleString();
    if (hq.state === "ready" && data.status === "ready") {
      show("headquarters","Runtime ready",
        "Independent check: database and monitoring scheduler ready · observed "+when+".",
        "EXTERNAL CHECK","recorded");
    } else {
      show("headquarters","Needs attention",
        "Independent runtime readiness was degraded · observed "+when+".",
        "RUNTIME ISSUE","alert");
    }
    const checks = ["website-discovery","website-manifest"].map(target =>
      data.observations.find(item => item.target === target)).filter(Boolean);
    if (!checks.length) return;
    if (checks.some(item => item.state === "degraded")) {
      show("products","Catalogue issue",
        "One or more Free Tools discovery contracts were unverified or failed · observed "+when+
        ". Individual product workflows have not been tested.",
        "API NEEDS REVIEW","alert");
    } else if (checks.length === 2 &&
        checks.every(item => item.reason === "catalogue_contract_verified")) {
      show("products","Catalogues in sync",
        "Two published website tool lists agree on active tool slugs · observed "+when+
        ". This does not establish that any individual workflow works.",
        "CATALOGUES MATCH","limited");
    } else if (checks.some(item => item.state === "unavailable")) {
      const studio=data.observations.find(item=>item.target==="website-studio");
      show("products",studio?.state==="reachable"?"Studio reachable":"Discovery pending",
        "Public File Studio route is checked separately. Catalogue APIs are not yet available or verifiable · observed "+when+
        ". Individual tool functions remain untested.",
        "DISCOVERY NOT CONNECTED","limited");
    } else if (checks.some(item=>item.reason==="catalogue_contract_verified")) {
      show("products","1 discovery source",
        "Only one public catalogue was verifiably returned · observed "+when+
        ". Cross-source consistency and tool functionality are not established.",
        "PARTIAL SYNC","limited");
    }
  }
  function load() {
    if (inflight) return inflight;
    if (Date.now() - lastAt < 30000) return Promise.resolve();
    lastAt = Date.now();
    inflight = (async () => {
      try {
        const response = await fetch("/api/admin/watchdog-status",{
          method:"GET",credentials:"same-origin",cache:"no-store",redirect:"manual",
          headers:{accept:"application/json"},signal:AbortSignal.timeout(7000)
        });
        if (response.status !== 200 || response.redirected ||
            !response.headers.get("content-type")?.includes("application/json")) return;
        render(await response.json());
      } catch {
        // A missing or stale local watchdog never becomes a false green state;
        // base Watchtower explicitly labels HQ runtime as UNVERIFIED.
      }
    })().finally(()=>{ inflight = null; });
    return inflight;
  }
  window.addEventListener("yorphives:cockpit-evidence", () => { void load(); });
  window.loadIndependentWatchdog = load;
})();
