/* A founder overview of recorded evidence. Every shortcut opens an existing
 * workspace; loading this dashboard never starts a job or grants access. */
(() => {
  "use strict";
  const find = id => document.getElementById(id);
  const set = (id, value) => { const node = find(id); if (node) node.textContent = String(value); };
  const finite = value => Number.isSafeInteger(value) && value >= 0;
  const count = value => finite(value) ? new Intl.NumberFormat().format(value) : "—";
  const dates = value => {
    const when = new Date(value);
    return Number.isFinite(when.getTime()) ? when.toLocaleString(undefined, {dateStyle:"medium",timeStyle:"short"}) : "time unavailable";
  };
  const allowedViews = new Set(["headquarters", "issues", "monitoring", "yorpmind", "business", "intelligence", "activity", "agents", "departments", "overview", "releases"]);
  const actionNames = { issues:"Open problems", headquarters:"Open mission desk", monitoring:"Open monitoring", yorpmind:"Open YorpMind", business:"Explore opportunities", intelligence:"Review ideas", activity:"Open activity", agents:"Open investigations", departments:"Open team", overview:"Open overview", releases:"Review publishing" };
  let pending = null;
  let nextAction = null;

  async function navigate(view, target) {
    if (!allowedViews.has(view)) return;
    const nav = document.querySelector('.nav-item[data-view="' + view + '"]');
    if (!nav) return;
    if (typeof window.showView === "function") await window.showView(view);
    else nav.click();
    if (view === "headquarters" && ["active", "review", "failed"].includes(target)) {
      const filter = find("hq-filter");
      if (filter) { filter.value = target; filter.dispatchEvent(new Event("change")); }
      find("hq-missions")?.scrollIntoView({block:"center",behavior:"smooth"});
      find("hq-missions")?.focus({preventScroll:true});
    }
  }

  async function shortcut(destination) {
    if (destination === "missions") return navigate("headquarters", "active");
    if (destination === "website") {
      await navigate("issues");
      const run = find("website-proof-run");
      run?.scrollIntoView({block:"center",behavior:"smooth"});
      run?.focus({preventScroll:true});
      // The founder explicitly requested this read-only check with this click.
      // Existing website-proof.js owns the bounded request and result display.
      if (run && !run.disabled) run.click();
      return;
    }
    await navigate(destination);
  }

  function unavailable(message = "Dashboard data unavailable. Your other workspaces remain available; use Refresh to retry.") {
    for (const id of ["cockpit-missions","cockpit-issues","cockpit-opportunities","cockpit-memory","cockpit-running","cockpit-review","cockpit-skills"]) set(id,"—");
    for (const id of ["cockpit-missions-note","cockpit-issues-note","cockpit-opportunities-note","cockpit-memory-note"]) set(id,"Records unavailable");
    set("cockpit-status",message);
    find("cockpit-status").dataset.state = "unavailable";
    set("cockpit-monitor-status","Not verified");
    set("cockpit-monitor-note","No current dashboard evidence. Open monitoring or run a fresh website check.");
    set("cockpit-health-badge","DATA UNAVAILABLE");
    find("cockpit-health-badge").dataset.state = "attention";
    set("cockpit-next-title","Choose where to continue.");
    set("cockpit-next-copy","The overview could not load. Your missions, problems and knowledge are still available from the navigation.");
    set("cockpit-next-action","Open mission desk →");
    find("cockpit-next-action").disabled = false;
    nextAction = {view:"headquarters",target:"active"};
  }

  function render(data) {
    if (data?.name !== "YorpHives Founder Cockpit" || data.read_only !== true ||
        !["ready","partial","unavailable"].includes(data.availability) ||
        !data.metrics || !data.sources || !Array.isArray(data.next_actions)) {
      throw new Error("Dashboard evidence is incomplete.");
    }
    if (data.availability === "unavailable") { unavailable(); return; }
    const { missions = {}, issues = {}, monitors = {}, memory = {}, opportunities = {} } = data.metrics;
    set("cockpit-missions", count(missions.active));
    set("cockpit-missions-note", finite(missions.running) && finite(missions.planned) ?
      count(missions.running)+" in progress · "+count(missions.planned)+" planned" : "Mission records unavailable");
    set("cockpit-issues", count(issues.active));
    set("cockpit-issues-note", finite(issues.critical) ? count(issues.critical)+" critical · open findings" :
      finite(issues.known_active) ? "At least "+count(issues.known_active)+" known · partial records" : "Problem records unavailable");
    set("cockpit-opportunities", finite(opportunities.proposed) && finite(opportunities.shortlisted) ? count(opportunities.proposed+opportunities.shortlisted) : "—");
    set("cockpit-opportunities-note", finite(opportunities.shortlisted) ? count(opportunities.shortlisted)+" shortlisted · hypotheses to validate" : "Opportunity records unavailable");
    set("cockpit-memory", count(memory.experiences));
    set("cockpit-memory-note", finite(memory.experiences) ? "Recorded repair lessons" : "Memory records unavailable");
    set("cockpit-running",count(missions.running));
    set("cockpit-review",count(missions.review));
    set("cockpit-skills",count(memory.approved_skills));

    const badge = find("cockpit-health-badge");
    if (!data.sources.monitors?.available || !finite(monitors.enabled)) {
      set("cockpit-monitor-status","Records unavailable");
      set("cockpit-monitor-note","Monitoring records could not be read. Run a website check for fresh evidence.");
      badge.textContent = "NOT VERIFIED";
      badge.dataset.state = "attention";
    } else if (monitors.enabled === 0) {
      set("cockpit-monitor-status","No checks enabled");
      set("cockpit-monitor-note","No enabled routes are recorded. Open monitoring to review its setup.");
      badge.textContent = "SETUP NEEDED";
      badge.dataset.state = "attention";
    } else {
      const incomplete = (monitors.stale || 0)+(monitors.unknown || 0);
      set("cockpit-monitor-status", count(monitors.passing)+" / "+count(monitors.enabled)+" recent passes");
      const parts = [];
      if (monitors.failing > 0) parts.push(count(monitors.failing)+" failing");
      if (incomplete > 0) parts.push(count(incomplete)+" stale or unchecked");
      parts.push("Latest recorded check: "+(monitors.last_checked_at ? dates(monitors.last_checked_at) : "not available"));
      set("cockpit-monitor-note",parts.join(" · ")+". A pass covers the recorded check only.");
      badge.textContent = monitors.failing > 0 || incomplete > 0 ? "NEEDS A LOOK" : "RECENT CHECKS";
      badge.dataset.state = monitors.failing > 0 || incomplete > 0 ? "attention" : "ready";
    }
    const missing = Object.values(data.sources).filter(source => !source.available || source.partial).length;
    const status = find("cockpit-status");
    status.textContent = "Updated "+dates(data.generated_at)+(missing ? " · "+missing+" data source(s) incomplete; available records are shown." : " · From your private database records.");
    status.dataset.state = missing ? "partial" : "ready";
    nextAction = data.next_actions.find(action => action && allowedViews.has(action.view) && typeof action.title === "string" && typeof action.description === "string") || null;
    set("cockpit-next-title",nextAction?.title || "Set your next business outcome.");
    set("cockpit-next-copy",nextAction?.description || "Give the team one clear mission with a result you can test. Start small, review the evidence, and build on what works.");
    set("cockpit-next-action",nextAction ? actionNames[nextAction.view]+" →" : "+ New mission");
    find("cockpit-next-action").disabled = false;
  }

  function loadCockpit() {
    if (pending) return pending;
    const button = find("cockpit-refresh");
    if (!button) return Promise.resolve();
    button.disabled = true;
    button.setAttribute("aria-busy","true");
    set("cockpit-status","Refreshing private records…");
    pending = (async () => {
      try {
        // Reuse the application's authenticated client and standard error state.
        const data = await api("/api/admin/cockpit");
        render(data);
      } catch { unavailable(); }
      finally {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        pending = null;
      }
    })();
    return pending;
  }

  function init() {
    set("cockpit-date",new Date().toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"}).toUpperCase());
    find("cockpit-refresh")?.addEventListener("click",loadCockpit);
    document.querySelectorAll("[data-cockpit-go]").forEach(button => {
      button.addEventListener("click",() => { shortcut(button.dataset.cockpitGo).catch(() => {}); });
    });
    find("cockpit-next-action")?.addEventListener("click",() => {
      if (nextAction) navigate(nextAction.view,nextAction.target).catch(() => {});
      else find("hq-new")?.click();
    });
    // The existing Home loader also runs after a saved mission. Refreshing the
    // overview here keeps the genuine whole-table counters in sync with it.
    setInterval(() => {
      if (document.visibilityState === "visible" && find("view-headquarters")?.classList.contains("active")) void loadCockpit();
    },60000);
  }
  const previous = window.loadHeadquarters;
  if (typeof previous === "function") {
    window.loadHeadquarters = async (...args) => {
      const [result] = await Promise.allSettled([previous(...args),loadCockpit()]);
      if (result.status === "rejected") throw result.reason;
      return result.value;
    };
  }
  window.loadFounderCockpit = loadCockpit;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",init,{once:true});
  else { init(); if (find("view-headquarters")?.classList.contains("active")) void loadCockpit(); }
})();
