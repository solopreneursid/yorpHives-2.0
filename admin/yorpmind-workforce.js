(()=>{
  "use strict";
  const el=id=>document.getElementById(id);
  const create=(tag,cls,text)=>{
    const x=document.createElement(tag);
    if(cls)x.className=cls;
    if(text!==undefined)x.textContent=String(text);
    return x;
  };
  let snapshot=null;
  function note(message,isError=false){
    const status=el("yw-status");
    if(!status)return;
    status.textContent=message;
    status.dataset.error=isError?"yes":"no";
  }
  function showWorkers(rows){
    const target=el("yw-workers");
    target.replaceChildren();
    if(!rows.length){target.append(create("p","yw-muted","No employees have been registered."));return;}
    const table=create("table","yw-table");
    const head=create("thead");
    const tr=create("tr");
    for(const title of ["AI employee","Department","Manager","Model role","State"])tr.append(create("th","",title));
    head.append(tr);table.append(head);
    const body=create("tbody");
    for(const row of rows.slice(0,50)){
      const t=create("tr");
      t.append(
        create("td","yw-strong",row.display_name),
        create("td","",row.department_id.replaceAll("-"," ")),
        create("td","",row.supervisor_name),
        create("td","",row.model_slot),
        create("td",row.state==="ready"?"yw-ready":"yw-planned",
          row.state==="ready"?"Configured":"Not running")
      );body.append(t);
    }
    table.append(body);target.append(table);
  }
  function showQueue(rows,workers){
    const target=el("yw-work-orders");
    target.replaceChildren();
    if(!rows.length){target.append(create("p","yw-muted","No company work orders yet. Your AI employees have not started working."));return;}
    for(const item of rows.slice(0,14)){
      const article=create("article","yw-order");
      const title=create("strong","",item.title);
      const meta=create("small","",[
        workers.find(x=>x.worker_id===item.worker_id)?.display_name||item.worker_id,
        item.asset.replaceAll("_"," "),
        "Planned · Not executing"
      ].join(" · "));
      const p=create("p","",item.brief);
      const acceptance=create("details");
      acceptance.append(create("summary","","Acceptance criteria"),
        create("p","",item.acceptance_criteria));
      article.append(title,meta,p,acceptance);
      target.append(article);
    }
  }
  async function refresh(){
    try{
      const result=await api("/api/admin/yorpmind-workforce");
      if(result?.name!=="YorpMind independent workforce"||
        result?.owner_in_charge!==true||result.production_allowed!==false||
        result?.readiness?.inference_operational!==false||
        !Array.isArray(result.workers)||!Array.isArray(result.local_model_slots)||
        !Array.isArray(result.work_orders))
        throw Error("The private workforce service is not ready.");
      snapshot=result;
      el("yw-count").textContent=String(result.workers.length);
      el("yw-models").textContent=String(result.readiness.ready_model_slots||0);
      el("yw-execution").textContent="OFF";
      el("yw-queue").textContent=String(result.work_orders.filter(
        x=>x.state==="planned").length);
      showWorkers(result.workers);
      showQueue(result.work_orders,result.workers);
      const select=el("yw-worker");
      const previous=select.value;
      select.replaceChildren();
      for(const worker of result.workers){
        const option=create("option","",worker.display_name);
        option.value=worker.worker_id;
        option.disabled=worker.state==="paused";
        select.append(option);
      }
      if(result.workers.some(x=>x.worker_id===previous))select.value=previous;
      el("yw-create").disabled=!result.workers.length;
      note("Private company registry loaded. Work orders are plans only; no owned model runner is connected.");
    }catch(e){
      snapshot=null;
      el("yw-create").disabled=true;
      note(e instanceof Error?e.message:"Private company registry unavailable.",true);
    }
  }
  async function createOrder(event){
    event.preventDefault();
    if(!snapshot||!el("yw-form").reportValidity())return;
    const button=el("yw-create");
    button.disabled=true;
    note("Saving your planned company task. No AI execution will start.");
    try{
      const input={
        action:"create",confirm:true,request_id:crypto.randomUUID(),
        worker_id:el("yw-worker").value,asset:el("yw-asset").value,
        priority:"normal",title:el("yw-title").value,
        brief:el("yw-brief").value,
        acceptance_criteria:el("yw-criteria").value
      };
      const out=await api("/api/admin/yorpmind-workforce",{
        method:"POST",body:JSON.stringify(input)
      });
      if(out?.saved!==true||out?.execution_started!==false||
        out?.production_allowed!==false)
        throw Error("The saved work order could not be verified.");
      el("yw-form").reset();
      await refresh();
      note("Work order saved for YorpMind's internal team. No model call or live change was triggered.");
    }catch(e){note(e instanceof Error?e.message:"Unable to safely save company work.",true);}
    finally{button.disabled=!snapshot;}
  }
  function start(){
    const btn=el("yw-refresh");
    if(!btn)return;
    btn.addEventListener("click",refresh);
    el("yw-form")?.addEventListener("submit",createOrder);
    refresh();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();