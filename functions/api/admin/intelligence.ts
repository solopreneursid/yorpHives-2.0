import {adminJson,isAdminResponse,requireAdmin,type AdminRequestContext} from "../../_lib/admin-auth";
import {mutationGuard,readBoundedJson} from "../../_lib/headquarters";

interface IntelligenceSource {
 source_id:string;provider:"hn_ask"|"hn_show"|"github_repo";title:string;
 source_url:string;excerpt:string;published_at:string|null;popularity_count:number;
}
interface IdeaRow {
 idea_id:string;title:string;kind:"tool"|"app"|"platform"|"plugin"|"service"|"direction";
 audience:string;problem:string;solution:string;why_now:string;mvp:string;
 differentiation:string;validation_plan:string;monetization_hypothesis:string;
 distribution_hypothesis:string;risks:string;priority_score:number;source_count:number;
 region_scope:string;evidence_level:string;status:string;revision:number;
 created_at:string;last_seen_at:string;updated_at:string;linked_job_id:string|null;sources_json:string;
}
interface ResearchRun {
 run_id:string;trigger_source:string;status:string;source_count:number;idea_count:number;
 model_calls:number;error_summary:string|null;created_at:string;completed_at:string|null;
}
interface IdeaView extends Omit<IdeaRow,"sources_json"> {sources:IntelligenceSource[];}
interface IntelligenceSnapshot {
 ideas:IdeaView[];runs:ResearchRun[];generated_at:string;engine_available:boolean;
 source_totals:Record<string,number>;
 provenance:string;budgets:{manual_scans_per_day:number;max_model_calls_per_scan:number};
}
interface IntelligenceService {fetch(request:Request):Promise<Response>;}
interface IntelligenceContext extends AdminRequestContext {env:AdminRequestContext["env"]&{INTELLIGENCE_SERVICE?:IntelligenceService};}
interface ScanCommand {action:"scan";}
interface ReviewCommand {
 action:"shortlist"|"dismiss"|"reopen"|"create_mission";
 idea_id:string;expected_revision:number;
}
type IntelligenceCommand=ScanCommand|ReviewCommand;
interface MutationResult {
 success:true;status:string;idea_id?:string;revision?:number;job_id?:string;
 run_id?:string;workflow_id?:string;message?:string;
}
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validCommand(value:unknown):value is IntelligenceCommand {
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const v=value as Record<string,unknown>;
 if(v.action==="scan")return Object.keys(v).length===1;
 return ["shortlist","dismiss","reopen","create_mission"].includes(String(v.action))&&
   typeof v.idea_id==="string"&&ID.test(v.idea_id)&&
   typeof v.expected_revision==="number"&&Number.isSafeInteger(v.expected_revision)&&
   v.expected_revision>=0&&v.expected_revision<1000000;
}
const clean=(value:string)=>String(value).replace(/[\r\n]+/g," ").replace(/[\\`*_{}\[\]<>#|]/g,"\\$&");
async function privateEngineHealthy(service?:IntelligenceService):Promise<boolean>{
 if(!service)return false;
 try{
   const response=await service.fetch(new Request("https://hq-intelligence.internal/health",{
     method:"GET",signal:AbortSignal.timeout(5000)
   }));
   const body=await response.json().catch(()=>null) as {ready?:boolean;mode?:string}|null;
   return response.ok&&body?.ready===true&&body?.mode==="bounded_public_research";
 }catch{return false;}
}
export async function intelligenceSnapshot(db:NonNullable<IntelligenceContext["env"]["DB"]>,engineAvailable=false):Promise<IntelligenceSnapshot>{
 const [ideasResult,runsResult,totalsResult]=await Promise.all([
   db.prepare(`
     SELECT i.idea_id,i.title,i.kind,i.audience,i.problem,i.solution,i.why_now,i.mvp,
       i.differentiation,i.validation_plan,i.monetization_hypothesis,i.distribution_hypothesis,i.risks,
       i.priority_score,i.source_count,i.region_scope,i.evidence_level,i.status,i.revision,
       i.created_at,i.last_seen_at,i.updated_at,i.linked_job_id,
       COALESCE(json_group_array(json_object(
        'source_id',s.source_id,'provider',s.provider,'title',s.title,
        'source_url',s.source_url,'excerpt',s.excerpt,'published_at',s.published_at,
        'popularity_count',s.popularity_count)) FILTER(WHERE s.source_id IS NOT NULL),'[]') AS sources_json
     FROM hq_intelligence_ideas i
     LEFT JOIN hq_intelligence_evidence e ON e.idea_id=i.idea_id
     LEFT JOIN hq_intelligence_sources s ON s.source_id=e.source_id
     GROUP BY i.idea_id
     ORDER BY CASE i.status WHEN 'shortlisted' THEN 0 WHEN 'proposed' THEN 1
                 WHEN 'promoted' THEN 2 ELSE 3 END,i.priority_score DESC,i.created_at DESC LIMIT 90
   `).all<IdeaRow>(),
   db.prepare("SELECT run_id,trigger_source,status,source_count,idea_count,model_calls,error_summary,created_at,completed_at FROM hq_intelligence_runs ORDER BY created_at DESC LIMIT 12").all<ResearchRun>(),
   db.prepare("SELECT provider,COUNT(*) AS count FROM hq_intelligence_sources GROUP BY provider").all<{provider:string;count:number}>()
 ]);
 return {
  ideas:ideasResult.results.map(row=>{const {sources_json,...rest}=row;let sources:IntelligenceSource[]=[];
    try {const p=JSON.parse(sources_json);if(Array.isArray(p))sources=p.slice(0,8);}catch{}
    return {...rest,sources};}),
  runs:runsResult.results,
  source_totals:Object.fromEntries(totalsResult.results.map(r=>[r.provider,Number(r.count)||0])),
  generated_at:new Date().toISOString(),engine_available:engineAvailable,
  budgets:{manual_scans_per_day:2,max_model_calls_per_scan:1},
  provenance:"Public community discussions and open-source repositories: leads for investigation, not representative global demand or independent verification. AI proposals and income potential are unvalidated."
 };
}
export function intelligenceResponse(request:Request,snapshot:IntelligenceSnapshot):Response {
 const url=new URL(request.url);
 const markdown=url.searchParams.get("format")==="markdown"||
  (!url.searchParams.has("format")&&(request.headers.get("accept")||"").includes("text/markdown"));
 if(!markdown){const response=adminJson(snapshot);response.headers.set("vary","Accept");return response;}
 const lines=["# YorpHives Global Intelligence","",clean(snapshot.provenance),"",
  "Research engine: "+(snapshot.engine_available?"ready":"unavailable"),"",
  "## Research runs",...snapshot.runs.map(r=>"- "+clean(r.created_at)+" "+r.status+
    "; public sources="+r.source_count+"; new ideas="+r.idea_count+"; model calls="+r.model_calls),
  "","## Product and growth hypotheses",""];
 for(const idea of snapshot.ideas){
   lines.push("### "+clean(idea.title),"Type: "+idea.kind+"; priority heuristic: "+idea.priority_score+
    "/100; status: "+idea.status+"; geographic demand: "+idea.region_scope,
    "Audience: "+clean(idea.audience),"Problem hypothesis: "+clean(idea.problem),
    "Proposed solution: "+clean(idea.solution),"MVP: "+clean(idea.mvp),
    "Validation experiment: "+clean(idea.validation_plan),
    "Monetization hypothesis (unverified): "+clean(idea.monetization_hypothesis),
    "Source references (not validation):",
    ...idea.sources.map(s=>"- "+clean(s.provider)+" "+clean(s.title)+" — "+clean(s.source_url)),"");
 }
 lines.push("Generated: "+snapshot.generated_at);
 return new Response(lines.join("\n"),{headers:{"content-type":"text/markdown; charset=utf-8",
   "cache-control":"no-store","vary":"Accept","x-content-type-options":"nosniff"}});
}
export async function onRequestGet(context:IntelligenceContext):Promise<Response>{
 const identity=await requireAdmin(context);
 if(isAdminResponse(identity))return identity;
 const ready=await privateEngineHealthy(context.env.INTELLIGENCE_SERVICE);
 return intelligenceResponse(context.request,await intelligenceSnapshot(context.env.DB!,ready));
}
export async function onRequestPost(context:IntelligenceContext):Promise<Response>{
 const identity=await requireAdmin(context);
 if(isAdminResponse(identity))return identity;
 const blocked=mutationGuard(context.request);
 if(blocked)return blocked;
 let body:unknown;
 try{body=await readBoundedJson(context.request);}catch{return adminJson({error:{message:"Valid bounded JSON is required."}},400);}
 if(!validCommand(body))return adminJson({error:{message:"Unsupported discovery action or revision."}},400);
 const db=context.env.DB!;
 if(body.action==="scan"){
   const service=context.env.INTELLIGENCE_SERVICE;
   if(!service||!await privateEngineHealthy(service))
     return adminJson({error:{message:"The private Research engine is unavailable. Nothing was charged."}},503);
   try{
     const response=await service.fetch(new Request("https://hq-intelligence.internal/scans",{
       method:"POST",headers:{"content-type":"application/json"},
       body:JSON.stringify({action:"start"}),signal:AbortSignal.timeout(10000)
     }));
     const parsed=await response.json().catch(()=>null) as {run_id?:string;workflow_id?:string;error?:string;message?:string}|null;
     if(response.status!==202||!parsed?.run_id)
       return adminJson({error:{message:parsed?.error||"Research engine rejected the scan."}},response.status>=400?response.status:502);
     const result:MutationResult={success:true,status:"queued",run_id:parsed.run_id,
       workflow_id:parsed.workflow_id,message:parsed.message};
     return adminJson(result,202);
   }catch{return adminJson({error:{message:"Could not reach the private Research engine."}},503);}
 }
 if(body.action==="create_mission"){
   const jobId=crypto.randomUUID();
   const promoted=await db.prepare(`
    INSERT INTO agent_jobs(job_id,agent_id,job_type,title,request_summary,status,
      priority,created_by,origin_type,origin_ref,requires_owner_approval,evidence_json)
    SELECT ?,
      CASE WHEN kind IN ('tool','plugin','app','platform') THEN 'product-strategist'
           WHEN kind='direction' THEN 'innovation-scout' ELSE 'growth-operator' END,
      'owner_mission',substr('Validate idea: '||title,1,160),
      substr('AI-generated hypothesis (NOT validated demand): '||problem||char(10)||
       'Proposed solution: '||solution||char(10)||
       'Minimum viable product: '||mvp||char(10)||
       'Independent validation required: '||validation_plan||char(10)||
       'Monetization unverified: '||monetization_hypothesis,1,4000),
      'planned',CASE WHEN priority_score>=65 THEN 'high' ELSE 'normal' END,
      ?,'research_idea',idea_id,1,
      (SELECT COALESCE(json_group_array(json_object('kind','unverified_public_source',
       'source_id',s.source_id,'url',s.source_url,'verified',0)),'[]')
       FROM hq_intelligence_evidence e JOIN hq_intelligence_sources s ON s.source_id=e.source_id
       WHERE e.idea_id=hq_intelligence_ideas.idea_id)
    FROM hq_intelligence_ideas
    WHERE idea_id=? AND revision=? AND status IN ('proposed','shortlisted')
    ON CONFLICT DO NOTHING RETURNING job_id
   `).bind(jobId,identity.email,body.idea_id,body.expected_revision).first<{job_id:string}>();
   if(!promoted)return adminJson({error:{message:"Idea changed or already has a mission. Refresh before continuing."}},409);
   const result:MutationResult={success:true,status:"promoted",idea_id:body.idea_id,job_id:promoted.job_id,
     message:"Planned mission created. No model, release, or financial action was started."};
   return adminJson(result,201);
 }
 const status=body.action==="shortlist"?"shortlisted":body.action==="dismiss"?"dismissed":"proposed";
 const allowed=body.action==="shortlist"?"('proposed')":body.action==="dismiss"?"('proposed','shortlisted')":"('dismissed')";
 const updated=await db.prepare(
  "UPDATE hq_intelligence_ideas SET status=?,revision=revision+1,"+
  "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE idea_id=? AND revision=?"+
  " AND status IN "+allowed+" RETURNING idea_id,revision"
 ).bind(status,body.idea_id,body.expected_revision).first<{idea_id:string;revision:number}>();
 if(!updated)return adminJson({error:{message:"Idea is stale or cannot make that transition."}},409);
 const result:MutationResult={success:true,status,idea_id:updated.idea_id,revision:updated.revision};
 return adminJson(result);
}
