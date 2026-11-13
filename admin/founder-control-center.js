(() => {
  "use strict";
  // Only historical permission reads and revocation remain. All assistant
  // grant issuance, grant OTP and step-up controls are permanently retired.
  const $=id=>document.getElementById(id);
  const create=(tag,cls,value)=>{
    const item=document.createElement(tag);
    if(cls)item.className=cls;
    if(value!==undefined)item.textContent=String(value);
    return item;
  };
  const setStatus=message=>{const p=$("founder-permission-status");if(p)p.textContent=message;};
  async function api(path,init={}){
    const response=await fetch(path,{
      cache:"no-store",credentials:"same-origin",...init,
      headers:{accept:"application/json",
        ...(init.method?{"content-type":"application/json"}:{}),...(init.headers||{})}
    });
    if(response.redirected||[401,403].includes(response.status))throw Error("Founder session required.");
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data)throw Error(data?.error?.message||"Private access history unavailable.");
    return data;
  }
  async function reload(){
    const list=$("founder-permission-list");
    if(!list)return;
    try{
      const data=await api("/api/admin/assistant-permissions");
      if(data?.name!=="Your assistant permissions"||
         data.owner_is_in_charge!==true||
         data.production_execution_enabled!==false||
         data.agent_execution_connected!==false||
         !Array.isArray(data.active_actions_supported)||
         data.active_actions_supported.length!==0||
         !Array.isArray(data.assistants)||
         data.assistants.some(x=>x?.production_allowed!==false))
        throw Error("Assistant grants are not verified as retired.");
      list.replaceChildren();
      for(const row of data.assistants.slice(0,12)){
        const card=create("article","founder-grant");
        const title=create("div","founder-grant-title");
        title.append(create("strong","",row.labels?.assistant||"Historical assistant"),
          create("span","founder-grant-state",row.display_state||"Archived"));
        card.append(title,create("p","","History only · No production authority"));
        if(["active","awaiting_security_check"].includes(row.display_state)){
          const stop=create("button","founder-grant-stop","Revoke archived permission");
          stop.type="button";
          stop.addEventListener("click",()=>revoke(row.grant_id,stop));
          card.append(stop);
        }
        list.append(card);
      }
      if(!data.assistants.length)list.append(create("p","founder-empty",
        "No archived assistant permission records."));
      const note=$("founder-security-note");
      if(note)note.textContent="Approval links and assistant-administrator OTPs are retired.";
      const connection=$("founder-connection-note");
      if(connection)connection.textContent="YorpMind and ChatGPT use restricted development work identities. Neither can publish.";
      setStatus("Only your personal Go Live OTP can authorize a verified production release.");
    }catch{
      list.replaceChildren(create("p","founder-empty",
        "Private permission history unavailable. New administrator grants are disabled."));
      setStatus("No administrator rights have been issued by this page.");
    }
  }
  async function revoke(id,button){
    if(!confirm("Revoke this historical permission now?"))return;
    button.disabled=true;
    try{
      const result=await api("/api/admin/assistant-permissions",{
        method:"PATCH",body:JSON.stringify({action:"revoke",grant_id:id})
      });
      if(result.cancelled!==true||result.assistant_access_ended!==true||
          result.production_allowed!==false)throw Error("Revocation could not be verified.");
      await reload();
    }catch{
      setStatus("Permission revocation could not be verified. Try Revoke legacy access.");
      button.disabled=false;
    }
  }
  async function stopAll(){
    const button=$("founder-stop-all");
    if(!button||button.disabled)return;
    button.disabled=true;
    button.textContent="Checking revocation…";
    try{
      const result=await api("/api/admin/assistant-permissions",{
        method:"PATCH",body:JSON.stringify({action:"revoke_all"})
      });
      if(result?.cancelled!==true||result?.assistant_access_ended!==true||
          result?.production_allowed!==false||
          !Number.isSafeInteger(result.revoked_count))throw Error("Revocation unverified");
      await reload();
      setStatus(result.revoked_count+" historical permission(s) revoked.");
    }catch{setStatus("Revocation not verified; inspect archived access records.");}
    finally{button.disabled=false;button.textContent="■ Revoke legacy access";}
  }
  function showHandoff({title,why,next_step,link},assistant) {
    const heading=String(title||"YorpHives finding").slice(0,180);
    const details=[heading,String(why||""),String(next_step||"")].filter(Boolean).join("\n");
    if(assistant==="yorpmind"){
      const request=$("repair-request");
      const nav=document.querySelector('.nav-item[data-view="agents"]');
      if(request&&nav) {
        nav.click();
        request.value=(
          "Please investigate this YorpHives finding and prepare a safe, reviewable fix.\n"+
          details+"\nDo not publish anything. Show evidence and a preview before asking for approval."
        ).slice(0,3900);
        const note=$("repair-message");
        if(note)note.textContent="Prepared for YorpMind. Read it, then choose Request investigation if you want to start.";
        request.scrollIntoView({behavior:"smooth",block:"center"});
        request.focus({preventScroll:true});
      }
      return;
    }
    const message=[
      "Help me work on this YorpHives finding in the connected repository",
      "solopreneursid/yorpHives-2.0.",
      "Problem: "+heading,
      "Why it matters: "+String(why||"Not specified."),
      "Suggested next check: "+String(next_step||"Investigate independently."),
      link?"Source: "+link:"",
      "Find the cause, prepare changes on a draft branch, and run tests.",
      "Show me a clear preview and explain the results in simple language.",
      "Do not make a production change without my separate approval.",
      "YorpMind should learn from the checked outcome, whether we work here or in Headquarters."
    ].filter(Boolean).join("\n\n");
    const dialog=$("founder-handoff-dialog");
    // The founder dialog originally lived inside the hidden Home view.
    // Move it to document.body before displaying it so handoffs work from
    // Problems, Monitoring or any other page without hidden ancestors.
    if(!dialog)return;
    if(dialog.parentElement!==document.body)document.body.append(dialog);
    $("founder-handoff-text").value=message;
    $("founder-handoff-status").textContent=
      "Copy this message, then paste it into your ChatGPT conversation. Nothing is sent automatically.";
    dialog.showModal();
  }
  async function copyHandoff() {
    const input=$("founder-handoff-text");
    try{
      await navigator.clipboard.writeText(input.value);
      $("founder-handoff-status").textContent="Copied. Paste it into ChatGPT to continue.";
    }catch{
      input.focus();
      input.select();
      $("founder-handoff-status").textContent=
        "Select and copy the highlighted message, then paste it into ChatGPT.";
    }
  }

  function init(){
    $("founder-permission-refresh")?.addEventListener("click",reload);
    $("founder-stop-all")?.addEventListener("click",stopAll);
    $("founder-find-fixes")?.addEventListener("click",()=>{
      document.querySelector('.nav-item[data-view="issues"]')?.click();
    });
    $("founder-open-release")?.addEventListener("click",()=>{
      document.querySelector('.nav-item[data-view="releases"]')?.click();
    });
    $("founder-handoff-copy")?.addEventListener("click",copyHandoff);
    $("founder-handoff-close")?.addEventListener("click",()=>$("founder-handoff-dialog").close());
    $("founder-chatgpt")?.addEventListener("click",()=>
      showHandoff({title:"Help me investigate or improve YorpHives."},"chatgpt"));
    $("founder-yorpmind")?.addEventListener("click",()=>
      showHandoff({title:"Help me investigate or improve YorpHives."},"yorpmind"));
    void reload();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
  window.HQChooseAssistant=(details,assistant)=>{
    if(assistant!=="yorpmind"&&assistant!=="chatgpt")return;
    showHandoff(details,assistant);
  };
  window.loadFounderPermissions=reload;
})();
