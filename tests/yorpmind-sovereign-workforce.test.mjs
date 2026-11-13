import test from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {stripTypeScriptTypes} from "node:module";
import {DatabaseSync} from "node:sqlite";
import {normalizeWorkOrder,validLocalInferenceUrl,workforceReadiness}
  from "../functions/_lib/yorpmind-workforce.js";
const source=path=>readFile(new URL(path,import.meta.url),"utf8");
const toModule=source=>"data:text/javascript;base64,"+
  Buffer.from(stripTypeScriptTypes(source)).toString("base64");
const auth=toModule(
  "export const adminJson=(body,status=200)=>Response.json(body,{status});"+
  "export const isAdminResponse=value=>value instanceof Response;"+
  "export const requireAdmin=async context=>context.request.headers.get('x-test-owner')==='yes'"+
  "?{email:'owner@example.com',serviceToken:context.request.headers.get('x-test-service')==='yes'}:"+
  "Response.json({error:{code:'NO_OWNER'}},{status:401});"
);
const headquarters=toModule(
  "export const mutationGuard=request=>request.headers.get('origin')==="+
  "new URL(request.url).origin?null:Response.json({error:{code:'WRONG_ORIGIN'}},{status:403});"+
  "export const readBoundedJson=async request=>JSON.parse(await request.text());"
);
const workforce=toModule(await source("../functions/_lib/yorpmind-workforce.js"));
const code=(await source("../functions/api/admin/yorpmind-workforce.ts"))
  .replace('"../../_lib/admin-auth"',JSON.stringify(auth))
  .replace('"../../_lib/headquarters"',JSON.stringify(headquarters))
  .replace('"../../_lib/yorpmind-workforce.js"',JSON.stringify(workforce));
