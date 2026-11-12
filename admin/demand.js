(() => {
"use strict";
const byId=id=>document.getElementById(id);
const make=(tag,cls="",text)=>{
 const element=document.createElement(tag);
 element.className=cls;
 if(text!==undefined)element.textContent=String(text);
 return element;
};
const caps=value=>String(value||"").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
const safeURL=text=>{try{const u=new URL(text);return u.protocol==="https:"?u.href:null;}catch{return null;}};
const distinctTokens=text=>new Set(String(text||"").toLowerCase().split(/[^a-z0-9]+/)
 .filter(x=>x.length>=4&&!["tool","tools","application","apps","service","services","platform","quality","available","generator",
 "utilities","utility","online","development","existing","source","sources","workflow","users","agent","agents",
 "ideas","system","personal","digital","business","using","based"].includes(x)));
let snapshot=null,manifest=[],loading=false,inventoryReady=false;
function overlap(item){
 const tokens=distinctTokens(item.title+" "+item.user_job);
 if(tokens.size===0||!inventoryReady)return [];
 const hits=[];
 for(const product of manifest){
   const words=distinctTokens(product.title+" "+product.slug);
   const intersection=[...tokens].filter(word=>words.has(word));
   if(intersection.length>=1)hits.push({product,intersection});
 }
 return hits.sort((a,b)=>b.intersection.length-a.intersection.length).slice(0,3);
}
function anchor(label,url,cls="demand-link"){
 const address=safeURL(url);
 if(!address)return make("span",cls,label);
 const item=make("a",cls,label);
 item.href=address;item.target="_blank";item.rel="noopener noreferrer";
 return item;
}
function actions(item){
 const row=make("div","demand-actions");
 const add=(label,action)=>{
   const button=make("button",action==="shortlist"?"intel-action-primary":"intel-action-secondary",label);
   button.type="button";
   button.addEventListener("click",async()=>{
     if(!confirm("Change investigation status to "+caps(action)+"? This does not validate demand, trigger AI, build code or release a product."))return;
     button.disabled=true;
     try{
       await api("/api/admin/demand",{method:"POST",body:JSON.stringify({
        action,category_key:item.category_key,expected_revision:item.revision
       })});
       await window.loadDemand();
     }catch(error){
       showSystemMessage(error.message,{kind:"error",reauthenticate:/Cloudflare Access/.test(error.message)});
     }finally{button.disabled=false;}
   });
   row.append(button);
 };
 if(item.research_status==="watching")add("Investigate","investigate");
 if(["watching","investigating"].includes(item.research_status))add("Shortlist","shortlist");
 if(["watching","investigating","shortlisted"].includes(item.research_status))add("Dismiss","dismiss");
 if(item.research_status==="dismissed")add("Reopen","reopen");
 return row;
}
function renderOpportunity(item){
 const card=make("article","demand-card");
 const header=make("div","demand-card-header");
 header.append(make("span",item.origin==="hypothesis"?"demand-origin-new":"demand-origin-reference",
  item.origin==="hypothesis"?"DISCOVERED HYPOTHESIS":"EXISTING CATEGORY"),
  make("span","demand-stage",caps(item.research_status)));
 card.append(header);
 card.append(make("h3","",item.title),make("p","demand-card-summary",item.summary));
 const fields=make("div","demand-meta");
 fields.append(make("span","","Format: "+caps(item.scale)),
  make("span","","Delivery risk: "+caps(item.implementation_risk)),
  make("span","",item.research_priority===null?"NO SIGNAL RANK YET":"Research priority "+item.research_priority+"/80 · NOT DEMAND"));
 card.append(fields);
 const expanded=make("details","demand-details");
 expanded.append(make("summary","","Evidence, potential uses & catalogue overlap"));
 const body=make("div","demand-detail-body");
 const section=(heading,text)=>{
  const x=make("div","demand-field");x.append(make("strong","",heading),make("p","",text));body.append(x);
 };
 section("HUMAN USE CASE — HYPOTHESIS",item.user_job);
 section("POSSIBLE AGENT USE — UNVERIFIED",item.agent_job);
 section("POSSIBLE BUSINESS MODEL — UNVERIFIED",item.monetization_model);
 const evidence=make("div","demand-field");
 evidence.append(make("strong","","PUBLIC INTEREST SIGNALS · NOT VERIFIED USER DEMAND"));
 if(item.sources.length===0)evidence.append(make("p","","No matching public records yet. Existence of this category is not evidence of popularity."));
 for(const source of item.sources){
  const line=make("div","demand-source");
  line.append(make("small","",caps(source.evidence_kind)),
   anchor(source.title,source.source_url));
  evidence.append(line);
 }
 body.append(evidence);
 const duplicates=make("div","demand-field");
 duplicates.append(make("strong","","POSSIBLE EXISTING YORPHIVES OVERLAP · KEYWORDS ONLY"));
 const matches=overlap(item);
 if(!inventoryReady)duplicates.append(make("p","","Product manifest unavailable; overlap not checked."));
 else if(!matches.length)duplicates.append(make("p","","No keyword overlap detected. This does not confirm a new product or its demand."));
 else for(const match of matches){
  const line=make("div","demand-source");
  const url=new URL(match.product.url,location.origin);
  line.append(anchor(match.product.title,url.href),make("small","","Shared terms: "+match.intersection.join(", ")));
  duplicates.append(line);
 }
 body.append(duplicates);
 expanded.append(body);card.append(expanded,actions(item));
 return card;
}
function render(){
 if(!snapshot)return;
 const opportunities=snapshot.opportunities;
 const origin=byId("demand-origin").value,status=byId("demand-status").value;
 const filtered=opportunities.filter(x=>{
  if(status!=="all"&&x.research_status!==status)return false;
  if(origin==="sourced")return x.source_count>0;
  return origin==="all"||x.origin===origin;
 });
 const board=byId("demand-cards");board.replaceChildren();
 if(!filtered.length){
  const empty=make("div","demand-empty");
  empty.append(make("h3","","No opportunities match this view"),
   make("p","","Stored-source indexing can populate reference examples and source-backed discoveries. Empty results are not replaced with invented metrics."));
  board.append(empty);
 }else for(const row of filtered)board.append(renderOpportunity(row));
 const unknown=byId("demand-unknown-list");unknown.replaceChildren();
 if(!snapshot.unclassified_sources.length)unknown.append(make("p","demand-no-unknown",
  "No unmatched source signals in this batch. This does not mean all technologies have been covered."));
 for(const source of snapshot.unclassified_sources.slice(0,18)){
  const box=make("div","demand-unknown");
  box.append(anchor(source.title,source.source_url),make("small","",caps(source.provider)+" · NOT CLASSIFIED"));
  unknown.append(box);
 }
 byId("demand-reference-count").textContent=String(opportunities.filter(x=>x.origin==="reference").length);
 byId("demand-dynamic-count").textContent=String(opportunities.filter(x=>x.origin==="hypothesis").length);
 byId("demand-unclassified-count").textContent=String(snapshot.unclassified_total);
 byId("demand-inventory-count").textContent=inventoryReady?String(manifest.length):"—";
 byId("demand-inventory-note").textContent=inventoryReady?
  manifest.length+" tool entries found in the local Free Tools manifest. Matching is a preliminary overlap hint, not proof of deployed functionality.":
  "The Free Tools manifest could not be read; no catalogue overlap claims have been made.";
 byId("demand-refresh-note").textContent=snapshot.latest_refresh?
  "Last index: "+new Date(snapshot.latest_refresh.completed_at).toLocaleString()+
  " · "+snapshot.latest_refresh.source_count+" stored public sources inspected · zero new AI calls":
  "No source indexing has completed. Click Index stored research to analyze saved observations.";
 byId("demand-status-line").textContent=opportunities.length+" opportunities stored · "+filtered.length+
  " shown · no fixed industry or technology ceiling · public evidence not independently verified";
}
window.loadDemand=async()=>{
 if(loading)return;
 loading=true;
 try{
  const [data,inventory]=await Promise.all([
   api("/api/admin/demand"),
   fetch("/free-tools/manifest.json",{headers:{accept:"application/json"},cache:"no-store"})
    .then(async r=>r.ok?await r.json():null).catch(()=>null)
  ]);
  snapshot=data;
  manifest=Array.isArray(inventory)?inventory.filter(x=>typeof x?.title==="string"&&
   typeof x?.slug==="string"&&typeof x?.url==="string"): [];
  inventoryReady=Array.isArray(inventory);
  render();
  await Promise.allSettled([
   window.HQTrafficEvidence?.load(manifest),
   window.HQMarketSources?.load(),
   window.HQNextActions?.load()
  ].filter(Boolean));
 }finally{loading=false;}
};
byId("demand-origin").addEventListener("change",render);
byId("demand-status").addEventListener("change",render);
byId("demand-refresh").addEventListener("click",async event=>{
 const button=event.currentTarget;
 button.disabled=true;button.textContent="Indexing stored sources…";
 try{
  const result=await api("/api/admin/demand",{method:"POST",body:JSON.stringify({action:"refresh"})});
  await window.loadDemand();
  byId("demand-status-line").textContent="Indexed "+result.source_count+" stored source records · "+
    result.added_links+" new evidence links · "+result.generated_candidates+" additional hypotheses indexed · no AI or external search";
 }catch(error){
  showSystemMessage(error.message,{kind:"error",reauthenticate:/Cloudflare Access/.test(error.message)});
 }finally{button.disabled=false;button.textContent="↻ Index stored research";}
});
})();
