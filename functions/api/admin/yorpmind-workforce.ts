import {adminJson,isAdminResponse,requireAdmin,type AdminRequestContext} from "../../_lib/admin-auth";
import {mutationGuard,readBoundedJson} from "../../_lib/headquarters";
import {normalizeWorkOrder,workforceReadiness,UUID_V4} from "../../_lib/yorpmind-workforce.js";

interface WorkerRow {worker_id:string;agent_id:string;display_name:string;
  department_id:string;supervisor_id:string;supervisor_name:string;
  model_slot:string;state:string;execution_policy:string;can_release:number;}
interface OrderRow {work_id:string;job_id:string;worker_id:string;supervisor_id:string;
  asset:string;title:string;brief:string;acceptance_criteria:string;
  priority:string;state:string;requested_by:string;created_at:string;updated_at:string;}
interface SlotRow {slot_id:string;description:string;runtime:string;state:string;model_ref:string;}
type Context=AdminRequestContext;
function error(code:string,message:string,status:number){
  return adminJson({error:{code,message},production_allowed:false},status);
}
async function founder(context:Context){
  const person=await requireAdmin(context);
  if(isAdminResponse(person))return person;
  // Signed-in human owner only; CI tokens cannot impersonate the founder.
  if(person.serviceToken||!person.email||
     !(context.env.ADMIN_ALLOWED_EMAILS||"").split(",").some(
       s=>s.trim().toLowerCase()===person.email.toLowerCase()))
    return error("FOUNDER_ONLY","Only the signed-in founder can manage company work.",403);
  return person;
}
async function schemaReady(context:Context){
  const rows=await context.env.DB!.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND "+
    "name IN ('yorpmind_workers','yorpmind_work_orders','yorpmind_local_model_slots','agent_jobs')"
  ).all<{name:string}>();
  return new Set(rows.results.map(x=>x.name)).size===4;
}
function stamp(){return new Date().toISOString();}
export async function onRequestGet(context:Context):Promise<Response>{
  const person=await founder(context);
  if(isAdminResponse(person))return person;
  try{
    if(!await schemaReady(context))
      return error("WORKFORCE_NOT_DEPLOYED","The independent workforce database is not ready.",503);
    const db=context.env.DB!;
    const [workers,slots,orders,messages,learning]=await Promise.all([
      db.prepare("SELECT w.worker_id,w.agent_id,a.display_name,a.department_id,"+
        "w.supervisor_id,s.display_name AS supervisor_name,w.model_slot,w.state,"+
        "w.execution_policy,w.can_release FROM yorpmind_workers w "+
        "JOIN agent_registry a ON a.agent_id=w.agent_id "+
        "JOIN yorpmind_staff s ON s.staff_id=w.supervisor_id "+
        "ORDER BY a.department_id,w.worker_id LIMIT 50").all<WorkerRow>(),
      db.prepare("SELECT slot_id,description,runtime,state,model_ref "+
        "FROM yorpmind_local_model_slots ORDER BY slot_id LIMIT 12").all<SlotRow>(),
      db.prepare("SELECT w.work_id,w.job_id,w.worker_id,w.supervisor_id,w.asset,"+
        "j.title,j.request_summary AS brief,w.acceptance_criteria,j.priority,"+
        "w.state,w.requested_by,w.created_at,w.updated_at "+
        "FROM yorpmind_work_orders w JOIN agent_jobs j ON j.job_id=w.job_id "+
        "ORDER BY w.created_at DESC LIMIT 35").all<OrderRow>(),
      db.prepare("SELECT message_id,work_id,sender_kind,sender_id,message,created_at "+
        "FROM yorpmind_work_messages ORDER BY created_at DESC LIMIT 50")
        .all<{message_id:string;work_id:string;sender_kind:string;sender_id:string;message:string;created_at:string}>(),
      db.prepare("SELECT state,COUNT(*) AS count FROM yorpmind_learning_candidates GROUP BY state")
        .all<{state:string;count:number}>()
    ]);
    return adminJson({name:"YorpMind independent workforce",owner_in_charge:true,
      production_allowed:false,model_api_provider:"none",
      readiness:workforceReadiness(slots.results,workers.results),
      workers:workers.results,local_model_slots:slots.results,
      work_orders:orders.results,messages:messages.results,
      learning_candidates:learning.results,
      notes:"Work orders are stored as plans only. No local model server, worker process, or automatic training is claimed to be running.",
      generated_at:stamp()});
  }catch{return error("WORKFORCE_UNAVAILABLE",
    "Cannot read the private company workforce. No work was performed.",503);}
}
export async function onRequestPost(context:Context):Promise<Response>{
  const person=await founder(context);
  if(isAdminResponse(person))return person;
  const denied=mutationGuard(context.request);if(denied)return denied;
  let body:unknown;
  try{body=await readBoundedJson(context.request);}
  catch{return error("INVALID_JSON","Provide a valid, bounded work request.",400);}
  const item=normalizeWorkOrder(body);
  if(!item)return error("INVALID_WORK_ORDER",
    "Choose a worker and asset, and provide a clear task and acceptance criteria.",400);
  try{
    if(!await schemaReady(context))
      return error("WORKFORCE_NOT_DEPLOYED","Workforce records are not available.",503);
    const db=context.env.DB!;
    const worker=await db.prepare("SELECT w.worker_id,w.agent_id,w.supervisor_id,"+
      "w.state,w.execution_policy FROM yorpmind_workers w WHERE w.worker_id=?")
      .bind(item.worker_id).first<WorkerRow>();
    if(!worker||worker.state==="paused")
      return error("WORKER_NOT_AVAILABLE","Choose a planned or available internal employee.",409);
    const existing=await db.prepare("SELECT w.work_id,w.worker_id,w.asset,"+
      "w.acceptance_criteria,w.requested_by,j.title,j.request_summary,j.priority "+
      "FROM yorpmind_work_orders w JOIN agent_jobs j ON j.job_id=w.job_id "+
      "WHERE w.work_id=?").bind(item.request_id).first<Record<string,string>>();
    if(existing){
      if(existing.worker_id===item.worker_id&&existing.asset===item.asset &&
         existing.acceptance_criteria===item.acceptance_criteria &&
         existing.requested_by===person.email&&existing.title===item.title &&
         existing.request_summary===item.brief&&existing.priority===item.priority)
        return adminJson({saved:true,work_id:item.request_id,status:"planned",
          replayed:true,execution_started:false,production_allowed:false});
      return error("IDEMPOTENCY_CONFLICT",
        "This request identifier was already used for different work.",409);
    }
    const quota=await db.prepare("SELECT COUNT(*) AS count FROM "+
      "yorpmind_work_orders WHERE requested_by=? AND state='planned'")
      .bind(person.email).first<{count:number}>();
    if(Number(quota?.count||0)>=30)
      return error("QUEUE_LIMIT","Review your thirty pending company tasks before creating more.",429);
    const now=stamp();
    await db.batch([
      db.prepare("INSERT INTO agent_jobs(job_id,agent_id,job_type,title,"+
        "request_summary,status,priority,risk_level,requires_owner_approval,created_by,"+
        "origin_type) VALUES(?,?, 'yorpmind_work_order',?,?,'planned',?,'low',1,?,'founder_workforce') "+
        "ON CONFLICT(job_id) DO NOTHING")
        .bind(item.request_id,worker.agent_id,item.title,item.brief,item.priority,person.email),
      db.prepare("INSERT INTO yorpmind_work_orders(work_id,job_id,worker_id,"+
        "supervisor_id,asset,acceptance_criteria,state,requested_by) "+
        "SELECT ?,?,?,?,?,?,'planned',? WHERE EXISTS "+
        "(SELECT 1 FROM agent_jobs WHERE job_id=? AND created_by=? AND "+
        "job_type='yorpmind_work_order') ON CONFLICT(work_id) DO NOTHING")
        .bind(item.request_id,item.request_id,item.worker_id,worker.supervisor_id,
          item.asset,item.acceptance_criteria,person.email,item.request_id,person.email),
      db.prepare("INSERT INTO agent_job_events(event_id,job_id,agent_id,actor_type,"+
        "actor_id,event_type,details_json,created_at) "+
        "SELECT ?,?,?, 'owner',?,'yorpmind_work_order_created',?,? "+
        "WHERE EXISTS(SELECT 1 FROM yorpmind_work_orders WHERE work_id=?) "+
        "ON CONFLICT(event_id) DO NOTHING")
        .bind("work-"+item.request_id,item.request_id,worker.agent_id,
          person.email,JSON.stringify({asset:item.asset,worker_id:item.worker_id,
          execution_started:false,production_allowed:false}),now,item.request_id)
    ]);
    const saved=await db.prepare("SELECT w.work_id,w.worker_id,w.asset,"+
      "w.acceptance_criteria,w.requested_by,j.title,j.request_summary,j.priority "+
      "FROM yorpmind_work_orders w JOIN agent_jobs j ON j.job_id=w.job_id "+
      "WHERE w.work_id=?").bind(item.request_id).first<Record<string,string>>();
    if(!saved || saved.worker_id!==item.worker_id||saved.asset!==item.asset||
      saved.acceptance_criteria!==item.acceptance_criteria||
      saved.requested_by!==person.email||saved.title!==item.title||
      saved.request_summary!==item.brief||saved.priority!==item.priority)
      return error("SAVE_UNCONFIRMED","Could not verify the new work order.",503);
    return adminJson({saved:true,work_id:item.request_id,status:"planned",
      replayed:false,execution_started:false,production_allowed:false,
      message:"Your company work order is recorded, but local AI execution is not connected yet."},201);
  }catch{return error("WORK_ORDER_FAILED","Work order could not be safely recorded.",503);}
}
