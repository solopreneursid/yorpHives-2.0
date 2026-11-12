(() => {
"use strict";
const byId=id=>document.getElementById(id);
const create=(tag,cls="",content)=>{
 const e=document.createElement(tag);e.className=cls;
 if(content!==undefined)e.textContent=String(content);
 return e;
};
const fmt=v=>String(v||"").replaceAll("_"," ").replace(/\b\w/g,s=>s.toUpperCase());
const safe=url=>{try{const x=new URL(url);return x.protocol==="https:"?x.href:null;}catch{return null;}};
let running=false;
window.HQNextActions={
 async load(){
  if(running)return;
  running=true;
  try{
   const data=await api("/api/admin/next-actions");
   const area=byId("hq-next-actions");area.replaceChildren();
   const counts=data.coverage;
   byId("hq-next-actions-status").textContent=
    data.recommendations.length+" evidence-qualified investigative actions · "+
    "first-party capture "+(counts.traffic_capture_exists?"available":"missing")+
    " · "+counts.public_market_source_count+" public source records examined · "+
    "zero independent approval to build";
   if(!data.recommendations.length){
    area.append(create("p","hq-decision-empty",
      "Nothing is confidently actionable yet. Collect more trustworthy evidence instead of generating unsupported product suggestions."));
   }
   for(const rec of data.recommendations.slice(0,12)){
    const card=create("article","hq-decision-card");
    const top=create("div","hq-decision-card-top");
    top.append(create("span","hq-decision-type",fmt(rec.evidence_type)),
      create("span","hq-decision-priority","TRIAGE "+rec.priority));
    card.append(top,create("h3","",rec.title),
      create("p","hq-decision-why",rec.why));
    const action=create("div","hq-decision-next");
    action.append(create("strong","","RECOMMENDED NEXT ACTION"),
      create("p","",rec.next_step));
    card.append(action);
    const footer=create("div","hq-decision-footer");
    footer.append(create("small","","Evidence: "+(rec.evidence_value===null?
       "not yet measured":Number(rec.evidence_value).toLocaleString()+" "+fmt(rec.evidence_unit))));
    if(rec.source_url&&safe(rec.source_url)){
      const link=create("a","","Inspect source ↗");
      link.href=safe(rec.source_url);link.target="_blank";link.rel="noopener noreferrer";
      footer.append(link);
    }
    card.append(footer);
    area.append(card);
   }
  }catch(error){
   byId("hq-next-actions-status").textContent="Decision queue unavailable: "+error.message;
  }finally{running=false;}
 }
};
})();
