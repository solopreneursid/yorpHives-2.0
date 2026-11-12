import { WorkflowEntrypoint } from "cloudflare:workers";
import { collectPublicSignals } from "./sources.js";
import { MODEL, synthesizeIdeas } from "./synthesis.js";

const MAX_MANUAL_PER_DAY=2;
const MAX_SOURCE_ROWS=42;
const HDR={"cache-control":"no-store","x-content-type-options":"nosniff"};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const today=()=>new Date().toISOString().slice(0,10);
const respond=(value,status=200)=>Response.json(value,{status,headers:HDR});
const message=error=>(error instanceof Error?error.message:"Unexpected research failure").slice(0,250);
async function setState(db,runId,status,sourceCount=0,ideaCount=0,problem=null){
 return db.prepare(
  "UPDATE hq_intelligence_runs SET status=?,source_count=?,idea_count=?,error_summary=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),"+
  "completed_at=CASE WHEN ? IN ('completed','partial','failed') THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE NULL END "+
  "WHERE run_id=? RETURNING run_id"
 ).bind(status,sourceCount,ideaCount,problem,status,runId).first();
}
async function startResearch(env,trigger){
 if(!env.DB||!env.RESEARCH_WORKFLOW)return {status:503,error:"Research bindings are not configured."};
 const day=today(),id=crypto.randomUUID(),limit=trigger==="scheduled"?1:MAX_MANUAL_PER_DAY;
 const inserted=await env.DB.prepare(
  "INSERT INTO hq_intelligence_runs(run_id,trigger_source,run_date,status) SELECT ?,?,?,'queued' "+
  "WHERE NOT EXISTS(SELECT 1 FROM hq_intelligence_runs WHERE status IN ('queued','collecting','synthesizing')) "+
  "AND (SELECT COUNT(*) FROM hq_intelligence_runs WHERE trigger_source=? AND run_date=?)<? "+
  "RETURNING run_id"
 ).bind(id,trigger,day,trigger,day,limit).first();
 if(!inserted?.run_id)return {status:429,error:"A discovery scan is already active or today's research budget has been reached."};
 try{
   const instance=await env.RESEARCH_WORKFLOW.create({
    id:"research-"+id,params:{run_id:id}
   });
   return {status:202,run_id:id,workflow_id:instance.id,trigger_source:trigger,
     message:"Research queued: public-source collection, one bounded AI synthesis, evidence-only proposals."};
 }catch(error){
   await setState(env.DB,id,"failed",0,0,"Workflow dispatch failed: "+message(error));
   return {status:503,error:"Research Workflow could not be started.",run_id:id};
 }
}
async function storeSources(db,sources){
 for(const s of sources.slice(0,MAX_SOURCE_ROWS)){
  await db.prepare(
   "INSERT INTO hq_intelligence_sources(source_id,provider,external_id,title,excerpt,source_url,external_url,published_at,popularity_count) "+
   "VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET "+
   "title=excluded.title,excerpt=excluded.excerpt,source_url=excluded.source_url,"+
   "external_url=excluded.external_url,published_at=excluded.published_at,popularity_count=excluded.popularity_count,"+
   "last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')"
  ).bind(s.source_id,s.provider,s.external_id,s.title,s.excerpt,s.source_url,s.external_url,
    s.published_at,s.popularity_count).run();
 }
}
async function fingerprint(value){
 const normalized=value.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(normalized));
 return Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,"0")).join("");
}
async function persistIdeas(db,runId,ideas,sources){
 const validIds=new Set(sources.map(s=>s.source_id));
 let created=0;
 for(const idea of ideas.slice(0,3)){
   const hash=await fingerprint(idea.title);
   const id=crypto.randomUUID();
   const row=await db.prepare(
    "INSERT INTO hq_intelligence_ideas(idea_id,fingerprint,run_id,title,kind,audience,problem,solution,why_now,mvp,"+
    "differentiation,validation_plan,monetization_hypothesis,distribution_hypothesis,risks,"+
    "priority_score,source_count,region_scope,evidence_level) "+
    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) "+
    "ON CONFLICT(fingerprint) DO UPDATE SET last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "+
    "RETURNING idea_id"
   ).bind(id,hash,runId,idea.title,idea.kind,idea.audience,idea.problem,idea.solution,
    idea.why_now,idea.mvp,idea.differentiation,idea.validation_plan,idea.monetization_hypothesis,
    idea.distribution_hypothesis,idea.risks,idea.priority_score,idea.source_ids.length,
    idea.region_scope,idea.evidence_level).first();
   if(!row?.idea_id)throw new Error("Could not persist research idea.");
   if(row.idea_id===id)created++;
   for(const sourceId of idea.source_ids.filter(x=>validIds.has(x))){
     await db.prepare(
      "INSERT OR IGNORE INTO hq_intelligence_evidence(idea_id,source_id) VALUES (?,?)"
     ).bind(row.idea_id,sourceId).run();
   }
 }
 return created;
}
export class ResearchWorkflow extends WorkflowEntrypoint {
 async run(event,step){
  let payload=event.payload||{};
  if(typeof payload==="string"){try{payload=JSON.parse(payload);}catch{throw new Error("Invalid workflow payload.");}}
  const id=String(payload?.run_id||"");
  if(!UUID.test(id))throw new Error("Invalid research run ID.");
  let count=0,created=0;
  try {
   await step.do("claim-private-research-run",async()=>{
     const row=await this.env.DB.prepare(
      "UPDATE hq_intelligence_runs SET status='collecting',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "+
      "WHERE run_id=? AND status='queued' RETURNING run_id"
     ).bind(id).first();
     if(row?.run_id)return {run_id:id};
     const existing=await this.env.DB.prepare("SELECT status FROM hq_intelligence_runs WHERE run_id=?").bind(id).first();
     if(existing?.status==="collecting")return {run_id:id};
     throw new Error("Research run is not eligible.");
   });
   const collected=await step.do("collect-public-sources",{timeout:"4 minutes",retries:{limit:1,delay:"15 seconds",backoff:"linear"}},
      async()=>collectPublicSignals());
   count=collected.sources.length;
   await step.do("save-source-provenance",async()=>{
      await storeSources(this.env.DB,collected.sources);
      await setState(this.env.DB,id,"synthesizing",count,0,collected.errors.join("; ").slice(0,500)||null);
      return {source_count:count};
   });
   let candidates=[];
   let modelProblem=null;
   if(count>=3&&this.env.AI){
     const result=await step.do("generate-bounded-product-hypotheses",{
      timeout:"5 minutes",retries:{limit:1,delay:"10 seconds",backoff:"linear"}
     },async()=>{
      // Workflow retries must not trigger repeated paid inference. The
      // database CAS grants exactly one attempt even if a step replays.
      const attempt=await this.env.DB.prepare(
        "UPDATE hq_intelligence_runs SET model_calls=1 WHERE run_id=? AND model_calls=0 RETURNING run_id"
      ).bind(id).first();
      if(!attempt?.run_id)return {ideas:[],error:"Inference already attempted; automatic repeated billing disabled."};
      try{return {ideas:await synthesizeIdeas(this.env.AI,collected.sources),error:null};}
      catch(error){return {ideas:[],error:"AI synthesis unavailable: "+message(error)};}
     });
     candidates=result.ideas;
     modelProblem=result.error;
   }else modelProblem=count<3?"Insufficient public research sources.":"Workers AI binding unavailable.";
   const output=await step.do("persist-reviewable-opportunities",async()=>{
      created=await persistIdeas(this.env.DB,id,candidates,collected.sources);
      const warnings=[...collected.errors,modelProblem].filter(Boolean);
      const partial=warnings.length>0||count===0||candidates.length===0;
      await setState(this.env.DB,id,partial?"partial":"completed",count,created,warnings.join("; ").slice(0,600)||null);
      return {status:partial?"partial":"completed",source_count:count,new_ideas:created};
   });
   return {...output,run_id:id,verified_market_demand:false,model:MODEL};
  }catch(error){
   await step.do("record-research-failure",async()=>{
     await setState(this.env.DB,id,"failed",count,created,message(error));
     return {failed:true};
   });
   throw error;
  }
 }
}
export default {
 async scheduled(controller,env){
  const result=await startResearch(env,"scheduled");
  if(result.status!==202)console.warn(JSON.stringify({event:"research_schedule_not_started",status:result.status,message:result.error}));
 },
 async fetch(request,env){
  const pathname=new URL(request.url).pathname;
  if(request.method==="GET"&&pathname==="/health"){
    const ready=Boolean(env.DB&&env.RESEARCH_WORKFLOW&&env.AI);
    return respond({ready,engine:"yorphives-global-intelligence",
      model:MODEL,mode:"bounded_public_research",sources:["hn_ask","hn_show","github_repo"],
      max_model_calls_per_run:1,manual_runs_per_day:MAX_MANUAL_PER_DAY,public_route:false},ready?200:503);
  }
  if(request.method!=="POST"||pathname!=="/scans")return respond({error:"Not found."},404);
  if(request.headers.get("content-type")?.split(";")[0]?.trim()!=="application/json")return respond({error:"JSON body required."},415);
  const body=await request.json().catch(()=>null);
  if(!body||Object.keys(body).length!==1||body.action!=="start")return respond({error:"Unsupported scan operation."},400);
  const result=await startResearch(env,"owner");
  const {status,...payload}=result;
  return respond(payload,status);
 }
};
