(() => {
 "use strict";
 const $=id=>document.getElementById(id);
 const node=(tag,cls="",text)=>{
   const element=document.createElement(tag);
   if(cls)element.className=cls;
   if(text!==undefined)element.textContent=String(text);
   return element;
 };
 const date=t=>{
   const v=new Date(t||"");
   return Number.isNaN(v.getTime())?"Unknown":v.toLocaleString();
 };
 const https=url=>{
   try{const v=new URL(url);return v.protocol==="https:"?v.href:null;}catch{return null;}
 };
 const types={tool:"Utility / Tool",app:"Application",platform:"Platform",plugin:"Plugin",service:"Agent-accessible service",direction:"Business direction"};
 let state=null,loading=false;
 const label=(id,value)=>{$(id).textContent=String(value);};
 const fail=error=>{
   const message=error instanceof Error?error.message:"Request failed";
   showSystemMessage(message,{kind:"error",reauthenticate:/Cloudflare Access/.test(message)});
 };
 function pairs(heading,value){
   const row=node("div","intel-field");
   row.append(node("h4","",heading),node("p","",value||"Not specified by model"));
   return row;
 }
 function sourceBadge(source){
   const row=node("div","intel-evidence-item");
   const icon=node("span","intel-source-icon",source.provider==="github_repo"?"GH":source.provider==="hn_ask"?"ASK":"SHOW");
   const desc=node("div","intel-source-desc");
   const url=https(source.source_url);
   const link=url?node("a","",source.title):node("span","",source.title);
   if(url){link.href=url;link.target="_blank";link.rel="noopener noreferrer";}
   desc.append(link,node("small","",source.provider.replaceAll("_"," ").toUpperCase()+" · "+date(source.published_at)));
   row.append(icon,desc);
   return row;
 }
 async function mutate(idea,action,button){
   const text=button.textContent;
   button.disabled=true;button.textContent="Saving…";
   try{
     const response=await api("/api/admin/intelligence",{method:"POST",
       body:JSON.stringify({action,idea_id:idea.idea_id,expected_revision:idea.revision})});
     await window.loadIntelligence();
     if(action==="create_mission"){
       showSystemMessage("A planned validation mission was created. No AI work, financial action or deployment has been initiated.",{kind:"success"});
       showView("headquarters");
       await window.loadHeadquarters();
     }
     return response;
   }catch(e){fail(e);}finally{button.disabled=false;button.textContent=text;}
 }
 function actionButton(idea,action,text,primary=false){
   const button=node("button",primary?"intel-action-primary":"intel-action-secondary",text);
   button.type="button";
   button.addEventListener("click",()=>{
     const text={
       shortlist:"Shortlist this unvalidated idea for further review?",
       dismiss:"Dismiss this hypothesis? Its source references will remain in the research ledger.",
       reopen:"Reopen this dismissed idea?",
       create_mission:"Create a PLANNED validation mission with source links? No AI execution, code deployment or spending will start."
     }[action];
     if(confirm(text))mutate(idea,action,button);
   });
   return button;
 }
 function renderIdea(idea){
   const article=node("article","intel-card");
   const over=node("div","intel-card-top");
   const markers=node("div","intel-card-labels");
   markers.append(node("span","intel-kind",types[idea.kind]||idea.kind),
     node("span","intel-idea-state intel-state-"+idea.status,idea.status.replaceAll("_"," ").toUpperCase()));
   over.append(markers,node("span","intel-score",idea.priority_score+" / 100 · REVIEW PRIORITY"));
   article.append(over,node("h3","",idea.title));
   article.append(node("p","intel-audience","FOR "+idea.audience));
   article.append(node("p","intel-solution",idea.solution));
   const note=node("div","intel-hypothesis");
   note.append(node("strong","","HYPOTHESIS · NOT VERIFIED DEMAND"),
     node("span","",idea.problem));
   article.append(note);
   const detail=node("details","intel-detail");
   detail.append(node("summary","","Explore MVP, business case & evidence"));
   const body=node("div","intel-detail-body");
   body.append(pairs("WHY NOW — HYPOTHESIS",idea.why_now),
     pairs("FIRST VERSION / MVP",idea.mvp),
     pairs("HOW IT COULD BE DIFFERENT",idea.differentiation),
     pairs("HOW TO TEST REAL DEMAND",idea.validation_plan),
     pairs("POSSIBLE MONETIZATION — UNVERIFIED",idea.monetization_hypothesis),
     pairs("POSSIBLE DISTRIBUTION",idea.distribution_hypothesis),
     pairs("MAIN RISKS",idea.risks));
   const proof=node("div","intel-evidence");
   proof.append(node("h4","","PUBLIC SOURCE LINKS · INSPIRATION, NOT INDEPENDENT VALIDATION"));
   for(const source of idea.sources||[])proof.append(sourceBadge(source));
   if(!(idea.sources||[]).length)proof.append(node("p","","Source references unavailable: independent validation required."));
   proof.append(node("p","intel-evidence-legal","Region: unverified · Market size: unknown · Willingness to pay: unknown"));
   body.append(proof);
   if(window.HQValidation)body.append(window.HQValidation.build(idea));
   detail.append(body);
   article.append(detail);
   const footer=node("div","intel-card-footer");
   footer.append(node("span","intel-date","DISCOVERED "+date(idea.created_at)));
   const buttons=node("div","intel-actions");
   if(idea.status==="proposed")buttons.append(actionButton(idea,"shortlist","Shortlist"));
   if(["proposed","shortlisted"].includes(idea.status)){
     buttons.append(actionButton(idea,"create_mission","Create validation mission ↗",true));
     buttons.append(actionButton(idea,"dismiss","Dismiss"));
   }else if(idea.status==="dismissed")buttons.append(actionButton(idea,"reopen","Reopen"));
   else if(idea.status==="promoted"){
     const jump=node("button","intel-action-secondary","Open mission control ↗");
     jump.type="button";jump.addEventListener("click",()=>showView("headquarters"));
     buttons.append(jump);
   }
   footer.append(buttons);article.append(footer);
   return article;
 }
 function render(){
   if(!state)return;
   const active=$("intel-status").value,kind=$("intel-type").value;
   const visible=state.ideas.filter(idea=>
     (kind==="all"||idea.kind===kind)&&
     (active==="all"||(active==="active"?["proposed","shortlisted"].includes(idea.status):idea.status===active)));
   const board=$("intel-ideas");board.replaceChildren();
   if(!visible.length){
     const empty=node("div","intel-empty");
     empty.append(node("span","intel-empty-mark","✧"),
       node("h3","",state.runs.length?"No matching hypotheses":"Start with public evidence"),
       node("p","",state.runs.length?
         "No ideas match this view. Select another filter or review the latest research journal. Empty results are valid.":
         "A bounded discovery scan can inspect public developer questions and existing projects, then propose a few ideas with real source links. No fake opportunities are preloaded."));
     board.append(empty);
   }else for(const idea of visible)board.append(renderIdea(idea));
   label("intel-total",state.ideas.length);
   label("intel-shortlisted",state.ideas.filter(x=>x.status==="shortlisted").length);
   label("intel-sources",Object.values(state.source_totals).reduce((s,n)=>s+Number(n||0),0));
   label("intel-runs",state.runs.length);
   label("intel-ask",state.source_totals.hn_ask||0);
   label("intel-show",state.source_totals.hn_show||0);
   label("intel-github",state.source_totals.github_repo||0);
   label("intel-status-text",state.ideas.length+" hypotheses stored · "+visible.length+" visible · all require independent validation");
   label("intel-engine",state.engine_available?
     "● Private engine ready · Maximum 2 manual scans/day · 1 model call per scan":
     "○ Private research engine not connected or unavailable · Read-only idea history remains accessible");
   $("intel-scan").disabled=!state.engine_available||state.runs.some(r=>["queued","collecting","synthesizing"].includes(r.status));
   const journal=$("intel-journal");journal.replaceChildren();
   if(!state.runs.length)journal.append(node("p","intel-journal-empty","No research scan has been recorded."));
   for(const run of state.runs.slice(0,8)){
     const line=node("div","intel-run");
     const top=node("div","intel-run-top");
     top.append(node("strong","",run.status.replaceAll("_"," ").toUpperCase()),
       node("small","",date(run.created_at)));
     line.append(top,node("p","",run.source_count+" public signals · "+run.idea_count+" new ideas · "+run.model_calls+" AI calls"));
     if(run.error_summary)line.append(node("small","intel-run-warning","Partial: "+run.error_summary));
     journal.append(line);
   }
   label("intel-disclaimer",state.provenance);
 }
 window.loadIntelligence=async()=>{
   if(loading)return;
   loading=true;
   try{state=await api("/api/admin/intelligence");if(window.HQValidation)await window.HQValidation.load();render();}
   finally{loading=false;}
 };
 $("intel-status").addEventListener("change",render);
 $("intel-type").addEventListener("change",render);
 $("intel-scan").addEventListener("click",async event=>{
   if(!confirm("Start a bounded research scan of public sources? This can use one Workers AI inference call and has a maximum of two owner-triggered scans per day. Nothing will be published or built."))return;
   const button=event.currentTarget;
   button.disabled=true;button.textContent="Queuing discovery…";
   try{
     const result=await api("/api/admin/intelligence",{method:"POST",body:JSON.stringify({action:"scan"})});
     label("intel-status-text","Research run "+result.run_id.slice(0,8)+" queued. Review the journal for progress.");
     await window.loadIntelligence();
   }catch(e){fail(e);}finally{
     button.textContent="✦ Run discovery scan";
     if(state&&!state.runs.some(r=>["queued","collecting","synthesizing"].includes(r.status)))button.disabled=!state.engine_available;
   }
 });
 setInterval(()=>{
   if(document.visibilityState==="visible"&&$("view-intelligence")?.classList.contains("active")&&
     state?.runs?.some(r=>["queued","collecting","synthesizing"].includes(r.status))){
       window.loadIntelligence().catch(()=>{});
   }
 },15000);
})();
