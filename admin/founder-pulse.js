/* Founder Pulse. Read-only social-style feed from the existing cockpit API.
 * No API requests, mutations, model dispatches, tracking, or release privileges. */
(() => {
  "use strict";
  const id = name => document.getElementById(name);
  const LIMIT = 9;
  const filters = ["all","attention","work","discover"];
  const destinations = new Set(["headquarters","issues","monitoring","intelligence","business","activity","releases"]);
  const safeCount = value => Number.isSafeInteger(value) && value >= 0;
  const num = value => safeCount(value) ? new Intl.NumberFormat().format(value) : "—";
  const label = (value,fallback="Untitled update",max=150) => typeof value === "string" && value.trim()
    ? value.trim().slice(0,max) : fallback;
  const clock = value => typeof value === "string" && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"}) : "Time not recorded";
  const source = (data,key) => data.sources?.[key]?.available === true;
  let snapshot = null;
  let activeFilter = "all";
  let entries = [];

  function make(tag,cls,value) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value !== undefined) node.textContent = String(value);
    return node;
  }
  function openPage(destination) {
    if (!destinations.has(destination)) return;
    // Existing navigation is the sole destination; never permit a stored URL,
    // automatic approval, POST, model dispatch, or publishing from the feed.
    document.querySelector('.nav-item[data-view="' + destination + '"]')?.click();
  }
  function updateDock() {
    const selected = document.querySelector('.nav-item[data-view][aria-current="page"]')?.dataset.view || "headquarters";
    document.querySelectorAll(".hq-mobile-dock [data-pulse-route]").forEach(button => {
      const active = button.dataset.pulseRoute === selected;
      button.classList.toggle("active",active);
      if (active) button.setAttribute("aria-current","page");
      else button.removeAttribute("aria-current");
    });
  }
  const entry = (kind,author,symbol,title,body,route,action,time,urgency="info",pill="") =>
    ({kind,author,symbol,title,body,route,action,time,urgency,pill});

  function createEntries(data) {
    const result = [];
    const metrics = data.metrics || {};
    const mon = metrics.monitors || {};
    const issues = metrics.issues || {};
    const opp = metrics.opportunities || {};
    if (source(data,"monitors")) {
      const failed = safeCount(mon.failing) ? mon.failing : 0;
      const stale = safeCount(mon.stale) ? mon.stale : 0;
      const unknown = safeCount(mon.unknown) ? mon.unknown : 0;
      const needsLook = failed + stale + unknown > 0;
      const title = mon.enabled === 0 ? "Set up your first website check"
        : needsLook ? "Some monitoring checks need attention"
        : "Here is the latest recorded monitoring picture";
      const body = mon.enabled === 0
        ? "No enabled monitors are recorded. A blank monitoring setup is not proof the website is healthy."
        : num(mon.passing) + " recent passes out of " + num(mon.enabled) +
          " enabled checks · " + num(mon.failing) + " failing · " +
          num(stale + unknown) + " stale or unchecked. These are stored results, not a live website probe.";
      result.push(entry(needsLook || mon.enabled === 0 ? "attention" : "work","Monitoring","◉",
        title,body,"monitoring","Open monitoring",mon.last_checked_at,needsLook ? "warning" : "info","RECORDED CHECKS"));
    }
    if (source(data,"issues")) {
      const total = safeCount(issues.active) ? issues.active : issues.known_active;
      const critical = safeCount(issues.critical) ? issues.critical : issues.known_critical;
      const partial = data.sources.issues.partial === true;
      const body = safeCount(total) ? (partial ? "At least " : "") + num(total) +
        " reported issue(s), including " + num(critical) +
        " critical. Open the inbox to inspect evidence and decide what needs fixing."
        : "Issue totals are incomplete. Open the inbox to inspect available evidence.";
      result.push(entry(safeCount(total) && total > 0 ? "attention" : "work","Issue inbox","⚑",
        safeCount(total) && total > 0 ? "Findings are waiting in your inbox" : "Issue inbox summary",
        body,"issues","Open inbox",data.sources.issues.observed_at,
        critical > 0 ? "urgent" : "info",partial ? "PARTIAL EVIDENCE" : "PRIVATE RECORDS"));
    }
    for (const item of Array.isArray(data.next_actions) ? data.next_actions.slice(0,2) : []) {
      if (!item || !destinations.has(item.view) || typeof item.title !== "string" ||
          typeof item.description !== "string") continue;
      result.push(entry("attention","For your review","✦",label(item.title),label(item.description,"",250),
        item.view,"Review next step",data.generated_at,item.urgency === "urgent" ? "urgent" : "warning",
        "SUGGESTED · NOT AUTOMATIC"));
    }
    if (source(data,"opportunities")) {
      const proposed = opp.proposed;
      const shortlisted = opp.shortlisted;
      result.push(entry("discover","Opportunity radar","◇",
        safeCount(proposed) && safeCount(shortlisted) && proposed + shortlisted > 0
          ? "Possibilities to investigate" : "Your opportunity pipeline is ready",
        num(proposed) + " proposed · " + num(shortlisted) +
        " shortlisted. Ideas are research hypotheses, not verified demand, customers or revenue.",
        "intelligence","Explore ideas",data.sources.opportunities.observed_at,"info","RESEARCH ONLY"));
    }
    if (source(data,"missions")) {
      for (const mission of (Array.isArray(data.recent_missions) ? data.recent_missions : []).slice(0,3)) {
        if (!mission || typeof mission !== "object") continue;
        const state = label(mission.status,"Status not recorded",50).replaceAll("_"," ");
        result.push(entry("work","Mission desk","▤",label(mission.title,"Unnamed mission"),
          "Last recorded state: " + state + ". Open the mission desk to review the details.",
          "headquarters","View mission desk",mission.updated_at,"info","RECORDED MISSION"));
      }
    }
    if (source(data,"activity")) {
      for (const item of (Array.isArray(data.recent_activity) ? data.recent_activity : []).slice(0,2)) {
        if (!item || typeof item !== "object") continue;
        result.push(entry("work","Activity trail","◷",label(item.title,"Recorded activity"),
          "Event: " + label(item.event_type,"Unspecified event",70).replaceAll("_"," ") +
          ". Review the underlying audit trail for details.",
          "activity","View activity",item.created_at,"info","AUDIT RECORD"));
      }
    }
    return result.slice(0,LIMIT);
  }

  function post(item) {
    const card = make("article","hq-pulse-post");
    card.dataset.kind = item.kind;
    card.dataset.urgency = item.urgency;
    card.setAttribute("aria-label",item.author + ": " + item.title);
    const top = make("div","hq-pulse-post-top");
    const avatar = make("span","hq-pulse-avatar",item.symbol);
    avatar.setAttribute("aria-hidden","true");
    const identity = make("div","hq-pulse-post-identity");
    identity.append(make("strong","",item.author),make("small","",clock(item.time)));
    top.append(avatar,identity,make("span","hq-pulse-pill",item.pill));
    card.append(top,make("h3","",item.title),make("p","",item.body));
    const bottom = make("div","hq-pulse-post-bottom");
    bottom.append(make("span","hq-pulse-readonly","↗ Open details · read only"));
    const button = make("button","hq-pulse-open",item.action + " →");
    button.type = "button";
    button.dataset.pulseRoute = item.route;
    bottom.append(button);
    card.append(bottom);
    return card;
  }

  function renderFeed() {
    const feed = id("hq-pulse-feed");
    if (!feed) return;
    const matching = entries.filter(item => activeFilter === "all" || item.kind === activeFilter);
    if (!matching.length) {
      const empty = make("div","hq-pulse-empty");
      empty.append(
        make("strong","",snapshot ? "Nothing recorded in this feed yet." : "Your feed is unavailable."),
        make("p","",snapshot
          ? "Try another tab or refresh. An empty feed does not confirm that everything is healthy."
          : "Private records could not be loaded. Use the sidebar or refresh to retry."));
      feed.replaceChildren(empty);
    } else feed.replaceChildren(...matching.map(post));
    feed.setAttribute("aria-busy","false");
  }

  function renderRail(data) {
    const summary = id("hq-pulse-monitor-summary");
    const detail = id("hq-pulse-monitor-note");
    const attention = id("hq-pulse-attention");
    if (!summary || !detail || !attention) return;
    if (!data || !source(data,"monitors")) {
      summary.textContent = "Not verified";
      detail.textContent = "Monitoring evidence is unavailable. This is not a clean bill of health.";
    } else if (data.metrics.monitors?.enabled === 0) {
      summary.textContent = "Setup needed";
      detail.textContent = "No enabled monitoring routes are on record.";
    } else {
      const mon = data.metrics.monitors || {};
      summary.textContent = num(mon.passing) + " / " + num(mon.enabled) + " recent passes";
      detail.textContent = "Last check: " + clock(mon.last_checked_at) + ". Based on stored records.";
    }
    attention.textContent = data
      ? num(entries.filter(item => item.kind === "attention").length) + " digest updates to review"
      : "Unavailable";
  }

  function receive(data) {
    if (!data || data.name !== "YorpHives Founder Cockpit" || data.read_only !== true ||
        !data.metrics || !data.sources || data.availability === "unavailable") {
      snapshot = null;
      entries = [];
      renderRail(null);
      const status = id("hq-pulse-status");
      if (status) {
        status.textContent = "Could not read private records · Use Refresh to retry.";
        status.dataset.state = "unavailable";
      }
      renderFeed();
      return;
    }
    snapshot = data;
    entries = createEntries(data);
    const status = id("hq-pulse-status");
    if (status) {
      status.textContent = (data.availability === "partial" ? "Some sources unavailable · " : "Read-only private digest · ") +
        "Updated " + clock(data.generated_at) + " · No actions taken automatically.";
      status.dataset.state = data.availability === "partial" ? "partial" : "ready";
    }
    renderRail(data);
    renderFeed();
  }
  function chooseFilter(value) {
    if (!filters.includes(value)) return;
    activeFilter = value;
    document.querySelectorAll("[data-pulse-filter]").forEach(button => {
      const selected = button.dataset.pulseFilter === value;
      button.setAttribute("aria-selected",selected ? "true" : "false");
      button.tabIndex = selected ? 0 : -1;
    });
    renderFeed();
  }
  function init() {
    document.querySelectorAll("[data-pulse-filter]").forEach(button => {
      button.addEventListener("click",() => chooseFilter(button.dataset.pulseFilter));
      button.addEventListener("keydown",event => {
        if (!["ArrowLeft","ArrowRight","Home","End"].includes(event.key)) return;
        event.preventDefault();
        const current = filters.indexOf(button.dataset.pulseFilter);
        const index = event.key === "Home" ? 0 : event.key === "End" ? filters.length-1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + filters.length) % filters.length;
        chooseFilter(filters[index]);
        document.querySelector('[data-pulse-filter="' + filters[index] + '"]')?.focus();
      });
    });
    document.addEventListener("click",event => {
      const button = event.target instanceof Element ? event.target.closest("[data-pulse-route]") : null;
      if (button) openPage(button.dataset.pulseRoute);
    });
    id("hq-pulse-refresh")?.addEventListener("click",() => id("cockpit-refresh")?.click());
    window.addEventListener("yorphives:cockpit-evidence",event => receive(event.detail));
    updateDock();
    const sidebar = id("sidebar");
    if (sidebar) new MutationObserver(updateDock).observe(sidebar,{
      subtree:true,attributes:true,attributeFilter:["aria-current"]
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();