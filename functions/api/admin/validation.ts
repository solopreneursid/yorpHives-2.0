import {adminJson,isAdminResponse,requireAdmin,type AdminRequestContext} from "../../_lib/admin-auth";
import {mutationGuard,readBoundedJson} from "../../_lib/headquarters";

type ExperimentStatus="planned"|"active"|"completed"|"cancelled";
type ExperimentMethod="user_interview"|"landing_page"|"prototype"|"usability_test"|"pricing_test"|"competitor_audit"|"other";
type ExperimentMetric="responses"|"interviews"|"signups"|"completions"|"qualified_leads"|"repeat_users"|"observations";
interface ExperimentRecord {
 experiment_id:string;idea_id:string;created_by:string;question:string;
 method:ExperimentMethod;success_metric:ExperimentMetric;target_count:number;
 timebox_days:number;status:ExperimentStatus;observed_count:number|null;
 result_note:string;evidence_url:string|null;outcome:string;
 evidence_status:"unverified_owner_report";revision:number;created_at:string;updated_at:string;completed_at:string|null;
}
interface ExperimentSnapshot {
 experiments:ExperimentRecord[];
 counts:{planned:number;active:number;completed:number;cancelled:number};
 generated_at:string;provenance:string;
}
interface CreateRequest {action:"create";idea_id:string;question:string;method:ExperimentMethod;success_metric:ExperimentMetric;target_count:number;timebox_days:number;}
interface StateRequest {action:"start"|"cancel";experiment_id:string;expected_revision:number;}
interface CompleteRequest {action:"record_result";experiment_id:string;expected_revision:number;observed_count:number;result_note:string;evidence_url?:string|null;}
type ExperimentRequest=CreateRequest|StateRequest|CompleteRequest;
interface MutationResponse {success:true;experiment_id:string;status:ExperimentStatus;revision:number;outcome?:string;verified:false;}
const METHODS=new Set(["user_interview","landing_page","prototype","usability_test","pricing_test","competitor_audit","other"]);
const METRICS=new Set(["responses","interviews","signups","completions","qualified_leads","repeat_users","observations"]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const integer=(v:unknown,min:number,max:number):v is number=>
 typeof v==="number"&&Number.isSafeInteger(v)&&v>=min&&v<=max;
function safeHttps(input:unknown):boolean{
 if(input===undefined||input===null||input==="")return true;
 if(typeof input!=="string"||input.length>900)return false;
 try{const url=new URL(input);return url.protocol==="https:"&&url.username===""&&url.password==="";}catch{return false;}
}
function validRequest(input:unknown):input is ExperimentRequest{
 if(!input||typeof input!=="object"||Array.isArray(input))return false;
 const v=input as Record<string,unknown>;
 if(v.action==="create"){
  return typeof v.idea_id==="string"&&UUID.test(v.idea_id)&&
   typeof v.question==="string"&&v.question.trim().length>=12&&v.question.trim().length<=350&&
   METHODS.has(String(v.method))&&METRICS.has(String(v.success_metric))&&
   integer(v.target_count,1,10000)&&integer(v.timebox_days,1,90);
 }
 if(v.action==="start"||v.action==="cancel")return typeof v.experiment_id==="string"&&UUID.test(v.experiment_id)&&
  integer(v.expected_revision,0,1000000);
 if(v.action==="record_result")return typeof v.experiment_id==="string"&&UUID.test(v.experiment_id)&&
  integer(v.expected_revision,0,1000000)&&integer(v.observed_count,0,1000000)&&
  typeof v.result_note==="string"&&v.result_note.trim().length>=30&&
  v.result_note.trim().length<=1800&&safeHttps(v.evidence_url);
 return false;
}
function escapeMd(value:unknown):string{
 return String(value??"").replace(/[\r\n]+/g," ").replace(/[\\`*_{}\[\]<>#|]/g,"\\$&");
}
export async function snapshotValidation(db:NonNullable<AdminRequestContext["env"]["DB"]>):Promise<ExperimentSnapshot>{
 const data=await db.prepare(
  "SELECT experiment_id,idea_id,created_by,question,method,success_metric,target_count,timebox_days,"+
  "status,observed_count,result_note,evidence_url,outcome,evidence_status,revision,created_at,updated_at,completed_at "+
  "FROM hq_validation_experiments ORDER BY created_at DESC LIMIT 250"
 ).all<ExperimentRecord>();
 const rows=data.results;
 return {
  experiments:rows,
  counts:{planned:rows.filter(r=>r.status==="planned").length,
   active:rows.filter(r=>r.status==="active").length,
   completed:rows.filter(r=>r.status==="completed").length,
   cancelled:rows.filter(r=>r.status==="cancelled").length},
  generated_at:new Date().toISOString(),
  provenance:"All results are owner-reported counts and notes, not independently verified user demand. Meeting a numeric target cannot automatically validate an idea, approve spending or permit production changes."
 };
}
export function validationResponse(request:Request,result:ExperimentSnapshot):Response {
 const url=new URL(request.url);
 const markdown=url.searchParams.get("format")==="markdown"||
   (!url.searchParams.has("format")&&(request.headers.get("accept")||"").includes("text/markdown"));
 if(!markdown){const response=adminJson(result);response.headers.set("vary","Accept");return response;}
 const lines=["# YorpHives Validation Lab","",escapeMd(result.provenance),"","Experiments: "+result.experiments.length,""];
 for(const row of result.experiments)lines.push(
  "## "+escapeMd(row.question),"Idea: "+row.idea_id,
  "State: "+row.status+" | Method: "+row.method,
  "Metric: "+row.success_metric+" | Target: "+row.target_count+" | Observed: "+(row.observed_count??"not measured"),
  "Result: "+row.outcome+" | Verification: "+row.evidence_status,
  "Notes: "+escapeMd(row.result_note),"Owner supplied URL: "+escapeMd(row.evidence_url||"none"),"");
 return new Response(lines.join("\n"),{headers:{"content-type":"text/markdown; charset=utf-8",
   "cache-control":"no-store","x-content-type-options":"nosniff","vary":"Accept"}});
}
export async function onRequestGet(context:AdminRequestContext):Promise<Response>{
 const identity=await requireAdmin(context);
 if(isAdminResponse(identity))return identity;
 return validationResponse(context.request,await snapshotValidation(context.env.DB!));
}
export async function onRequestPost(context:AdminRequestContext):Promise<Response>{
 const identity=await requireAdmin(context);
 if(isAdminResponse(identity))return identity;
 const blocked=mutationGuard(context.request);
 if(blocked)return blocked;
 let body:unknown;
 try{body=await readBoundedJson(context.request);}
 catch{return adminJson({error:{message:"Valid bounded JSON is required."}},400);}
 if(!validRequest(body))return adminJson({error:{message:"Invalid validation experiment action or fields."}},400);
 const db=context.env.DB!;
 if(body.action==="create"){
  const experimentId=crypto.randomUUID();
  const inserted=await db.prepare(
   "INSERT INTO hq_validation_experiments(experiment_id,idea_id,created_by,question,method,success_metric,target_count,timebox_days) "+
   "SELECT ?,idea_id,?,?,?,?,?,? FROM hq_intelligence_ideas WHERE idea_id=? AND status IN ('proposed','shortlisted','promoted') "+
   "AND (SELECT COUNT(*) FROM hq_validation_experiments WHERE idea_id=?)<8 RETURNING experiment_id,revision"
  ).bind(experimentId,identity.email,body.question.trim(),body.method,body.success_metric,
    body.target_count,body.timebox_days,body.idea_id,body.idea_id).first<{experiment_id:string;revision:number}>();
  if(!inserted)return adminJson({error:{message:"Idea is unavailable or its experiment limit has been reached."}},409);
  const output:MutationResponse={success:true,experiment_id:inserted.experiment_id,
   status:"planned",revision:inserted.revision,verified:false};
  return adminJson(output,201);
 }
 if(body.action==="start"||body.action==="cancel"){
  const newStatus:ExperimentStatus=body.action==="start"?"active":"cancelled";
  const from=body.action==="start"?"('planned')":"('planned','active')";
  const updated=await db.prepare(
   "UPDATE hq_validation_experiments SET status=?,revision=revision+1,"+
   "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "+
   "WHERE experiment_id=? AND created_by=? AND revision=? AND status IN "+from+
   " RETURNING experiment_id,revision"
  ).bind(newStatus,body.experiment_id,identity.email,body.expected_revision)
   .first<{experiment_id:string;revision:number}>();
  if(!updated)return adminJson({error:{message:"Experiment changed, is not yours or cannot transition."}},409);
  const output:MutationResponse={success:true,experiment_id:updated.experiment_id,
   status:newStatus,revision:updated.revision,verified:false};
  return adminJson(output);
 }
 const evidenceUrl=body.evidence_url?.trim()||null;
 const finished=await db.prepare(
  "UPDATE hq_validation_experiments SET status='completed',observed_count=?,result_note=?,evidence_url=?,"+
  "outcome=CASE WHEN ?>=target_count THEN 'target_met_owner_reported' ELSE 'target_not_met_owner_reported' END,"+
  "revision=revision+1,completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),"+
  "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "+
  "WHERE experiment_id=? AND created_by=? AND revision=? AND status='active' "+
  "RETURNING experiment_id,revision,outcome"
 ).bind(body.observed_count,body.result_note.trim(),evidenceUrl,body.observed_count,
  body.experiment_id,identity.email,body.expected_revision)
  .first<{experiment_id:string;revision:number;outcome:string}>();
 if(!finished)return adminJson({error:{message:"Result cannot be recorded: experiment changed or is not active."}},409);
 const output:MutationResponse={success:true,experiment_id:finished.experiment_id,
  status:"completed",revision:finished.revision,outcome:finished.outcome,verified:false};
 return adminJson(output);
}
