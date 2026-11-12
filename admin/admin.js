const $ = (id) => document.getElementById(id);
const setText = (id, value) => {
  const element = $(id);
  if (element) element.textContent = String(value ?? "—");
  else console.warn("Admin UI element is missing:", id);
};
const date = (value) => value ? new Date(value).toLocaleString() : "—";
const number = (value) => new Intl.NumberFormat().format(Number(value || 0));
const text = (value) => String(value ?? "—");
const state = { view: "headquarters", loaded: new Set(), assets: [], findings: [], dependencies: [], range: "7d", findingFilter: "active", assetFilter: "all", assetQuery: "", dependencyQuery: "" };
let repairAgentReady = false;
let analyticsSnapshot = null;

function showSystemMessage(message, options = {}) {
  const panel = $("system-message");
  const content = $("system-message-text");
  const action = $("system-message-action");
  if (!panel || !content) return;
  content.textContent = message;
  panel.hidden = false;
  panel.classList.toggle("is-error", options.kind === "error");
  panel.classList.toggle("is-success", options.kind === "success");
  if (action) {
    action.hidden = !options.reauthenticate;
    action.href = "/admin/";
  }
}
async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { "content-type": "application/json", ...(options.headers || {}) },
      cache: "no-store",
      credentials: "same-origin",
      redirect: "follow"
    });
  } catch (error) {
    showSystemMessage("The Admin API could not be reached. Check your connection and use Refresh to retry.", { kind: "error" });
    throw error;
  }
  if (response.redirected || response.status === 401 || response.status === 403) {
    showSystemMessage("Your Cloudflare Access session may have expired or this browser is not authorized. Sign in again, then reload the Admin.", { kind: "error", reauthenticate: true });
    throw new Error("Cloudflare Access authorization is required. Use Sign in / refresh.");
  }
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json().catch(() => ({})) : {};
  if (!response.ok) {
    const message = data.error?.message || data.message || "Admin request failed (" + response.status + ")";
    showSystemMessage(message, { kind: "error" });
    throw new Error(message);
  }
  return data;
}
function cell(row, value) {
  const td = document.createElement("td");
  td.textContent = text(value);
  row.append(td);
  return td;
}
function emptyRow(target, message, colspan) {
  if (!target) return;
  const tr = document.createElement("tr");
  const td = cell(tr, message);
  td.colSpan = colspan;
  td.className = "empty-state";
  target.replaceChildren(tr);
}
function badge(value, fallback = "pending") {
  const span = document.createElement("span");
  const status = String(value || fallback).toLowerCase();
  span.className = "pill " + (["critical","high","medium","low","info","healthy","pending","warning"].includes(status) ? status : "pending");
  span.textContent = value || fallback;
  return span;
}
function renderTable(target, items, columns, emptyMessage, colspan) {
  if (!target) return;
  target.replaceChildren();
  if (!items?.length) return emptyRow(target, emptyMessage, colspan);
  for (const item of items) {
    const tr = document.createElement("tr");
    for (const column of columns) {
      if (typeof column === "function") column(tr, item);
      else cell(tr, item[column] ?? "—");
    }
    target.append(tr);
  }
}
function showView(name) {
  const view = document.getElementById("view-" + name);
  if (!view) return;
  state.view = name;
  history.replaceState(null, "", "#" + name);
  document.querySelectorAll(".view").forEach(item => item.classList.toggle("active", item === view));
  document.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === name));
  setText("breadcrumb", view.dataset.title || name);
  $("sidebar").classList.remove("open");
  $("mobile-scrim").classList.remove("show");
  $("mobile-menu").setAttribute("aria-expanded", "false");
  if (!state.loaded.has(name)) loadView(name);
}
async function loadView(name) {
  const loaders = {
    headquarters: () => window.loadHeadquarters(),
    departments: () => window.loadHeadquarters(),
    overview: loadOverview,
    monitoring: loadMonitoring,
    analytics: loadAnalytics,
    issues: loadIssues,
    agents: loadAgents,
    updates: loadUpdates,
    releases: async () => {},
    activity: loadActivity
  };
  const loader = loaders[name];
  if (!loader) return;
  try {
    await loader();
    state.loaded.add(name);
  } catch (error) {
    console.error("Admin workspace failed:", name, error);
    const status = $("run-state");
    if (status) status.textContent = name + " unavailable: " + error.message;
    showSystemMessage(name + " could not load: " + error.message, { kind: "error", reauthenticate: /Cloudflare Access/i.test(error.message) });
  }
}
async function getAssets(force = false) {
  if (!force && state.assets.length) return state.assets;
  const result = await api("/api/admin/assets");
  state.assets = result.assets || [];
  state.dependencies = result.dependencies || [];
  state.catalogue = result.catalogue || [];
  state.sourceErrors = result.source_errors || {};
  state.assetCounts = result.counts || {};
  state.assetFindings = result.findings || [];
  updateNavigationCounts();
  return state.assets;
}
async function getOverview() {
  if (state.overviewData) return state.overviewData;
  state.overviewData = await api("/api/admin/overview");
  return state.overviewData;
}
function updateNavigationCounts() {
  if ($("nav-issues")) $("nav-issues").textContent = state.findings.filter(item => ["open","investigating","awaiting_approval"].includes(item.status)).length || "";
  if ($("nav-updates")) $("nav-updates").textContent = state.dependencies.filter(item => ["deprecated","major_update","update_available"].includes(item.status)).length || "";
}
function renderRuns(target, runs) {
  renderTable(target, runs, [
    (tr,item)=>cell(tr,date(item.started_at)),
    (tr,item)=>{const td=cell(tr,"");td.append(badge(item.status));},
    (tr,item)=>cell(tr,item.monitor_count),
    (tr,item)=>cell(tr,item.passed_count),
    (tr,item)=>cell(tr,item.failed_count)
  ], "No monitoring runs have been recorded yet.", 5);
}
function renderChanges(target, changes) {
  renderTable(target, changes, [
    (tr,item)=>cell(tr,date(item.detected_at)),
    (tr,item)=>cell(tr,item.title),
    (tr,item)=>cell(tr,item.details),
    (tr,item)=>cell(tr,item.status)
  ], "No production changes have been detected.", 4);
}
function renderAudit(target, events) {
  renderTable(target, events, [
    (tr,item)=>cell(tr,date(item.created_at)),
    (tr,item)=>cell(tr,item.actor),
    (tr,item)=>cell(tr,item.action),
    (tr,item)=>cell(tr,item.resource_type + (item.resource_id ? " · " + item.resource_id.slice(0,10) : "")),
    (tr,item)=>cell(tr,item.details_json)
  ], "No audit events have been recorded yet.", 5);
}
function renderAssets() {
  const target = $("assets-list");
  if (!target) return;
  const query = state.assetQuery.toLowerCase();
  const filtered = state.assets.filter(item => {
    const typeMatch = state.assetFilter === "all" || item.asset_type === state.assetFilter || (state.assetFilter === "api" && ["api","discovery"].includes(item.asset_type));
    const searchMatch = !query || [item.title,item.url,item.asset_type,item.asset_key].some(value => String(value || "").toLowerCase().includes(query));
    return typeMatch && searchMatch;
  });
  renderTable(target, filtered, [
    (tr,item)=>cell(tr,item.asset_type.replaceAll("_"," ")),
    (tr,item)=>cell(tr,item.title + (item.url ? " · " + item.url : "")),
    (tr,item)=>{const td=cell(tr,"");td.append(badge(item.last_status,item.last_status || "pending"));},
    (tr,item)=>cell(tr,item.last_http_status ?? "—"),
    (tr,item)=>cell(tr,item.last_duration_ms == null ? "—" : item.last_duration_ms + " ms"),
    (tr,item)=>cell(tr,date(item.last_checked_at))
  ], "No assets match this filter. Run an inventory scan to discover platform assets.", 6);
}
function renderCatalogue() {
  const target=$("catalogue-list");
  if(!target)return;
  setText("catalogue-count", number(state.catalogue.length)+" applications");
  renderTable(target,state.catalogue,[
    (tr,item)=>cell(tr,item.title+" · "+item.slug),
    (tr,item)=>{const td=cell(tr,"");td.append(badge(item.status));},
    (tr,item)=>cell(tr,item.access_model),
    (tr,item)=>cell(tr,item.destination_url || "Not published"),
    (tr,item)=>cell(tr,item.source || "—"),
    (tr,item)=>cell(tr,date(item.updated_at))
  ],"No YorpHives applications are registered in the shared catalogue.",6);
}
function renderDependencies() {
  const target = $("dependencies-list");
  if (!target) return;
  const query = state.dependencyQuery.toLowerCase();
  const filtered = state.dependencies.filter(item => !query || [item.package_name,item.current_version,item.latest_version,item.status,item.details].some(value => String(value || "").toLowerCase().includes(query)));
  renderTable(target, filtered, [
    (tr,item)=>cell(tr,item.package_name),
    (tr,item)=>cell(tr,item.current_version),
    (tr,item)=>cell(tr,item.latest_version || "—"),
    (tr,item)=>{const td=cell(tr,"");td.append(badge(item.status));},
    (tr,item)=>cell(tr,item.details)
  ], "No dependency observations match this filter.", 5);
}
function renderRecommendations() {
  renderTable($("asset-findings-list"), state.assetFindings || [], [
    (tr,item)=>{const td=cell(tr,"");td.append(badge(item.severity));},
    (tr,item)=>cell(tr,item.asset_title + " · " + item.category),
    (tr,item)=>cell(tr,item.title + " — " + item.details),
    (tr,item)=>cell(tr,date(item.last_verified)),
    (tr,item)=>cell(tr,item.recommendation)
  ], "No active asset recommendations. Run a scan to establish the baseline.", 5);
}
async function loadOverview() {
  const [overview, assetsResult, findings, audit] = await Promise.all([
    api("/api/admin/overview"),
    api("/api/admin/assets"),
    api("/api/admin/findings"),
    api("/api/admin/audit")
  ]);
  state.overviewData = overview;
  state.assets = assetsResult.assets || [];
  state.dependencies = assetsResult.dependencies || [];
  state.catalogue = assetsResult.catalogue || [];
  state.sourceErrors = assetsResult.source_errors || {};
  state.assetCounts = assetsResult.counts || {};
  state.assetFindings = assetsResult.findings || [];
  state.findings = findings.data || [];
  const counts = overview.counts || {};
  const ac = state.assetCounts;
  setText("identity", overview.identity || "Administrator");
  setText("sidebar-identity", overview.identity || "Authorized owner");
  setText("asset-count", number(ac.assets));
  setText("asset-breakdown", number(ac.website_pages) + " pages · " + number(ac.free_tools) + " tools · " + number(ac.catalogue_applications ?? ac.products) + " applications");
  setText("findings", number(counts.open_findings));
  setText("critical-label", number(counts.critical_findings) + " critical findings");
  setText("updates-count", number(ac.updates_available));
  setText("agent-count", "—");
  setText("agent-summary", "Open AI Operations for live readiness");
  setText("last-run", "Last check " + date(counts.last_run_at));
  const down = (ac.unavailable || 0) + (ac.degraded || 0);
  setText("platform-status", down ? down + " asset" + (down === 1 ? "" : "s") + " need attention" : "Monitoring signals are available");
  setText("platform-summary", number(ac.assets) + " discovered assets · " + number(ac.healthy) + " healthy · " + down + " degraded or unavailable. A successful scan is required to confirm health.");
  setText("run-state", "Updated " + new Date().toLocaleTimeString());
  const components = [
    ["Admin Control Center", 1, "Authenticated · Admin API responding"],
    ["Public website", ac.website_pages, "Discovered through sitemap"],
    ["Free Tools", ac.free_tools, "Discovered through manifest"],
    ["Products & apps", ac.catalogue_applications ?? ac.products, "Shared catalogue · all lifecycle states"],
    ["APIs & discovery", ac.api_discovery, "Registered platform endpoints"],
    ["Dependencies", state.dependencies.length, "Observed pinned packages"]
  ];
  const componentTarget = $("component-list");
  componentTarget.replaceChildren();
  for (const [name,count,description] of components) {
    const row=document.createElement("div");row.className="component-row";
    const left=document.createElement("span");left.className="component-name";
    const dot=document.createElement("i");dot.className="status-dot";
    const label=document.createElement("span");label.textContent=name;
    left.append(dot,label);
    const right=document.createElement("span");right.className="component-status";right.textContent=number(count)+" · "+description;
    row.append(left,right);componentTarget.append(row);
  }
  const attention = [...state.findings].sort((a,b)=>({critical:0,high:1,medium:2,low:3,info:4}[a.severity]??5)-({critical:0,high:1,medium:2,low:3,info:4}[b.severity]??5)).slice(0,5);
  const attentionTarget=$("attention-list");attentionTarget.replaceChildren();
  if (!attention.length) {
    const item=document.createElement("div");item.className="empty-state";item.textContent="No active findings. Keep monitoring to maintain a verified baseline.";attentionTarget.append(item);
  } else for(const finding of attention) {
    const item=document.createElement("div");item.className="signal-item";
    const copy=document.createElement("div");const title=document.createElement("strong");title.textContent=finding.title;
    const meta=document.createElement("small");meta.textContent=(finding.monitor_name || finding.environment || "Platform") + " · "+finding.status;
    copy.append(title,meta);item.append(copy,badge(finding.severity));attentionTarget.append(item);
  }
  renderAudit($("overview-activity"), (audit.data || []).slice(0,6));
  updateNavigationCounts();
  await loadAgents(false);
}
async function loadMonitoring() {
  const [assets,overview,changes]=await Promise.all([getAssets(true),getOverview(),api("/api/admin/changes")]);
  renderAssets();renderCatalogue();renderRuns($("runs"),overview.recent_runs || []);renderChanges($("changes-list"),changes.data || []);
  const sourceFailures=Object.entries(state.sourceErrors).filter(([,error])=>error).map(([name,error])=>name+": "+error);
  setText("inventory-source-status", sourceFailures.length ? "Some live inventory sources are unavailable: " + sourceFailures.join(" · ") : "Live inventory sources connected · public catalogue · Free Tools API · sitemap · OpenAPI");
  const c=state.assetCounts;
  setText("website-count", number(c.website_pages));
  setText("tools-count", number(c.free_tools));
  setText("products-count", number(c.catalogue_applications ?? c.products));
  renderCatalogue();
  setText("asset-down", number((c.unavailable||0)+(c.degraded||0)));
}
async function loadIssues() {
  const status=state.findingFilter;
  const [findings,assets]=await Promise.all([
    api("/api/admin/findings?status="+(status==="all"?"all":status==="resolved"?"resolved":"active")),
    getAssets(true)
  ]);
  state.findings=findings.data || [];
  state.assetFindings=state.assetFindings || assets;
  renderFindings();
  renderRecommendations();
  updateNavigationCounts();
}
function renderFindings() {
  const target=$("findings-list");
  renderTable(target,state.findings,[
    (tr,item)=>{const td=cell(tr,"");td.append(badge(item.severity));},
    (tr,item)=>cell(tr,item.title+" — "+item.details),
    (tr,item)=>cell(tr,item.environment || item.monitor_name || "—"),
    (tr,item)=>{const td=cell(tr,"");td.append(badge(item.status));},
    (tr,item)=>cell(tr,date(item.last_verified)),
    (tr,item)=>{
      const td=document.createElement("td");
      const button=document.createElement("button");button.className="button";
      const closed=["accepted_risk","fixed","verified"].includes(item.status);
      const next=closed?"open":item.status==="investigating"?"accepted_risk":"investigating";
      button.textContent=closed?"Reopen":next==="accepted_risk"?"Accept risk":"Investigate";
      button.addEventListener("click",async()=>{
        if(next==="accepted_risk"&&!confirm("Record this finding as an accepted risk? The decision will be audited."))return;
        button.disabled=true;
        try{await api("/api/admin/findings",{method:"PATCH",body:JSON.stringify({id:item.id,status:next})});state.loaded.delete("overview");await loadIssues();await loadOverview();}
        catch(error){showSystemMessage(error.message, { kind: "error", reauthenticate: /Cloudflare Access/i.test(error.message) });}finally{button.disabled=false;}
      });
      td.append(button);tr.append(td);
    }
  ],"No findings in this view.",6);
}
async function loadAnalytics() {
  setText("analytics-status", "Loading Cloudflare zone analytics · " + state.range + "…");
  try {
    const result=await api("/api/admin/analytics?range="+state.range);
    if(!result.configured){setText("analytics-status", result.message);analyticsSnapshot=null;resetAnalytics();return;}
    if(result.error)throw new Error(result.error);
    analyticsSnapshot=result;
    setText("analytics-status", "Cloudflare edge analytics · " + result.range + " · refreshed " + new Date().toLocaleTimeString());
    setText("metric-views", number(result.totals?.pageViews));
    setText("metric-requests", number(result.totals?.requests));
    setText("metric-bandwidth", (Number(result.totals?.bytes||0)/1073741824).toFixed(2)+" GB");
    renderTraffic(result.daily || []);
    renderTable($("top-paths"),result.topPaths || [],[
      (tr,item)=>cell(tr,item.path || "/"),
      (tr,item)=>cell(tr,number(item.requests))
    ],"No path data returned for this period.",2);
  } catch(error) {
    setText("analytics-status", "Analytics unavailable: " + error.message);
    resetAnalytics();
  }
}
function exportAnalytics(){
  if(!analyticsSnapshot){setText("analytics-status", "No verified analytics data is available to export.");return;}
  const blob=new Blob([JSON.stringify({generated_at:new Date().toISOString(),source:"Cloudflare zone analytics",...analyticsSnapshot},null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download="yorphives-analytics-"+analyticsSnapshot.range+".json";link.click();URL.revokeObjectURL(url);
}
function resetAnalytics(){
  ["metric-views","metric-requests","metric-bandwidth"].forEach(id=>$(id).textContent="—");
  emptyRow($("top-paths"),"Analytics data is not available.",2);
  setText("traffic-chart", "Daily traffic is unavailable until the analytics connection responds.");
}
function renderTraffic(daily) {
  const target=$("traffic-chart");target.replaceChildren();
  if(!daily.length){const p=document.createElement("div");p.className="empty-state";p.textContent="No daily traffic groups returned for this period.";target.append(p);return;}
  const max=Math.max(1,...daily.map(item=>Number(item.pageViews || item.requests || 0)));
  for(const item of daily){
    const value=Number(item.pageViews || item.requests || 0);
    const column=document.createElement("div");column.className="bar-column";column.title=item.date+": "+number(value);
    const bar=document.createElement("div");bar.className="bar";bar.style.height=Math.max(2,value/max*100)+"%";
    const label=document.createElement("small");label.textContent=String(item.date||"").slice(5);
    column.append(bar,label);target.append(column);
  }
}
async function loadAgents(refresh=true) {
  try {
    const jobs=await api("/api/admin/repair-jobs");
    const registry=jobs;
    const summary=registry.summary||{};
    setText("agent-active-count",number(summary.active));
    setText("agent-blocked-count",number(summary.blocked));
    setText("agent-planned-count",number(summary.planned));
    setText("agent-security-count",number(summary.open_security_findings));
    const roster=$("agent-roster");
    if(roster){
      roster.replaceChildren();
      for(const agent of registry.agents||[]){
        const card=document.createElement("article");card.className="agent-card";
        const head=document.createElement("div");head.className="agent-card-head";
        const titleWrap=document.createElement("div");
        const title=document.createElement("h3");title.textContent=agent.name;
        const role=document.createElement("div");role.className="agent-role";role.textContent=agent.role;
        titleWrap.append(title,role);
        const stateBadge=document.createElement("span");stateBadge.className="agent-state "+agent.status;stateBadge.textContent=agent.status;
        head.append(titleWrap,stateBadge);
        const description=document.createElement("p");description.textContent=agent.description;
        const detail=document.createElement("small");detail.textContent=agent.detail;
        const last=document.createElement("small");last.textContent=agent.last_run_at?"Last run · "+date(agent.last_run_at):"No run recorded";
        card.append(head,description,detail,last);roster.append(card);
      }
    }
    repairAgentReady=jobs.agentConfigured===true;
    const status=$("agent-state");
    if(status){status.textContent=repairAgentReady?"Cloudflare repair agent ready · GitHub @"+(jobs.github?.login||"verified"):"Repair agent blocked · GitHub, Actions or Worker dependencies not verified";status.classList.toggle("ready",repairAgentReady);}
    if($("repair-submit"))$("repair-submit").disabled=!repairAgentReady;
    if($("agent-count"))$("agent-count").textContent=repairAgentReady?"Ready": "Setup";
    if($("agent-summary"))$("agent-summary").textContent=(jobs.data||[]).length+" recorded repair jobs";
    if($("repair-finding")){
      const selected=$("repair-finding").value;
      const findings=await api("/api/admin/findings");
      const select=$("repair-finding");select.replaceChildren();
      const general=document.createElement("option");general.value="";general.textContent="General investigation";select.append(general);
      for(const finding of findings.data||[]){const option=document.createElement("option");option.value=finding.id;option.textContent="["+finding.severity+"] "+finding.title;select.append(option);}
      select.value=selected;
    }
    const target=$("repair-jobs");
    if(target){
      target.replaceChildren();
      if(!jobs.data?.length){const empty=document.createElement("div");empty.className="empty-state";empty.textContent="No agent jobs yet. Submit an investigation to start the workflow.";target.append(empty);}
      else for(const job of jobs.data){
        const article=document.createElement("article");article.className="job";
        const head=document.createElement("div");head.className="job-head";
        const title=document.createElement("strong");title.textContent="Repair "+job.id.slice(0,8);
        const status=badge(job.status);head.append(title,status);
        const request=document.createElement("p");request.textContent=job.request_text;
        const meta=document.createElement("p");meta.textContent="Requested "+date(job.created_at)+" by "+job.requested_by;
        article.append(head,request,meta);
        if(job.branch_name){const link=document.createElement("a");link.href="https://github.com/solopreneursid/yorpHives-2.0/tree/"+job.branch_name.split("/").map(encodeURIComponent).join("/");link.target="_blank";link.rel="noopener noreferrer";link.textContent="Inspect agent branch ↗";article.append(link);}
        if(job.pull_request_url){const link=document.createElement("a");link.href=job.pull_request_url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Review draft pull request ↗";article.append(link);}
        if(job.result_summary){const summary=document.createElement("p");summary.textContent=job.result_summary;article.append(summary);}
        target.append(article);
      }
    }
  }catch(error){
    repairAgentReady=false;
    if($("repair-submit"))$("repair-submit").disabled=true;
    if($("agent-state"))$("agent-state").textContent="Agent service unavailable: "+error.message;
  }
}
async function loadUpdates() {
  await getAssets(true);
  const c=state.assetCounts;
  setText("deprecated-count", number(c.deprecated_dependencies));
  setText("updates-count-panel", number(c.updates_available));
  setText("dependency-count", number(state.dependencies.length));
  renderDependencies();
}
async function loadActivity() {
  const [audit,runs,changes]=await Promise.all([api("/api/admin/audit"),getOverview(),api("/api/admin/changes")]);
  renderAudit($("audit-list"),audit.data || []);
  renderRuns($("activity-runs"),runs.recent_runs || []);
  renderChanges($("activity-changes"),changes.data || []);
}
async function refreshCurrent() {
  state.loaded.delete(state.view);
  state.overviewData=null;
  state.assets=[];
  await loadView(state.view);
  if(state.view!=="overview"){state.loaded.delete("overview");}
  setText("run-state", "Refreshed " + new Date().toLocaleTimeString());
}
document.querySelectorAll("[data-view]").forEach(button=>button.addEventListener("click",()=>showView(button.dataset.view)));
document.querySelectorAll("[data-go]").forEach(button=>button.addEventListener("click",()=>showView(button.dataset.go)));
$("mobile-menu").addEventListener("click",()=>{$("sidebar").classList.toggle("open");$("mobile-scrim").classList.toggle("show");$("mobile-menu").setAttribute("aria-expanded",$("sidebar").classList.contains("open")?"true":"false");});
$("mobile-scrim").addEventListener("click",()=>{$("sidebar").classList.remove("open");$("mobile-scrim").classList.remove("show");$("mobile-menu").setAttribute("aria-expanded","false");});
$("system-message-dismiss").addEventListener("click", () => {
  const panel = $("system-message");
  if (panel) panel.hidden = true;
});
$("logout").addEventListener("click",event=>{if(!confirm("Sign out of Cloudflare Access? This ends your Access session across all protected apps in this browser."))event.preventDefault();});
$("refresh").addEventListener("click",refreshCurrent);
$("run").addEventListener("click",async()=>{
  if(!confirm("Run read-only HTTPS checks against configured YorpHives production and preview URLs?"))return;
  const button=$("run");button.disabled=true;button.textContent="Checking…";
  try{const result=await api("/api/admin/run-checks",{method:"POST",body:JSON.stringify({confirm:true})});setText("run-state", result.run.failed_count+" failed · "+result.run.passed_count+" passed");state.loaded.clear();state.overviewData=null;await loadOverview();}
  catch(error){showSystemMessage(error.message, { kind: "error", reauthenticate: /Cloudflare Access/i.test(error.message) });}finally{button.disabled=false;button.textContent="Run health checks";}
});
$("snapshot").addEventListener("click",async()=>{
  if(!confirm("Capture read-only SHA-256 snapshots of the approved public production pages?"))return;
  const button=$("snapshot");button.disabled=true;button.textContent="Checking…";
  try{const result=await api("/api/admin/run-snapshots",{method:"POST",body:JSON.stringify({confirm:true})});setText("run-state", result.changed+" changed · "+result.targets+" checked");state.loaded.delete("monitoring");await loadMonitoring();}
  catch(error){showSystemMessage(error.message, { kind: "error", reauthenticate: /Cloudflare Access/i.test(error.message) });}finally{button.disabled=false;button.textContent="Check production changes";}
});
async function runAssetScan(button){
  if(!confirm("Run the next bounded, read-only inventory and dependency scan? This discovers current website pages, Free Tools and catalogue products."))return;
  button.disabled=true;const label=button.textContent;button.textContent="Scanning…";
  try{
    const result=await api("/api/admin/run-assets",{method:"POST",body:JSON.stringify({confirm:true})});
    setText("run-state", result.assets+" assets checked · "+result.unavailable+" unavailable");
    state.assets=[];state.loaded.delete("overview");state.loaded.delete("monitoring");state.loaded.delete("updates");state.loaded.delete("issues");state.overviewData=null;
    if(state.view==="overview")await loadOverview();else await loadView(state.view);
  }catch(error){showSystemMessage(error.message, { kind: "error", reauthenticate: /Cloudflare Access/i.test(error.message) });}finally{button.disabled=false;button.textContent=label;}
}
$("assets-run").addEventListener("click",event=>runAssetScan(event.currentTarget));
$("updates-scan").addEventListener("click",event=>runAssetScan(event.currentTarget));
$("analytics-7d").addEventListener("click",()=>{state.range="7d";$("analytics-7d").classList.add("active");$("analytics-30d").classList.remove("active");loadAnalytics();});
$("analytics-30d").addEventListener("click",()=>{state.range="30d";$("analytics-30d").classList.add("active");$("analytics-7d").classList.remove("active");loadAnalytics();});
$("analytics-export").addEventListener("click",exportAnalytics);
$("repair-form").addEventListener("submit",async event=>{
  event.preventDefault();
  const button=$("repair-submit");const requestText=$("repair-request").value.trim();
  if(!requestText)return;
  if(!repairAgentReady){setText("repair-message", "Configure the private Worker GITHUB_TOKEN secret before starting an agent job.");return;}
  button.disabled=true;button.textContent="Submitting…";setText("repair-message", "");
  try{
    const result=await api("/api/admin/repair-jobs",{method:"POST",body:JSON.stringify({finding_id:$("repair-finding").value||null,request_text:"[Scope: "+$("repair-scope").value+"] "+requestText})});
    setText("repair-message", result.dispatched?"Investigation dispatched. Proposed changes must return through a draft pull request.":result.message||"Request saved.");
    $("repair-request").value="";state.loaded.delete("agents");await loadAgents();
  }catch(error){setText("repair-message", "Could not submit request: " + error.message);}
  finally{button.disabled=!repairAgentReady;button.textContent="Request investigation ↗";}
});
document.querySelectorAll("[data-asset-filter]").forEach(button=>button.addEventListener("click",()=>{
  state.assetFilter=button.dataset.assetFilter;document.querySelectorAll("[data-asset-filter]").forEach(item=>item.classList.toggle("active",item===button));renderAssets();
}));
$("asset-search").addEventListener("input",event=>{state.assetQuery=event.target.value;renderAssets();});
$("dependency-search").addEventListener("input",event=>{state.dependencyQuery=event.target.value;renderDependencies();});
document.querySelectorAll("[data-finding-filter]").forEach(button=>button.addEventListener("click",()=>{
  state.findingFilter=button.dataset.findingFilter;document.querySelectorAll("[data-finding-filter]").forEach(item=>item.classList.toggle("active",item===button));state.loaded.delete("issues");loadIssues();
}));
$("refresh-agents").addEventListener("click",()=>loadAgents());
$("refresh-agent-registry").addEventListener("click",()=>loadAgents());
const permissionProbeButton=$("verify-github-permissions");
if(permissionProbeButton)permissionProbeButton.addEventListener("click",async()=>{
  if(!confirm("Run the GitHub permission test now? It creates a temporary branch and marker commit, opens a draft PR, then closes the PR and deletes the branch. Nothing is merged."))return;
  const status=$("github-permission-status");
  permissionProbeButton.disabled=true;
  if(status){status.textContent="Running temporary GitHub permission probe…";status.classList.remove("is-error","is-success");}
  const runProbe=async(emergencyOverride)=>api("/api/admin/repair-jobs",{method:"POST",body:JSON.stringify({permission_probe:true,confirm:true,emergency_override:emergencyOverride})});
  try{
    let result;
    try{
      result=await runProbe(false);
    }catch(error){
      if(!String(error.message||error).includes("Another GitHub permission probe is still running"))throw error;
      if(!confirm("The probe lock appears stale (more than ten minutes old). Emergency override will reclaim that stale lock and start a new probe. Continue?"))throw error;
      result=await runProbe(true);
    }
    const probe=result.probe||{};
    const cleanup=probe.cleanup||{};
    const contents=probe.contents_write===true?"verified":"not verified";
    const pullRequests=probe.pull_requests_write===true?"verified":"not verified";
    const clean=cleanup.pull_request_closed===true&&cleanup.branch_deleted===true;
    if(status){
      status.textContent="Contents:write "+contents+" · Pull requests:write "+pullRequests+" · Cleanup "+(clean?"complete":"requires attention")+(probe.error?" · "+probe.error:"")+(probe.cleanup_errors?.length?" · "+probe.cleanup_errors.join("; "):"")+(probe.remaining_branch?" · Remaining branch: "+probe.remaining_branch:"")+(probe.remaining_pull_request?" · Remaining PR: #"+probe.remaining_pull_request:"");
      status.classList.toggle("is-success",probe.ready===true);
      status.classList.toggle("is-error",probe.ready!==true);
    }
    await loadAgents();
  }catch(error){
    if(status){status.textContent="Permission probe failed: "+error.message;status.classList.add("is-error");}
  }finally{
    permissionProbeButton.disabled=false;
  }
});
setInterval(()=>{
  if(document.visibilityState==="visible"){
    if(state.view==="agents")loadAgents();
    if(state.view==="overview"){state.overviewData=null;state.loaded.delete("overview");loadOverview();}
  }
},60000);
window.addEventListener("DOMContentLoaded", () => {
  const requested = location.hash.slice(1);
  showView(document.getElementById("view-" + requested) ? requested : "headquarters");
  api("/api/admin/overview").then(data => { setText("identity", data.identity); setText("sidebar-identity", data.identity); }).catch(() => {});
});
