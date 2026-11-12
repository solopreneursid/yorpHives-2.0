(() => {
 "use strict";
 const apiPath="/api/admin/validation";
 const el=(tag,cls="",text)=>{
   const n=document.createElement(tag);
   if(cls)n.className=cls;
   if(text!==undefined)n.textContent=String(text);
   return n;
 };
 const human=value=>String(value||"").replaceAll("_"," ").replace(/\b\w/g,x=>x.toUpperCase());
 let data={experiments:[],counts:{planned:0,active:0,completed:0,cancelled:0}};
 const methods={
  user_interview:"User interviews",landing_page:"Landing-page test",prototype:"Clickable prototype",
  usability_test:"Usability test",pricing_test:"Pricing test",competitor_audit:"Competitor study",other:"Other"
 };
 const metrics={
  responses:"Responses",interviews:"Interviews",signups:"Sign-ups",completions:"Task completions",
  qualified_leads:"Qualified leads",repeat_users:"Repeat users",observations:"Observations"
 };
 function field(label,control){
   const wrap=el("label","hq-val-field");
   wrap.append(el("span","",label),control);
   return wrap;
 }
 function optionSelect(values,name){
   const select=el("select","hq-input");
   select.name=name;select.required=true;
   for(const [value,label] of Object.entries(values)){
     const option=el("option","",label);option.value=value;select.append(option);
   }
   return select;
 }
 function input(name,type,value,placeholder){
   const ctrl=el(type==="textarea"?"textarea":"input","hq-input");
   ctrl.name=name;ctrl.required=true;
   if(type!=="textarea")ctrl.type=type;
   if(value!==undefined)ctrl.value=String(value);
   if(placeholder)ctrl.placeholder=placeholder;
   return ctrl;
 }
 function modal(title,description,build,submit){
   const dialog=el("dialog","hq-val-dialog");
   const form=el("form","hq-val-form");form.method="dialog";
   const heading=el("div","hq-val-dialog-heading");
   heading.append(el("h2","",title),el("p","",description));
   form.append(heading);
   build(form);
   const footer=el("div","hq-val-dialog-actions");
   const cancel=el("button","intel-action-secondary","Cancel");
   cancel.type="button";cancel.addEventListener("click",()=>dialog.close());
   const save=el("button","intel-action-primary","Save");
   save.type="submit";
   footer.append(cancel,save);form.append(footer);dialog.append(form);
   document.body.append(dialog);
   dialog.addEventListener("close",()=>dialog.remove());
   form.addEventListener("submit",async event=>{
     event.preventDefault();
     if(!form.reportValidity())return;
     save.disabled=true;save.textContent="Saving…";
     try{
       await submit(new FormData(form));
       dialog.close();
       await window.loadIntelligence();
     }catch(error){
       const message=error instanceof Error?error.message:"Could not save experiment";
       showSystemMessage(message,{kind:"error",reauthenticate:/Cloudflare Access/.test(message)});
     }finally{save.disabled=false;save.textContent="Save";}
   });
   dialog.showModal();
   const first=form.querySelector("input,textarea");
   if(first)first.focus();
 }
 async function send(payload){
   return api(apiPath,{method:"POST",body:JSON.stringify(payload)});
 }
 function create(idea){
   modal("Plan a demand test",
     "A concrete experiment with measurable success criteria. Evidence remains owner-reported until independently audited.",
     form=>{
       const question=input("question","textarea","",
         "What specific behavior or user need are you testing?");
       question.minLength=12;question.maxLength=350;
       form.append(field("Research question",question));
       const methodsField=optionSelect(methods,"method");
       form.append(field("Test method",methodsField));
       const metricField=optionSelect(metrics,"success_metric");
       form.append(field("Success metric",metricField));
       const target=input("target_count","number",10);
       target.min="1";target.max="10000";target.step="1";
       form.append(field("Target number",target));
       const days=input("timebox_days","number",14);
       days.min="1";days.max="90";days.step="1";
       form.append(field("Timebox (days)",days));
       form.append(el("p","hq-val-disclosure",
         "Examples: 10 completed interviews, 20 waitlist sign-ups, or 15 users completing a prototype task. These are planned targets, not predictions."));
     },
     values=>send({
       action:"create",idea_id:idea.idea_id,
       question:String(values.get("question")).trim(),
       method:String(values.get("method")),success_metric:String(values.get("success_metric")),
       target_count:Number(values.get("target_count")),timebox_days:Number(values.get("timebox_days"))
     })
   );
 }
 function record(experiment){
   modal("Record observed results",
     "Enter measurements you actually collected. Passing a numeric threshold never independently verifies product demand.",
     form=>{
       const count=input("observed_count","number",0);
       count.min="0";count.max="1000000";count.step="1";
       form.append(field("Observed "+human(experiment.success_metric),count));
       const details=input("result_note","textarea","",
         "Describe how results were counted, which users participated, limitations and what you learned.");
       details.minLength=30;details.maxLength=1800;
       form.append(field("Research notes (30–1800 characters)",details));
       const proof=input("evidence_url","url","");
       proof.required=false;proof.placeholder="https://… (optional private reference)";
       form.append(field("Supporting HTTPS reference (optional)",proof));
       form.append(el("p","hq-val-disclosure",
         "Do not put participant names, private personal information or passwords in this record. All counts stay marked owner-reported and unverified."));
     },
     values=>send({
       action:"record_result",experiment_id:experiment.experiment_id,
       expected_revision:experiment.revision,
       observed_count:Number(values.get("observed_count")),
       result_note:String(values.get("result_note")).trim(),
       evidence_url:String(values.get("evidence_url")).trim()||null
     })
   );
 }
 async function transition(experiment,action){
   if(action==="cancel"&&!confirm("Cancel this experiment? Its historical audit record will remain."))return;
   try{
     await send({action,experiment_id:experiment.experiment_id,expected_revision:experiment.revision});
     await window.loadIntelligence();
   }catch(error){
     showSystemMessage(error.message,{kind:"error",reauthenticate:/Cloudflare Access/.test(error.message)});
   }
 }
 function action(label,handler){
   const button=el("button","hq-val-button",label);button.type="button";
   button.addEventListener("click",handler);return button;
 }
 function validationRow(experiment){
   const row=el("article","hq-val-record");
   const top=el("div","hq-val-record-top");
   top.append(el("strong","",experiment.question),
     el("span","hq-val-state hq-val-"+experiment.status,human(experiment.status)));
   row.append(top);
   row.append(el("p","hq-val-metric",
     human(experiment.method)+" · "+human(experiment.success_metric)+
     " · target "+experiment.target_count+" in "+experiment.timebox_days+" days"));
   if(experiment.status==="completed"){
     row.append(el("p","hq-val-result",
       "Reported "+experiment.observed_count+" of "+experiment.target_count+" · "+
       (experiment.outcome==="target_met_owner_reported"?"Numerical target met":"Numerical target not met")+
       " · not independently verified"));
     row.append(el("p","hq-val-note",experiment.result_note));
     if(experiment.evidence_url){
       try{
         const url=new URL(experiment.evidence_url);
         if(url.protocol==="https:"){
           const link=el("a","hq-val-proof","Open owner-provided evidence ↗");
           link.href=url.href;link.target="_blank";link.rel="noopener noreferrer";row.append(link);
         }
       }catch{}
     }
   }
   const buttons=el("div","hq-val-actions");
   if(experiment.status==="planned")buttons.append(action("Start test",()=>transition(experiment,"start")));
   if(experiment.status==="active")buttons.append(action("Record results",()=>record(experiment)));
   if(["planned","active"].includes(experiment.status))buttons.append(action("Cancel",()=>transition(experiment,"cancel")));
   row.append(buttons);
   return row;
 }
 window.HQValidation={
   async load(){data=await api(apiPath);return data;},
   build(idea){
     const wrap=el("section","hq-val-section");
     const heading=el("div","hq-val-heading");
     heading.append(el("h4","","VALIDATION LAB · MEASURE BEFORE BUILDING"));
     const createBtn=action("+ Plan experiment",()=>create(idea));
     heading.append(createBtn);wrap.append(heading);
     const rows=data.experiments.filter(x=>x.idea_id===idea.idea_id);
     if(!rows.length)wrap.append(el("p","hq-val-empty",
       "No experiments recorded. Define a measurable test of this idea's underlying demand before committing engineering time."));
     else for(const item of rows)wrap.append(validationRow(item));
     wrap.append(el("p","hq-val-legal",
       "Owner-reported results only · zero automatic validation or release approval"));
     return wrap;
   }
 };
})();
