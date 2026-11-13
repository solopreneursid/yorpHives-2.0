/**
 * YorpHives original workforce contracts: provider-neutral and owner-led.
 * NO third-party agent runtimes, model accounts or external AI API calls.
 */
export const WORK_ASSETS=Object.freeze([
  "yorphives_website","headquarters","company_portfolio"
]);
export const WORK_PRIORITIES=Object.freeze(["low","normal","high"]);
export const WORKER_ID=/^w-[a-z]{3,32}$/;
export const UUID_V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const control=/[\u0000-\u001f\u007f]/;
export function normalizeWorkOrder(input){
  if(!input||typeof input!=="object"||Array.isArray(input)||
    input.action!=="create" || input.confirm!==true ||
    typeof input.request_id!=="string"||!UUID_V4.test(input.request_id)||
    typeof input.worker_id!=="string"||!WORKER_ID.test(input.worker_id)||
    !WORK_ASSETS.includes(input.asset)||
    !WORK_PRIORITIES.includes(input.priority))return null;
  const strings=[["title",8,160],["brief",40,2000],["acceptance_criteria",40,1200]];
  const out={action:"create",request_id:input.request_id,
    worker_id:input.worker_id,asset:input.asset,priority:input.priority};
  for(const [key,min,max] of strings){
    const value=input[key];
    if(typeof value!=="string"||value.trim().length<min||
       value.trim().length>max||control.test(value))return null;
    out[key]=value.trim();
  }
  return out;
}
export function workforceReadiness(modelSlots,workers){
  const readySlots=(modelSlots||[]).filter(x=>x.state==="ready");
  const running=(workers||[]).filter(x=>x.state==="ready");
  // A model slot marked ready does not prove a model server is reachable.
  // A worker must pass a separate signed runner handshake in a later stage.
  return {registered_workers:(workers||[]).length,
    ready_model_slots:readySlots.length,planned_workers:(workers||[]).length-running.length,
    connected_private_runners:0,inference_operational:false,
    message:"Company roles and tasks are registered. No verified self-hosted model runner is connected."};
}
/**
 * Single-node self-hosted local inference policy.
 * These addresses are meant for software running on your OWN host, not from
 * a Cloudflare function. Never accept arbitrary URLs from an LLM or browser.
 */
export function validLocalInferenceUrl(raw){
  if(typeof raw!=="string"||raw.length>150)return false;
  try{
    const u=new URL(raw);
    return u.protocol==="http:"&&
      ["127.0.0.1","localhost","[::1]"].includes(u.hostname)&&
      Number(u.port)>=1024 && Number(u.port)<=65535 &&
      (u.pathname==="/v1/chat/completions"||
       u.pathname==="/api/chat") &&
      u.username===""&&u.password===""&&u.search===""&&u.hash==="";
  }catch{return false;}
}
