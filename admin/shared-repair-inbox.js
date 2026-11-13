(() => {
  "use strict";
  // Read-only issue evidence. Headquarters never creates issues, submits repair
  // jobs or invokes coding agents. The founder performs fixes.
  const repo="solopreneursid/yorpHives-2.0";
  const $=id=>document.getElementById(id);
  const text=(tag,cls,value)=>{
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(value!==undefined)node.textContent=String(value);
    return node;
  };
  const safeIssue=issue=>issue&&Number.isSafeInteger(issue.number)&&issue.number>0&&
    issue.url==="https://github.com/"+repo+"/issues/"+issue.number&&
    typeof issue.title==="string"&&typeof issue.body_excerpt==="string";
  let fetching=false,loaded=false;
  async function load(){
    if(fetching||!$("shared-repair-list")||!$("shared-repair-status"))return;
    fetching=true;
    $("shared-repair-status").textContent="Reading existing issue observations…";
    try{
      const result=await api("/api/admin/repair-inbox");
      if(result?.repository!==repo||result?.read_only!==true||
         result?.production_approved!==false||result?.new_model_calls!==0||
         !Array.isArray(result.issues)||result.issues.length>20||
         result.issues.some(issue=>!safeIssue(issue)))
        throw Error("Monitoring evidence contract invalid");
      const list=$("shared-repair-list");
      list.replaceChildren();
      if(!result.issues.length)list.append(text("p","shared-repair-empty",
        "No recorded issues were found. New code and repairs are controlled by the founder."));
      for(const issue of result.issues){
        const card=text("article","shared-repair-card");
        const heading=text("div","shared-repair-heading");
        heading.append(text("span","shared-repair-number","#"+issue.number),
          text("strong","",issue.title));
        const summary=text("p","shared-repair-description",issue.body_excerpt.slice(0,650));
        const buttons=text("div","shared-repair-controls");
        const open=text("a","shared-repair-link","View original report ↗");
        open.href=issue.url;open.target="_blank";open.rel="noopener noreferrer";
        const copy=text("button","shared-repair-prepare","Copy issue evidence");
        copy.type="button";
        copy.addEventListener("click",async()=>{
          try{
            await navigator.clipboard.writeText([
              "Issue #"+issue.number+": "+issue.title,"Source: "+issue.url,
              "Observation: "+issue.body_excerpt.slice(0,1100),
              "I will make and test any necessary fix myself."
            ].join("\n"));
            $("shared-repair-status").textContent="Issue evidence copied. No code or issue was changed.";
          }catch{
            $("shared-repair-status").textContent="Copy unavailable; open the source issue to review its details.";
          }
        });
        const chat=text("button","shared-repair-prepare","Discuss with ChatGPT →");
        chat.type="button";
        chat.addEventListener("click",()=>window.HQChooseAssistant?.({
          title:issue.title,why:issue.body_excerpt,
          next_step:"Explain the observation and possible remedies. I will personally implement and test any changes.",
          link:issue.url
        },"chatgpt"));
        buttons.append(copy,chat,open);
        card.append(heading,summary,buttons);
        list.append(card);
      }
      $("shared-repair-status").textContent=
        "Read-only reports: not verified fixes. Headquarters has not initiated work or spent AI credits.";
      loaded=true;
    }catch{
      $("shared-repair-status").textContent=
        "Issue monitoring records are unavailable. No work or external write was attempted.";
      $("shared-repair-list").replaceChildren(text("p","shared-repair-empty",
        "Review monitored findings or the original GitHub issues directly."));
    }finally{fetching=false;}
  }
  function init(){
    $("shared-repair-refresh")?.addEventListener("click",load);
    document.querySelectorAll(".nav-item[data-view='agents']").forEach(btn=>
      btn.addEventListener("click",()=>{if(!loaded)void load();}));
    if($("view-agents")?.classList.contains("active"))void load();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
  window.loadSharedRepairInbox=load;
})();
