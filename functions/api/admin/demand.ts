import {adminJson,isAdminResponse,requireAdmin,type AdminRequestContext} from "../../_lib/admin-auth";
import {mutationGuard,readBoundedJson} from "../../_lib/headquarters";
import {indexDemand,researchPriority} from "../../../hq-intelligence/demand.js";

type DemandStatus="watching"|"investigating"|"shortlisted"|"dismissed";
type DemandOrigin="reference"|"hypothesis";
interface DemandEvidence {
 source_id:string;provider:string;title:string;source_url:string;published_at:string|null;
 evidence_kind:"public_question"|"public_showcase"|"open_source_example";
}
interface DemandRow {
 category_key:string;title:string;summary:string;scale:string;origin:DemandOrigin;origin_idea_id:string|null;
 user_job:string;agent_job:string;monetization_model:string;implementation_risk:string;
 research_status:DemandStatus;revision:number;created_at:string;updated_at:string;
 sources_json:string;
}
export interface DemandCategory extends Omit<DemandRow,"sources_json">{
 sources:DemandEvidence[];source_count:number;research_priority:number|null;
 evidence_status:"public_interest_proxy_not_verified";
}
interface UnclassifiedSignal {
 source_id:string;title:string;provider:string;source_url:string;
 published_at:string|null;review_state:string;
}
interface DemandRun {
 refresh_id:string;trigger_source:string;source_count:number;observed_matches:number;
 added_links:number;generated_candidates:number;completed_at:string;
}
export interface DemandSnapshot {
 opportunities:DemandCategory[];unclassified_sources:UnclassifiedSignal[];
 latest_refresh:DemandRun|null;category_ceiling:false;provenance:string;
 generated_at:string;
}
interface RefreshCommand {action:"refresh";}
interface TriageCommand {
 action:"investigate"|"shortlist"|"dismiss"|"reopen";
 category_key:string;expected_revision:number;
}
type DemandCommand=RefreshCommand|TriageCommand;
interface DemandMutationResponse {
 success:true;action:DemandCommand["action"];category_key?:string;
 status?:DemandStatus;revision?:number;source_count?:number;added_links?:number;
 generated_candidates?:number;ai_calls:0;searches_performed:0;
}
const escapeMarkdown=(value:unknown):string=>
 String(value??"").replace(/[\r\n]+/g," ").replace(/[\\`*_{}\[\]<>#|]/g,"\\$&");
function validCommand(input:unknown):input is DemandCommand {
 if(!input||Array.isArray(input)||typeof input!=="object")return false;
 const value=input as Record<string,unknown>;
 if(value.action==="refresh")return Object.keys(value).length===1;
 return ["investigate","shortlist","dismiss","reopen"].includes(String(value.action))&&
  typeof value.category_key==="string"&&/^[a-z0-9:_-]{2,100}$/.test(value.category_key)&&
  typeof value.expected_revision==="number"&&Number.isSafeInteger(value.expected_revision)&&
  value.expected_revision>=0&&value.expected_revision<=100000;
}
export async function demandSnapshot(db:NonNullable<AdminRequestContext["env"]["DB"]>):Promise<DemandSnapshot> {
 const [rows,unclassified,latest]=await Promise.all([
  db.prepare(`
   SELECT c.category_key,c.title,c.summary,c.scale,c.origin,c.origin_idea_id,c.user_job,
    c.agent_job,c.monetization_model,c.implementation_risk,c.research_status,
    c.revision,c.created_at,c.updated_at,
    COALESCE(json_group_array(json_object('source_id',s.source_id,'provider',s.provider,
     'title',s.title,'source_url',s.source_url,'published_at',s.published_at,
     'evidence_kind',e.evidence_kind)) FILTER(WHERE s.source_id IS NOT NULL),'[]') AS sources_json
   FROM hq_demand_categories c
   LEFT JOIN hq_demand_evidence e ON e.category_key=c.category_key
   LEFT JOIN hq_intelligence_sources s ON s.source_id=e.source_id
   GROUP BY c.category_key
   ORDER BY CASE c.research_status WHEN 'shortlisted' THEN 0 WHEN 'investigating' THEN 1
       WHEN 'watching' THEN 2 ELSE 3 END,c.origin DESC,c.updated_at DESC
   LIMIT 150
  `).all<DemandRow>(),
  db.prepare(`
   SELECT s.source_id,s.title,s.provider,s.source_url,s.published_at,u.review_state
   FROM hq_demand_unclassified_sources u
   JOIN hq_intelligence_sources s ON s.source_id=u.source_id
   ORDER BY u.last_detected_at DESC LIMIT 30
  `).all<UnclassifiedSignal>(),
  db.prepare(
   "SELECT refresh_id,trigger_source,source_count,observed_matches,added_links,"+
   "generated_candidates,completed_at FROM hq_demand_refresh_runs "+
   "ORDER BY completed_at DESC LIMIT 1"
  ).first<DemandRun>()
 ]);
 return {opportunities:rows.results.map(row=>{
   const {sources_json,...other}=row;
   let sources:DemandEvidence[]=[];
   try{const parsed=JSON.parse(sources_json);if(Array.isArray(parsed))sources=parsed.slice(0,30);}catch{}
   return {...other,sources,source_count:sources.length,research_priority:researchPriority(sources),
    evidence_status:"public_interest_proxy_not_verified" as const};
  }),unclassified_sources:unclassified.results,latest_refresh:latest,
  category_ceiling:false,generated_at:new Date().toISOString(),
  provenance:"Open-ended opportunity taxonomy. Reference categories are examples, not limits. Hypotheses may span any lawful technology, industry, location, business model or emerging format. Original public posts and repositories are unverified interest proxies, not search traffic, agent usage, revenue, or market validation."
 };
}
export function demandResponse(request:Request,data:DemandSnapshot):Response {
 const url=new URL(request.url);
 const markdown=url.searchParams.get("format")==="markdown"||
  (!url.searchParams.has("format")&&(request.headers.get("accept")||"").includes("text/markdown"));
 if(!markdown){const response=adminJson(data);response.headers.set("vary","Accept");return response;}
 const lines=["# YorpHives — Open-Ended Tool & Market Demand","",
  escapeMarkdown(data.provenance),"",
  "## Investigate these categories and hypotheses",""];
 for(const item of data.opportunities) {
  lines.push("### "+escapeMarkdown(item.title),
   "Origin: "+item.origin+"; format: "+item.scale+"; founder triage: "+item.research_status,
   "Research priority (not search volume): "+(item.research_priority??"insufficient observations"),
   "User job: "+escapeMarkdown(item.user_job),
   "Agent utility: "+escapeMarkdown(item.agent_job),
   "Monetization hypothesis: "+escapeMarkdown(item.monetization_model),
   "Observed public sources (not verified demand):",
   ...item.sources.map(s=>"- "+escapeMarkdown(s.evidence_kind)+" "+escapeMarkdown(s.title)+" — "+escapeMarkdown(s.source_url)),"");
 }
 lines.push("## Unclassified signals","",
  "Unmatched sources are retained; the current taxonomy never excludes a new industry or technology.",
  ...data.unclassified_sources.map(s=>"- "+escapeMarkdown(s.title)+" — "+escapeMarkdown(s.source_url)),
  "","Generated: "+data.generated_at);
 return new Response(lines.join("\n"),{headers:{"content-type":"text/markdown; charset=utf-8",
  "vary":"Accept","cache-control":"no-store","x-content-type-options":"nosniff"}});
}
export async function onRequestGet(context:AdminRequestContext):Promise<Response>{
 const identity=await requireAdmin(context);
 if(isAdminResponse(identity))return identity;
 return demandResponse(context.request,await demandSnapshot(context.env.DB!));
}
export async function onRequestPost(context:AdminRequestContext):Promise<Response>{
 const identity=await requireAdmin(context);
 if(isAdminResponse(identity))return identity;
 const guard=mutationGuard(context.request);
 if(guard)return guard;
 let command:unknown;
 try{command=await readBoundedJson(context.request);}
 catch{return adminJson({error:{message:"Valid bounded JSON is required."}},400);}
 if(!validCommand(command))return adminJson({error:{message:"Invalid demand discovery action."}},400);
 const db=context.env.DB!;
 if(command.action==="refresh"){
   const stored=await db.prepare(
    "SELECT source_id,provider,title,excerpt,published_at FROM hq_intelligence_sources "+
    "ORDER BY last_seen_at DESC LIMIT 150"
   ).all<{source_id:string;provider:string;title:string;excerpt:string;published_at:string|null}>();
   try{
    const receipt=await indexDemand(db,stored.results,"owner");
    const result:DemandMutationResponse={success:true,action:"refresh",source_count:receipt.source_count,
     added_links:receipt.added_links,generated_candidates:receipt.generated_candidates,
     ai_calls:0,searches_performed:0};
    return adminJson(result);
   }catch{return adminJson({error:{message:"Stored-source indexing failed; existing research remains intact."}},503);}
 }
 const newStatus=command.action==="investigate"?"investigating":
  command.action==="shortlist"?"shortlisted":
  command.action==="dismiss"?"dismissed":"watching";
 const allowed=command.action==="investigate"?"('watching')":
  command.action==="shortlist"?"('watching','investigating')":
  command.action==="dismiss"?"('watching','investigating','shortlisted')":"('dismissed')";
 const changed=await db.prepare(
  "UPDATE hq_demand_categories SET research_status=?,revision=revision+1,modified_by=?,"+
  "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "+
  "WHERE category_key=? AND revision=? AND research_status IN "+allowed+
  " RETURNING category_key,revision"
 ).bind(newStatus,identity.email,command.category_key,command.expected_revision)
  .first<{category_key:string;revision:number}>();
 if(!changed)return adminJson({error:{message:"Category changed or cannot transition. Refresh first."}},409);
 const result:DemandMutationResponse={success:true,action:command.action,
  category_key:changed.category_key,status:newStatus,revision:changed.revision,ai_calls:0,searches_performed:0};
 return adminJson(result);
}
