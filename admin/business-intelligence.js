(() => {
"use strict";
const $=id=>document.getElementById(id);
const el=(tag,cls="",label)=>{
 const n=document.createElement(tag);
 if(cls)n.className=cls;
 if(label!==undefined)n.textContent=String(label);
 return n;
};
const pretty=value=>String(value||"").replaceAll("_"," ").replace(/\b\w/g,x=>x.toUpperCase());
const usableURL=raw=>{try{const x=new URL(raw);return x.protocol==="https:"?x.href:null;}catch{return null;}};
let board=null,active=null,loading=false,submitting=false;
const kindLabels={
 existing_tool_route:"YORPHIVES TOOL ROUTE",
 private_agent_utility:"PRIVATE AGENT UTILITY",
 existing_public_product:"EXISTING SOFTWARE ONLINE",
 public_problem:"PUBLIC PROBLEM SIGNAL",
 source_backed_hypothesis:"RESEARCH HYPOTHESIS"
};
const stateLabels={
 observed:"OBSERVED",observed_unverified:"UNVERIFIED SIGNAL",
 pending_capture:"CAPTURE REQUIRED",awaiting_collection:"AWAITING COLLECTION",
 not_ingested:"NOT CONNECTED",disabled_or_unobserved:"NOT ENABLED"
};
function link(title,url,cls="bi-link"){
 const address=usableURL(url);
 if(!address)return el("span",cls,title);
 const a=el("a",cls,title);a.href=address;a.target="_blank";a.rel="noopener noreferrer";return a;
}
function renderCoverage(){
 const holder=$("bi-sources");holder.replaceChildren();
 for(const source of board.coverage){
  const card=el("article","bi-source-card");
  const top=el("div","bi-source-top");
  top.append(el("strong","",source.name),
   el("span","bi-source-state bi-state-"+source.state,stateLabels[source.state]||pretty(source.state)));
  card.append(top,el("p","",source.detail));
  if(source.record_count!==null)
   card.append(el("small","","Observed records: "+Number(source.record_count).toLocaleString()));
  holder.append(card);
 }
}
function evidenceItem(item){
 const wrapper=el("div","bi-evidence-item");
 wrapper.append(el("strong","",item.label));
 const value=item.value===null?"Not measured":Number(item.value).toLocaleString()+" "+pretty(item.unit);
 wrapper.append(el("span","",value),
  el("p","","Supports: "+item.reliable_for),
  el("p","bi-caution","Does NOT prove: "+item.not_evidence_of));
 if(item.source_url)wrapper.append(link("Original source ↗",item.source_url));
 return wrapper;
}
function renderCard(item){
 const wrap=el("article","bi-card");
 const head=el("div","bi-card-head");
 head.append(el("span","bi-card-kind",kindLabels[item.type]||pretty(item.type)),
  el("span","bi-card-rank","RESEARCH ORDER "+item.investigation_priority+"/85"));
 wrap.append(head);
 const status=el("span","bi-review-badge",pretty(item.review.status));
 wrap.append(el("h3","",item.title),status,
  el("p","bi-card-summary",item.summary));
 const actions=el("div","bi-next");
 actions.append(el("strong","","NEXT RECOMMENDED INVESTIGATION"),
  el("p","",item.suggested_next_action));
 wrap.append(actions);
 const detail=el("details","bi-card-details");
 detail.append(el("summary","","Inspect sources, evidence & missing measurements"));
 const body=el("div","bi-card-detail-body");
 const signals=el("div","bi-signal-stack");
 if(item.evidence.length===0)signals.append(el("p","","No observed evidence. Research is required."));
 else for(const evidence of item.evidence)signals.append(evidenceItem(evidence));
 body.append(signals);
 const missing=el("div","bi-missing");
 missing.append(el("h4","","EVIDENCE WE STILL NEED"));
 const ul=el("ul");
 for(const gap of item.missing_evidence)ul.append(el("li","",gap));
 missing.append(ul);
 body.append(missing);
 if(item.proposed_monetization){
  body.append(el("h4","bi-monetization","REVENUE IDEA · UNVERIFIED"),
   el("p","bi-card-summary",item.proposed_monetization));
 }
 const sources=el("div","bi-originals");
 sources.append(el("h4","","ORIGINAL RESEARCH LINKS"));
 if(!item.source_links.length)sources.append(el("p","bi-card-summary",
  "No original public source link is attached to this evidence type."));
 else for(const source of item.source_links)sources.append(link(source.title+" ↗",source.url));
 body.append(sources);
 if(item.review.note){
  body.append(el("h4","","OWNER RESEARCH NOTE"),el("p","bi-note",item.review.note));
 }
 detail.append(body);wrap.append(detail);
 const bottom=el("div","bi-card-foot");
 bottom.append(el("small","","Not validated · No production authority"));
 const edit=el("button","bi-btn bi-secondary","Review opportunity");
 edit.type="button";
 edit.addEventListener("click",()=>openReview(item));
 bottom.append(edit);wrap.append(bottom);
 return wrap;
}
function render(){
 if(!board)return;
 $("bi-stat-total").textContent=board.totals.all;
 $("bi-stat-tools").textContent=board.totals.tool_routes;
 $("bi-stat-public").textContent=board.totals.public_products;
 $("bi-stat-ideas").textContent=board.totals.hypotheses;
 renderCoverage();
 const type=$("bi-kind").value,status=$("bi-review").value;
 const shown=board.candidates.filter(c=>
  (type==="all"||type===c.type)&&(status==="all"||status===c.review.status));
 const holder=$("bi-list");holder.replaceChildren();
 for(const item of shown)holder.append(renderCard(item));
 if(!shown.length){
  const box=el("div","bi-empty");
  box.append(el("h3","","No source-backed candidates match this view."),
   el("p","","This is not evidence that a market does not exist. Connect missing sources or adjust filters."));
  holder.append(box);
 }
 $("bi-status").textContent=board.totals.all+" source-qualified candidates · "+shown.length+
  " displayed · "+board.coverage.filter(x=>x.state==="not_ingested").length+
  " major data integrations not ingested · no automatic builds or releases";
}
function openReview(item){
 active=item;
 $("bi-review-title").textContent="Review: "+item.title;
 $("bi-review-state").value=item.review.status==="unreviewed"?"watching":item.review.status;
 $("bi-review-note").value=item.review.note||"";
 $("bi-review-dialog").showModal();
}
async function saveReview(event){
 event.preventDefault();
 if(!active||submitting)return;
 const command={action:"review",candidate_id:active.candidate_id,
  expected_revision:active.review.revision,
  review_status:$("bi-review-state").value,
  owner_note:$("bi-review-note").value.trim()};
 submitting=true;
 $("bi-review-save").disabled=true;
 try{
  await api("/api/admin/business-intelligence",{
   method:"POST",body:JSON.stringify(command)
  });
  $("bi-review-dialog").close();
  await window.loadBusinessIntelligence();
 }catch(error){
  showSystemMessage(error.message,{kind:"error",
   reauthenticate:/Cloudflare Access/.test(error.message)});
 }finally{
  submitting=false;
  $("bi-review-save").disabled=false;
 }
}
window.loadBusinessIntelligence=async()=>{
 if(loading)return;
 loading=true;
 try{
  board=await api("/api/admin/business-intelligence");
  render();
 }catch(error){
  $("bi-status").textContent="Business intelligence unavailable: "+error.message;
  throw error;
 }finally{loading=false;}
};
$("bi-kind").addEventListener("change",render);
$("bi-review").addEventListener("change",render);
$("bi-review-cancel").addEventListener("click",()=>$("bi-review-dialog").close());
$("bi-review-form").addEventListener("submit",saveReview);
})();