const route=await import(toModule(code));
const work={
  action:"create",confirm:true,request_id:"123e4567-e89b-42d3-a456-000000000012",
  worker_id:"w-engineering",asset:"yorphives_website",priority:"normal",
  title:"Investigate free tool onboarding",
  brief:"Investigate why new visitors leave before finishing a free tool workflow.",
  acceptance_criteria:"QA must verify measured funnel evidence and a reproducible task outcome before any code changes are proposed."
};
function adapter(sqlite){
  const prepare=sql=>{
    let values=[];
    const stmt={bind(...v){values=v;return stmt;},
      async first(){return sqlite.prepare(sql).get(...values)||null;},
      async all(){return{results:sqlite.prepare(sql).all(...values),success:true};},
      async run(){const row=sqlite.prepare(sql).run(...values);
        return{success:true,meta:{changes:Number(row.changes)}};}
    };return stmt;
  };
  return {prepare,async batch(statements){
    sqlite.exec("BEGIN");
    try{
      const results=[];
      for(const x of statements)results.push(await x.run());
      sqlite.exec("COMMIT");return results;
    }catch(e){sqlite.exec("ROLLBACK");throw e;}
  }};
}
async function fixture(){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  const path=new URL("../migrations/",import.meta.url);
  const files=(await readdir(path)).filter(x=>/^\d{4}_.*\.sql$/.test(x)).sort();
  for(const name of files)sqlite.exec(await readFile(new URL(name,path),"utf8"));
  const env={DB:adapter(sqlite),ADMIN_ALLOWED_EMAILS:"owner@example.com"};
  const req=(body=null,options={})=>({env,
    request:new Request("https://private.example/api/admin/yorpmind-workforce",{
      method:body?"POST":"GET",
      headers:{"x-test-owner":options.owner===false?"no":"yes",
        "x-test-service":options.service?"yes":"no",
        origin:options.origin||"https://private.example",
        "content-type":"application/json"},
      ...(body?{body:JSON.stringify(body)}:{})
    })
  });
  return {sqlite,env,req};
}
test("workforce migration adds staff-supervised employees and local-only unconfigured model slots",async()=>{
  const {sqlite,req}=await fixture();
  try{
    const rows=sqlite.prepare("SELECT worker_id,model_slot,state,execution_policy,can_release,can_grant_permissions FROM yorpmind_workers").all();
    assert.equal(rows.length,9);
    assert.ok(rows.every(r=>r.state==="planned"&&r.execution_policy==="plan_only"&&
      r.can_release===0&&r.can_grant_permissions===0));
    const models=sqlite.prepare("SELECT * FROM yorpmind_local_model_slots").all();
    assert.equal(models.length,5);
    assert.ok(models.every(x=>x.runtime==="unconfigured"&&x.state==="unconfigured"));
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(),[]);
    assert.equal(workforceReadiness(models,rows).inference_operational,false);
    const response=await route.onRequestGet(req());
    assert.equal(response.status,200);
    const data=await response.json();
    assert.equal(data.owner_in_charge,true);
    assert.equal(data.production_allowed,false);
    assert.equal(data.workers.length,9);
    assert.equal(data.local_model_slots.length,5);
    assert.equal(data.readiness.connected_private_runners,0);
    assert.equal(data.work_orders.length,0);
  }finally{sqlite.close();}
});
test("founder can create a durable plan-only work order without dispatching models",async()=>{
  const {sqlite,req}=await fixture();
  try{
    const res=await route.onRequestPost(req(work));
    assert.equal(res.status,201);
    assert.deepEqual(await res.json(),{
      saved:true,work_id:work.request_id,status:"planned",replayed:false,
      execution_started:false,production_allowed:false,
      message:"Your company work order is recorded, but local AI execution is not connected yet."
    });
    assert.deepEqual(sqlite.prepare(
      "SELECT status,requires_owner_approval,agent_id,created_by FROM agent_jobs WHERE job_id=?")
      .get(work.request_id),{
      status:"planned",requires_owner_approval:1,agent_id:"engineering-lead",created_by:"owner@example.com"});
    assert.equal(sqlite.prepare(
      "SELECT COUNT(*) AS n FROM agent_job_events WHERE job_id=?").get(work.request_id).n,1);
    assert.equal(sqlite.prepare(
      "SELECT supervisor_id FROM yorpmind_work_orders WHERE work_id=?").get(work.request_id).supervisor_id,"yorpmind1");
    const replay=await route.onRequestPost(req(work));
    assert.equal(replay.status,200);
    assert.equal((await replay.json()).replayed,true);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM agent_job_events WHERE job_id=?")
      .get(work.request_id).n,1);
    assert.equal((await route.onRequestPost(req({...work,asset:"headquarters"}))).status,409);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM agent_jobs WHERE job_id=?")
      .get(work.request_id).n,1);
  }finally{sqlite.close();}
});
test("impostors, wrong origin, unrecognized workers and unsafe requests fail closed",async()=>{
  const {sqlite,req}=await fixture();
  try{
    assert.equal((await route.onRequestPost(req(work,{owner:false}))).status,401);
    assert.equal((await route.onRequestPost(req(work,{service:true}))).status,403);
    assert.equal((await route.onRequestPost(req(work,{origin:"https://wrong.example"}))).status,403);
    assert.equal((await route.onRequestPost(req({...work,worker_id:"w-unknown"}))).status,409);
    assert.equal((await route.onRequestPost(req({...work,priority:"urgent"}))).status,400);
    assert.equal((await route.onRequestPost(req({...work,asset:"third_party_api"}))).status,400);
    assert.equal((await route.onRequestPost(req({...work,brief:"deploy everything"}))).status,400);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM yorpmind_work_orders").get().n,0);
  }finally{sqlite.close();}
});
test("stored communication is append-only and learning candidates need independent review",async()=>{
  const {sqlite,req}=await fixture();
  try{
    assert.equal((await route.onRequestPost(req(work))).status,201);
    const id="123e4567-e89b-42d3-a456-000000000110";
    sqlite.prepare("INSERT INTO yorpmind_work_messages(message_id,work_id,sender_kind,sender_id,message) VALUES (?,?,?,?,?)")
      .run(id,work.request_id,"founder","owner@example.com","Follow the independently verified acceptance criteria.");
    assert.throws(()=>sqlite.prepare("UPDATE yorpmind_work_messages SET message='edited' WHERE message_id=?").run(id),/append-only/i);
    assert.throws(()=>sqlite.prepare("DELETE FROM yorpmind_work_messages WHERE message_id=?").run(id),/append-only/i);
    const candidate="123e4567-e89b-42d3-a456-000000000111";
    sqlite.prepare("INSERT INTO yorpmind_learning_candidates(candidate_id,work_id,proposal,evidence_ref,created_by) VALUES (?,?,?,?,?)")
      .run(candidate,work.request_id,
        "An evidence-linked hypothesis that still needs independent checks before becoming a shared skill.",
        "local-artifact:example-check",
        "w-engineering");
    assert.throws(()=>sqlite.prepare("UPDATE yorpmind_learning_candidates SET state='approved_reference',reviewed_by='w-engineering',reviewed_at=? WHERE candidate_id=?")
      .run(new Date().toISOString(),candidate),/CHECK constraint/i);
    assert.throws(()=>sqlite.prepare("UPDATE yorpmind_learning_candidates SET proposal='rewritten' WHERE candidate_id=?").run(candidate),/immutable/i);
  }finally{sqlite.close();}
});
test("model adapter only accepts loopback inference hosts with exact safe paths",()=>{
  assert.equal(validLocalInferenceUrl("http://127.0.0.1:11434/api/chat"),true);
  assert.equal(validLocalInferenceUrl("http://localhost:8080/v1/chat/completions"),true);
  for(const url of [
    "https://api.openai.com/v1/chat/completions",
    "https://localhost:8080/v1/chat/completions",
    "http://192.168.1.12:8080/v1/chat/completions",
    "http://127.0.0.1:8080/admin",
    "http://127.0.0.1:80/v1/chat/completions",
    "http://a:b@localhost:11434/api/chat",
    "http://localhost:11434/api/chat?key=secret",
    "file:///tmp/model","http://169.254.169.254:8080/api/chat"
  ]) assert.equal(validLocalInferenceUrl(url),false,url);
});
test("YorpMind panel presents roster and honest plan-only execution state",async()=>{
  const html=await source("../admin/index.html");
  const js=await source("../admin/yorpmind-workforce.js");
  assert.match(html,/id="yw-heading">Your AI employees/);
  assert.match(html,/id="yw-form"/);
  assert.match(html,/id="yw-execution">OFF/);
  assert.match(html,/yorpmind-workforce\.js/);
  assert.match(js,/execution_started!==false/);
  assert.match(js,/No model call or live change was triggered/);
  assert.doesNotMatch(js,/openai\.com|anthropic\.com/);
});
