(() => {
"use strict";
const $=id=>document.getElementById(id);
const div=(tag,cls="",value)=>{
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(value!==undefined)node.textContent=String(value);
 return node;
};
const pretty=n=>Number(n).toLocaleString();
let state=null,names=new Map(),loading=false;
function render(){
 if(!state)return;
 $("traffic-capture").disabled=!state.configured||state.recent.some(c=>c.capture_day===new Date().toISOString().slice(0,10));
 $("traffic-observed").textContent=state.latest?String(state.latest.tool_paths):"—";
 $("traffic-requests").textContent=state.latest?pretty(state.latest.grouped_requests):"—";
 $("traffic-captured").textContent=state.latest?state.latest.capture_day:"—";
 $("traffic-availability").textContent=!state.configured?
  "Cloudflare Analytics is not configured for this environment. No traffic metrics have been assumed.":
  state.latest?"Cloudflare Analytics connected · captured "+state.latest.observed_start.slice(0,10)+
   " to "+state.latest.observed_end.slice(0,10)+" · 7-day grouped request window · sampling applies":
  "Cloudflare Analytics connected · no traffic snapshot captured yet. Data is not inferred from repository files.";
 const board=$("traffic-rows");board.replaceChildren();
 if(!state.tools.length){
   board.append(div("p","hq-traffic-empty",state.latest?
    "No canonical Free Tools page routes appeared in this captured top-N dataset. This does not prove zero use.":
    "No measurements recorded. An authorized owner can capture a bounded first-party snapshot."));
   return;
 }
 for(const tool of state.tools.slice(0,40)){
  const row=div("div","hq-traffic-row");
  const meta=div("div","hq-traffic-tool");
  const safeSlug=/^[a-z0-9-]{1,72}$/.test(tool.slug);
  if(safeSlug){
    const link=div("a","",names.get(tool.slug)||tool.slug);
    link.href="/free-tools/"+tool.slug+"/";
    link.target="_blank";link.rel="noopener noreferrer";
    meta.append(link);
  }else meta.append(div("strong","",tool.slug));
  meta.append(div("small","",names.has(tool.slug)?
    "Found in Free Tools manifest":"Unmatched route — verify before assuming a product exists"));
  row.append(meta,div("strong","hq-traffic-count",pretty(tool.grouped_requests)+" grouped HTTP requests"));
  board.append(row);
 }
}
window.HQTrafficEvidence={
 async load(manifest){
  if(loading)return;
  loading=true;
  try{
   names=new Map((Array.isArray(manifest)?manifest:[])
    .filter(p=>typeof p.slug==="string"&&typeof p.title==="string")
    .map(p=>[p.slug,p.title]));
   state=await api("/api/admin/traffic-evidence");
   render();
  }finally{loading=false;}
 }
};
$("traffic-capture").addEventListener("click",async event=>{
 if(!confirm("Capture an aggregated 7-day Cloudflare request snapshot for Free Tools pages? This is limited to one capture per UTC day, excludes visitor identifiers, and does not measure conversions or unique users."))return;
 const button=event.currentTarget;
 button.disabled=true;button.textContent="Capturing read-only data…";
 try{
   const result=await api("/api/admin/traffic-evidence",{
    method:"POST",body:JSON.stringify({action:"capture"})
   });
   await window.HQTrafficEvidence.load([...names].map(([slug,title])=>({slug,title})));
   showSystemMessage(result.paths+" observed Free Tools routes stored as private aggregated HTTP evidence. No individual visitors were tracked.",{kind:"success"});
 }catch(error){
   showSystemMessage(error.message,{kind:"error",reauthenticate:/Cloudflare Access/.test(error.message)});
 }finally{
   button.textContent="Capture 7-day traffic";
   if(state)render();
 }
});
})();
