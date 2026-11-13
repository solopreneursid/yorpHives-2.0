(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const create=(tag,cls,value)=>{
    const item=document.createElement(tag);
    if(cls)item.className=cls;
    if(value!==undefined)item.textContent=String(value);
    return item;
  };
  const assistantNames={yorpmind:"YorpMind",chatgpt:"ChatGPT"};
  const labels={awaiting_security_check:"Waiting for your security check",
    active:"Active for a short time",revoked:"Cancelled",expired:"Ended",unavailable:"Unavailable"};
  let securityReady=false;
  let loaded=false;
  let busy=false;
  let grantRows=[];
  const safeURL=value=>typeof value==="string" &&
    /^\/api\/admin\/step-up\/assistant-permissions\?id=[0-9a-f-]{36}$/i.test(value);
  function setStatus(message){$("founder-permission-status").textContent=message;}
  function showGrant(row) {
    const box=create("article","founder-grant");
    const title=create("div","founder-grant-title");
    title.append(create("strong","",row.labels?.assistant||assistantNames[row.assistant]||"Assistant"),
      create("span","founder-grant-state",labels[row.display_state]||"Checking"));
    const message=create("p","",
      (row.labels?.permission||"Selected work")+" · "+(row.labels?.scope||"Selected area"));
    box.append(title,message,create("small","",row.purpose));
    const ends=row.display_state==="active"?row.active_expires_at:row.request_expires_at;
    box.append(create("p","founder-grant-time",ends?"Until "+new Date(ends).toLocaleString():""));
    if(row.display_state==="active"||row.display_state==="awaiting_security_check"){
      const stop=create("button","founder-grant-stop","Stop this permission");
      stop.type="button";
      stop.addEventListener("click",()=>revoke(row.grant_id,stop));
      box.append(stop);
    }
    if(row.display_state==="awaiting_security_check"&&securityReady){
      const secure=create("a","founder-grant-confirm","Complete security check ↗");
      secure.href="/api/admin/step-up/assistant-permissions?id="+encodeURIComponent(row.grant_id);
      secure.target="_blank";
      secure.rel="noopener noreferrer";
      box.append(secure);
    }
    return box;
  }
  async function reload() {
    try {
      const data=await api("/api/admin/assistant-permissions");
      if(data?.owner_is_in_charge!==true ||
          data?.production_execution_enabled!==false ||
          data?.name!=="Your assistant permissions"||
          !Array.isArray(data.assistants)||
          data.assistants.some(row=>row.production_allowed!==false))
        throw Error("Permission safety information is incomplete.");
      securityReady=data.mfa_configured===true;
      grantRows=data.assistants;
      loaded=true;
      const list=$("founder-permission-list");
      list.replaceChildren();
      for(const row of grantRows.slice(0,12))list.append(showGrant(row));
      if(!grantRows.length)list.append(create("p","founder-empty",
        "You haven't given either assistant temporary permission yet."));
      const ready=$("founder-security-note");
      ready.textContent=securityReady ?
        "Your extra security check is ready. Only a verified assistant connection can use an approved permission." :
        "Extra security confirmation is not connected yet. No new permissions can be activated.";
      const connection=data.connected||{};
      $("founder-connection-note").textContent=
        "Assistant connections · YorpMind: "+(connection.yorpmind?"Ready":"Not yet connected")+
        " · ChatGPT: "+(connection.chatgpt?"Ready":"Not yet connected")+
        ". This ChatGPT conversation does not automatically receive Headquarters access.";
      $("founder-permission-submit").disabled=!securityReady;
      if(!securityReady)setStatus("Granting access is locked until your separate security check is configured.");
    } catch {
      securityReady=false;
      $("founder-permission-submit").disabled=true;
      $("founder-permission-list").replaceChildren(create("p","founder-empty",
        "Temporary permissions aren't ready to use yet. No new access has been given."));
      $("founder-security-note").textContent=
        "Not ready yet · the separate security approval and permission records must be set up first.";
      $("founder-connection-note").textContent=
        "ChatGPT and YorpMind still work through their normal tools. Neither has temporary administrator access from this screen.";
      setStatus("Nothing has changed. You remain in full control.");
    }
  }
  async function submit(event) {
    event.preventDefault();
    if(busy||!securityReady||!$("founder-permission-form").reportValidity())return;
    const assistant=$("founder-assistant").value;
    const scope=$("founder-scope").value;
    const permission=$("founder-level").value;
    const duration_minutes=Number($("founder-duration").value);
    const purpose=$("founder-reason").value.trim();
    // Clicking Request explicitly confirms this limited request.
    // No permission can activate until server-side independent approval.
    if(!confirm("Give "+assistantNames[assistant]+" temporary permission for "+
      duration_minutes+" minutes after your separate security check? "+
      "This does not authorize publishing or unrestricted account access."))return;
    busy=true;
    $("founder-permission-submit").disabled=true;
    setStatus("Saving your request. No permission is active yet.");
    try {
      const result=await api("/api/admin/assistant-permissions",{
        method:"POST",body:JSON.stringify({
          assistant,scope,permission,duration_minutes,purpose,confirm:true
        })
      });
      if(result?.permission_active!==false||
          result?.production_allowed!==false||
          result?.status!=="awaiting_security_check"||
          !safeURL(result.security_url))throw Error("We couldn't confirm a safe approval link.");
      const url=result.security_url;
      setStatus("Request saved. You must complete the extra security check before the permission starts.");
      await reload();
      const link=$("founder-secure-link");
      link.href=url;
      link.hidden=false;
      link.textContent="Complete my security check ↗";
    } catch(error){
      setStatus(error instanceof Error?error.message:
        "Request could not be saved. No permission was given.");
    } finally {
      busy=false;
      $("founder-permission-submit").disabled=!securityReady;
    }
  }
  async function revoke(id,button) {
    if(!confirm("Stop this temporary permission now?"))return;
    button.disabled=true;
    setStatus("Ending this permission…");
    try {
      const result=await api("/api/admin/assistant-permissions",{
        method:"PATCH",body:JSON.stringify({action:"revoke",grant_id:id})
      });
      if(result?.cancelled!==true||result?.assistant_access_ended!==true)
        throw Error("Cancellation could not be confirmed.");
      setStatus("Permission cancelled. The assistant cannot use it again.");
      await reload();
    } catch(error) {
      setStatus(error instanceof Error?error.message:"We couldn't confirm cancellation.");
      button.disabled=false;
    }
  }
  async function stopAll() {
    // Revocation is intentionally one tap, with no OTP and no confirmation
    // dialog. The server verifies the owner and records an audit event.
    const button=$("founder-stop-all");
    if(!button||button.disabled)return;
    button.disabled=true;
    button.textContent="Stopping…";
    setStatus("Ending every active and pending assistant permission…");
    try {
      const result=await api("/api/admin/assistant-permissions",{
        method:"PATCH",body:JSON.stringify({action:"revoke_all"})
      });
      if(result?.cancelled!==true||result?.assistant_access_ended!==true||
          result?.production_allowed!==false||
          !Number.isSafeInteger(result.revoked_count))
        throw Error("The emergency stop could not be verified.");
      await reload();
      setStatus(result.revoked_count
        ? "Stopped "+result.revoked_count+" temporary permission(s). No new assistant actions are authorized."
        : "No active or pending assistant permissions remain.");
    } catch(error) {
      setStatus(error instanceof Error?error.message:
        "Could not verify emergency stop. Do not assume access ended.");
    } finally {
      button.disabled=false;
      button.textContent="■ End all assistant access";
    }
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
  function init() {
    $("founder-permission-form")?.addEventListener("submit",submit);
    $("founder-permission-refresh")?.addEventListener("click",reload);
    $("founder-stop-all")?.addEventListener("click",stopAll);
    $("founder-open-permissions")?.addEventListener("click",()=>{
      const panel=document.querySelector(".founder-permission-panel");
      if(panel){panel.open=true;panel.scrollIntoView({behavior:"smooth",block:"nearest"});}
    });
    $("founder-find-fixes")?.addEventListener("click",()=>{
      document.querySelector('.nav-item[data-view="issues"]')?.click();
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
