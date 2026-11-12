(() => {
  "use strict";
  const element = id => document.getElementById(id);
  const make = (tag, classname = "", value) => {
    const node = document.createElement(tag);
    node.className = classname;
    if (value !== undefined) node.textContent = String(value);
    return node;
  };
  const activeSource = status => ["open","investigating","awaiting_approval"].includes(status);
  const pretty = value => String(value || "").replaceAll("_"," ").replace(/\b\w/g,x=>x.toUpperCase());
  const date = value => {
    const d = new Date(value || "");
    return Number.isNaN(d.getTime()) ? "Unknown" : d.toLocaleString();
  };
  let snapshot = null;
  let loading = false;
  function safeLink(value) {
    try {
      const target = new URL(value);
      return target.protocol === "https:" ? target.href : null;
    } catch { return null; }
  }
  function setText(id,value) { element(id).textContent = String(value); }
  async function mutation(payload, button) {
    const oldLabel = button.textContent;
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      const result = await api("/api/admin/radar", { method:"POST",body:JSON.stringify(payload) });
      if (payload.action === "create_mission") {
        showSystemMessage("A planned mission was created from this monitoring evidence. AI has NOT been started.",{kind:"success"});
        await window.loadRadar();
        showView("headquarters");
        await window.loadHeadquarters();
      } else {
        await window.loadRadar();
      }
      return result;
    } catch (error) {
      showSystemMessage(error.message,{kind:"error",reauthenticate:/Cloudflare Access/.test(error.message)});
    } finally {
      button.disabled = false;
      button.textContent = oldLabel;
    }
  }
  function makeAction(label,signal,action,kind = "muted") {
    const button = make("button",kind === "primary" ? "radar-small-primary" : "radar-small-muted",label);
    button.type = "button";
    button.addEventListener("click",() => {
      const prompt = action === "create_mission"
        ? "Create a PLANNED owner mission from this monitoring record? No AI execution, deployment or spending will be started."
        : action === "dismiss"
          ? "Dismiss this signal from the active triage board? Its source record and audit trail remain available."
          : action === "reopen"
            ? "Return this signal to the new triage queue?"
            : "Mark this signal as under investigation?";
      if (confirm(prompt)) mutation({action,signal_id:signal.signal_id,expected_updated_at:signal.updated_at},button);
    });
    return button;
  }
  function renderSignal(signal) {
    const card = make("article","radar-card");
    const top = make("div","radar-card-top");
    const badges = make("div","radar-card-badges");
    badges.append(
      make("span","radar-severity radar-severity-"+signal.severity,signal.severity.toUpperCase()),
      make("span","radar-tag",pretty(signal.category)),
      make("span","radar-tag",signal.source_kind === "asset_finding" ? "ASSET AUDIT" : "MONITORING")
    );
    if (!activeSource(signal.source_status)) badges.append(make("span","radar-resolved","SOURCE RESOLVED"));
    top.append(badges,make("span","radar-triage radar-triage-"+signal.triage_status,pretty(signal.triage_status)));
    card.append(top,make("h3","",signal.title),make("p","radar-detail",signal.details));
    const meta = make("div","radar-meta");
    meta.append(make("span","", "Observed " + date(signal.last_observed)));
    meta.append(make("span","", "Suggested team: " + pretty(signal.suggested_agent_id)));
    const last = Date.parse(signal.last_observed);
    if (!Number.isFinite(last) || Date.now() - last > 48 * 60 * 60 * 1000) {
      meta.append(make("span","radar-stale","STALE OBSERVATION · VERIFY AGAIN"));
    }
    card.append(meta);
    const evidence = make("div","radar-evidence");
    evidence.append(make("strong","", "Original evidence"), make("p","",signal.recommendation));
    const source = safeLink(signal.source_url);
    if (source) {
      const link = make("a","radar-source-link","Open monitored resource ↗");
      link.href = source;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      evidence.append(link);
    }
    evidence.append(make("small","","Record: "+signal.source_kind+" / "+signal.source_id+" · Status: "+signal.source_status));
    card.append(evidence);
    const actions = make("div","radar-card-actions");
    if (signal.triage_status === "new") {
      actions.append(makeAction("Investigate",signal,"investigate"));
    }
    if (["new","investigating"].includes(signal.triage_status)) {
      if (activeSource(signal.source_status)) actions.append(makeAction("Create planned mission ↗",signal,"create_mission","primary"));
      actions.append(makeAction("Dismiss",signal,"dismiss"));
    } else if (signal.triage_status === "dismissed") {
      actions.append(makeAction("Reopen",signal,"reopen"));
    } else if (signal.triage_status === "promoted" && signal.linked_job_id) {
      actions.append(make("span","radar-mission-id","Planned mission: "+signal.linked_job_id.slice(0,8)));
      const jump = make("button","radar-small-muted","Open Mission Control ↗");
      jump.type = "button";
      jump.addEventListener("click",()=>showView("headquarters"));
      actions.append(jump);
    }
    card.append(actions);
    return card;
  }
  function render() {
    if (!snapshot) return;
    const filter = element("radar-filter").value;
    const category = element("radar-category").value;
    const selected = snapshot.signals.filter(signal => {
      if (category !== "all" && signal.category !== category) return false;
      if (filter === "all") return true;
      if (filter === "active") return ["new","investigating"].includes(signal.triage_status) && activeSource(signal.source_status);
      return signal.triage_status === filter;
    });
    const list = element("radar-list");
    list.replaceChildren();
    if (!selected.length) {
      const box = make("div","radar-empty");
      box.append(make("span","radar-empty-icon","◎"),
        make("h3","",snapshot.latest_run ? "No matching observations" : "No radar ingestion recorded"),
        make("p","",snapshot.latest_run
          ? "There are no matching first-party findings in this view. Switch filters or inspect the monitoring page."
          : "Sync recorded monitoring findings to populate this evidence board. Empty results are not replaced with invented opportunities."));
      list.append(box);
    } else for (const item of selected) list.append(renderSignal(item));
    setText("radar-active",snapshot.counts.active);
    setText("radar-new",snapshot.counts.needs_review);
    setText("radar-promoted",snapshot.counts.promoted);
    setText("radar-resolved",snapshot.counts.resolved_source);
    setText("radar-last-sync",snapshot.latest_run ? "Last ingestion: "+date(snapshot.latest_run.recorded_at)+" · "+snapshot.latest_run.trigger_source : "No ingestion has run yet.");
    setText("radar-status",snapshot.signals.length+" stored first-party signals · showing "+selected.length+" · no AI inference performed");
  }
  window.loadRadar = async () => {
    if (loading) return;
    loading = true;
    try {
      snapshot = await api("/api/admin/radar");
      render();
    } finally {
      loading = false;
    }
  };
  element("radar-sync").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Synchronizing…";
    try {
      const result = await api("/api/admin/radar",{method:"POST",body:JSON.stringify({action:"sync"})});
      await window.loadRadar();
      setText("radar-status",result.observed_count+" observed monitoring findings · "+result.inserted_count+" new signals · no AI credits used");
    } catch (error) {
      setText("radar-status","Sync failed: "+error.message);
    } finally {
      button.disabled = false;
      button.textContent = "↻ Sync monitoring records";
    }
  });
  element("radar-filter").addEventListener("change",render);
  element("radar-category").addEventListener("change",render);
})();
