(() => {
  "use strict";
  const allowedStatuses = new Set(["queued","running","awaiting_owner_approval","completed","failed"]);
  const statuses = {recorded_review_ready:"Recorded review gate",recorded_review_acknowledged:"Planning brief acknowledged",recorded_staging_rehearsal:"Staging rehearsal recorded · 5/5",recorded_failure:"Recorded failure",
    incomplete_record:"Missing evidence",unavailable:"Unavailable"};
  const element = (tag, cls, text) => {
    const n=document.createElement(tag);
    if(cls)n.className=cls;
    if(text!==undefined)n.textContent=String(text);
    return n;
  };
  function renderProof(data) {
    const p=data.proof;
    const container=element("section","hq-proof-content");
    const header=element("div","hq-proof-heading");
    header.append(element("strong","",statuses[p.evidence_status]||"Incomplete evidence"),
      element("span","hq-proof-badge",
        p.is_staging_rehearsal && p.staging_rehearsal_completed ? "SYNTHETIC TEST · NOT OWNER APPROVAL" :
        p.records_sufficient_for_owner_review ? "RECORDS FOUND · NOT QA" : "NOT READY"));
    container.append(header);
    if(p.failure)container.append(element("p","hq-proof-failure",
      "Recorded error ("+p.failure.code+"): "+p.failure.message));
    if(p.provider_usage && p.provider_usage.billing_verified===false) {
      container.append(element("p","hq-proof-usage",
        "Model-reported tokens · Input: "+p.provider_usage.input_tokens+
        " · Output: "+p.provider_usage.output_tokens+
        " · Total: "+p.provider_usage.total_tokens+
        " · Billing not independently verified"));
    }
    for(const check of Array.isArray(p.checks)?p.checks:[]) {
      const row=element("div","hq-proof-check");
      row.append(element("span","hq-proof-icon",check.result==="recorded"?"✓":"!"));
      const body=element("div");
      body.append(element("strong","",check.label),element("small","",check.detail));
      row.append(body);container.append(row);
    }
    if(Array.isArray(p.verification_checklist)&&p.verification_checklist.length){
      const more=element("div","hq-proof-verify");
      more.append(element("strong","","AI-SUGGESTED VERIFICATION · NOT YET PERFORMED"));
      const list=element("ul");
      for(const item of p.verification_checklist.slice(0,8))
        list.append(element("li","",item));
      more.append(list);container.append(more);
    }
    const next=element("p","hq-proof-next","YOUR NEXT ACTION · "+p.suggested_admin_action);
    const disclaimer=element("p","hq-proof-disclaimer",
      "Recorded database events are not independent QA, verified billing, proof of current deployment, or production authorization. Reading this evidence makes zero AI calls.");
    container.append(next,disclaimer);
    return container;
  }
  function attach(mission,card) {
    if(!mission || !allowedStatuses.has(mission.status) ||
        typeof mission.job_id!=="string" || !card)return;
    const details=element("details","hq-proof");
    details.append(element("summary","hq-proof-toggle","Check mission evidence · read-only"));
    const body=element("div","hq-proof-body");
    body.append(element("p","hq-proof-loading","Open to inspect recorded mission events."));
    details.append(body);card.append(details);
    let loaded=false,loading=false;
    details.addEventListener("toggle",async()=>{
      if(!details.open||loaded||loading)return;
      loading=true;body.replaceChildren(element("p","hq-proof-loading","Checking private evidence…"));
      try{
        const data=await api("/api/admin/mission-proof?job_id="+encodeURIComponent(mission.job_id));
        if(data?.system!=="headquarters_mission_proof"||
           data?.independent_qa_passed!==false||
           data?.production_release_permitted!==false||
           data?.new_inference_calls!==0||!data.proof||
           data.proof.release_authorized!==false||
           data.proof.job_id!==mission.job_id)throw new Error("Evidence safety contract could not be verified.");
        body.replaceChildren(renderProof(data));loaded=true;
      }catch{
        body.replaceChildren(element("p","hq-proof-failure",
          "Evidence is unavailable. Do not interpret missing records as a successful mission or approval."));
      }finally{loading=false;}
    });
  }
  window.HQMissionProof={attach};
})();
