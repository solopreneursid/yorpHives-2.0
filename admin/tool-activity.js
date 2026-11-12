(() => {
"use strict";
const byId=id=>document.getElementById(id);
const node=(tag,cls="",label)=>{const n=document.createElement(tag);
 if(cls)n.className=cls;if(label!==undefined)n.textContent=String(label);return n;};
const count=n=>Number(n||0).toLocaleString();
let pending=false;
window.HQToolActivity={
 async load(){
  if(pending)return;pending=true;
  try{
   const data=await api("/api/admin/tool-activity");
   byId("activity-browser-count").textContent=data.data_collected?
    count(data.totals.browser_client_reported):"—";
   byId("activity-agent-count").textContent=data.data_collected?
    count(data.totals.access_authenticated_agent_execution):"—";
   byId("activity-covered-count").textContent=data.registered_browser_tools+
    " browser · "+data.registered_agent_tools+" private API";
   byId("activity-status").textContent=data.data_collected?
    "Recorded success events over "+data.from_day+" to "+data.to_day+
    " · browser reports are unverified · agent calls require scoped Access":
    "No successful tool actions have been recorded yet in this environment. Missing evidence is not zero demand.";
   const list=byId("activity-list");list.replaceChildren();
   if(!data.activity.length)list.append(node("p","hq-activity-empty",
     "No tool-action observations yet. Instrumented tools report only after a successful local operation."));
   for(const item of data.activity.slice(0,30)){
    const entry=node("div","hq-activity-row");
    const title=node("div","hq-activity-label");
    title.append(node("strong","",item.slug),node("small","",
      item.channel==="browser_client_reported"?"Browser self-report":"Server-executed, signed service"));
    entry.append(title,node("span","hq-activity-number",count(item.success_count)+" recorded"));
    list.append(entry);
   }
  }catch(error){
   byId("activity-status").textContent="Tool activity evidence unavailable. No counts inferred. "+error.message;
  }finally{pending=false;}
 }
};
})();
