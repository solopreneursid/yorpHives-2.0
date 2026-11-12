(() => {
"use strict";
const el=id=>document.getElementById(id);
const mk=(tag,cls="",text)=>{
 const node=document.createElement(tag);
 node.className=cls;
 if(text!==undefined)node.textContent=String(text);
 return node;
};
const safe=url=>{
 try{const parsed=new URL(url);return parsed.protocol==="https:"?parsed.href:null;}catch{return null;}
};
const fmt=value=>Number(value).toLocaleString();
let busy=false;
window.HQMarketSources={
 async load(){
  if(busy)return;
  busy=true;
  try{
   const data=await api("/api/admin/market-sources");
   el("market-plugins-count").textContent=fmt(data.provider_counts.wordpress_plugins||0);
   el("market-questions-count").textContent=fmt(data.provider_counts.stackexchange_questions||0);
   el("market-last-run").textContent=data.latest_run?
    new Date(data.latest_run.recorded_at).toLocaleDateString():"None";
   const warnings=data.latest_run?.warnings||[];
   el("market-feed-status").textContent=data.latest_run?
    "Last scan: "+data.latest_run.observed_count+" source records · "+data.latest_run.inserted_count+
    " first-seen records · "+warnings.length+" provider warning(s). Public sources are interest proxies only.":
    "No public market scan has finished. The scheduled private research Worker will collect bounded public-source samples.";
   const list=el("market-feed-list");list.replaceChildren();
   if(!data.sources.length){
    list.append(mk("p","hq-market-empty",
     "No source records yet. Existing software and real questions will appear here after a successful research run."));
   }
   for(const source of data.sources.slice(0,28)){
    const card=mk("article","hq-market-card");
    const header=mk("div","hq-market-card-meta");
    header.append(
      mk("span",source.evidence_kind==="existing_product"?"hq-market-app":"hq-market-question",
       source.evidence_kind==="existing_product"?"EXISTING SOFTWARE":"PUBLIC USER QUESTION"),
      mk("span","",source.provider==="wordpress_plugins"?"WordPress.org":"Stack Exchange")
    );
    card.append(header);
    const link=safe(source.source_url)?mk("a","hq-market-card-link",source.title):
      mk("strong","",source.title);
    if(link.tagName==="A"){link.href=safe(source.source_url);link.target="_blank";link.rel="noopener noreferrer";}
    card.append(link);
    if(source.excerpt)card.append(mk("p","hq-market-card-desc",source.excerpt));
    const label=source.public_metric_label==="active_install_band"?
     "Published approximate installation band":"Public question score";
    card.append(mk("small","hq-market-card-score",label+" · "+fmt(source.public_metric_value)+
      " · not verified demand"));
    list.append(card);
   }
  }catch(error){
   el("market-feed-status").textContent="Market evidence API unavailable: "+error.message;
  }finally{busy=false;}
 }
};
})();
