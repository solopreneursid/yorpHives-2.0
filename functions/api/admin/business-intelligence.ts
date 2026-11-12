import {adminJson,isAdminResponse,requireAdmin,type AdminRequestContext} from "../../_lib/admin-auth";
import {mutationGuard,readBoundedJson} from "../../_lib/headquarters";
import {buildBusinessBoard,type BusinessBoardSnapshot,type BusinessReviewStatus}
 from "../../_lib/business-intelligence";

interface BoardEnv extends AdminRequestContext["env"] {
 HQ_TOOL_SERVICE_TOKEN_IDS?:string;
}
type BoardContext=Omit<AdminRequestContext,"env">&{env:BoardEnv};
export interface BusinessReviewCommand {
 action:"review";
 candidate_id:string;
 expected_revision:number;
 review_status:"watching"|"investigating"|"shortlisted"|"dismissed";
 owner_note:string;
}
export interface BusinessReviewResult {
 success:true;candidate_id:string;revision:number;review_status:BusinessReviewStatus;
 replayed:boolean;production_approved:false;market_validated:false;
}
const safe=(raw:unknown):string=>String(raw??"").replace(/[\r\n]+/g," ").replace(/[\\`*_{}\[\]<>#|]/g,"\\$&");
function asMarkdown(board:BusinessBoardSnapshot):string {
 const lines=["# YorpHives Headquarters — Unified Business Opportunity Board","",
  safe(board.policy),"",
  "## Evidence connection status",""];
 for(const item of board.coverage)lines.push("- "+safe(item.name)+": "+item.state+
  " (records: "+(item.record_count??"unavailable")+") — "+safe(item.detail));
 lines.push("","## Candidates for founder investigation","",
  "Ranking is an investigation queue, not predicted demand, revenue, success rate or automatic development authorization.","");
 for(const item of board.candidates){
  lines.push("### "+safe(item.title),
   "ID: "+safe(item.candidate_id),
   "Source type: "+item.type+"; owner review: "+item.review.status+
    "; priority: "+item.investigation_priority+"/85 (investigation sequence only)",
   "Summary: "+safe(item.summary),
   "Recommended next step: "+safe(item.suggested_next_action),
   "Demand independently validated: no; release authorized: no",
   "Evidence:");
  for(const signal of item.evidence)lines.push("- "+safe(signal.label)+": "+
   (signal.value??"not measured")+" "+safe(signal.unit)+" — "+
   safe(signal.reliable_for)+"; NOT proof of "+safe(signal.not_evidence_of));
  lines.push("Missing: "+item.missing_evidence.map(safe).join("; "));
  for(const source of item.source_links)lines.push("Original source: "+safe(source.title)+" — "+safe(source.url));
  lines.push("");
 }
 return lines.join("\n");
}
function validCommand(input:unknown):input is BusinessReviewCommand{
 if(!input||typeof input!=="object"||Array.isArray(input))return false;
 const c=input as Record<string,unknown>;
 const keys=Object.keys(c);
 return keys.length===5&&keys.every(k=>["action","candidate_id","expected_revision","review_status","owner_note"].includes(k))&&
  c.action==="review"&&typeof c.candidate_id==="string"&&
  /^(?:tool|api|market|idea):[a-zA-Z0-9:_-]{2,164}$/.test(c.candidate_id)&&c.candidate_id.length<=170&&
  Number.isSafeInteger(c.expected_revision)&&Number(c.expected_revision)>=0&&Number(c.expected_revision)<=100000&&
  typeof c.review_status==="string"&&["watching","investigating","shortlisted","dismissed"].includes(c.review_status)&&
  typeof c.owner_note==="string"&&c.owner_note.length<=1000&&
  !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(c.owner_note);
}
export async function onRequestGet(context:BoardContext):Promise<Response>{
 const identity=await requireAdmin(context);
 if(isAdminResponse(identity))return identity;
 const board=await buildBusinessBoard(context.env.DB!,Boolean(context.env.HQ_TOOL_SERVICE_TOKEN_IDS));
 const url=new URL(context.request.url);
 const md=url.searchParams.get("format")==="markdown"||
  (!url.searchParams.has("format")&&(context.request.headers.get("accept")||"").includes("text/markdown"));
 if(!md){const response=adminJson(board);response.headers.set("vary","Accept");return response;}
 return new Response(asMarkdown(board),{headers:{"content-type":"text/markdown; charset=utf-8",
  "cache-control":"no-store","vary":"Accept","x-content-type-options":"nosniff",
  "referrer-policy":"no-referrer"}});
}
export async function onRequestPost(context:BoardContext):Promise<Response>{
 const identity=await requireAdmin(context);
 if(isAdminResponse(identity))return identity;
 const guard=mutationGuard(context.request);
 if(guard)return guard;
 let value:unknown;
 try{value=await readBoundedJson(context.request);}
 catch{return adminJson({error:{message:"A bounded JSON command is required."}},400);}
 if(!validCommand(value))return adminJson({error:{message:"Invalid opportunity review command."}},400);
 // Only currently evidenced, visible candidates can be triaged. A label alone
 // is not accepted as a new source or product.
 const board=await buildBusinessBoard(context.env.DB!,Boolean(context.env.HQ_TOOL_SERVICE_TOKEN_IDS));
 if(!board.candidates.some(x=>x.candidate_id===value.candidate_id))
  return adminJson({error:{message:"Candidate is not in the current source-backed board."}},404);
 const db=context.env.DB!;
 const current=await db.prepare(
  "SELECT review_status,owner_note,revision FROM hq_business_opportunity_reviews WHERE candidate_id=?"
 ).bind(value.candidate_id).first<{review_status:BusinessReviewStatus;owner_note:string;revision:number}>();
 const version=current?.revision||0;
 if(version!==value.expected_revision)return adminJson({error:{message:"The review changed. Refresh before submitting."}},409);
 if(current&&current.review_status===value.review_status&&current.owner_note===value.owner_note){
  const replay:BusinessReviewResult={success:true,candidate_id:value.candidate_id,
   revision:version,review_status:current.review_status,replayed:true,
   production_approved:false,market_validated:false};
  return adminJson(replay);
 }
 let updated:{candidate_id:string;revision:number;review_status:BusinessReviewStatus}|null;
 if(!current){
  updated=await db.prepare(
   "INSERT INTO hq_business_opportunity_reviews(candidate_id,review_status,owner_note,revision,modified_by) "+
   "VALUES (?,?,?,1,?) ON CONFLICT(candidate_id) DO NOTHING "+
   "RETURNING candidate_id,revision,review_status"
  ).bind(value.candidate_id,value.review_status,value.owner_note,identity.email)
   .first<{candidate_id:string;revision:number;review_status:BusinessReviewStatus}>();
 }else{
  updated=await db.prepare(
   "UPDATE hq_business_opportunity_reviews SET review_status=?,owner_note=?,"+
   "revision=revision+1,modified_by=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "+
   "WHERE candidate_id=? AND revision=? AND revision<100000 "+
   "RETURNING candidate_id,revision,review_status"
  ).bind(value.review_status,value.owner_note,identity.email,value.candidate_id,version)
   .first<{candidate_id:string;revision:number;review_status:BusinessReviewStatus}>();
 }
 if(!updated)return adminJson({error:{message:"Concurrent opportunity review was detected."}},409);
 const result:BusinessReviewResult={success:true,candidate_id:updated.candidate_id,
  revision:updated.revision,review_status:updated.review_status,replayed:false,
  market_validated:false,production_approved:false};
 return adminJson(result,200);
}
