import {adminJson,isAdminResponse,requireAdmin,type AdminRequestContext} from "../../_lib/admin-auth";

type DecisionKind="measure_first_party"|"audit_existing_tool"|"compare_existing_software"|"investigate_public_problem"|"validate_hypothesis"|"verify_source_collection"|"measure_tool_completions"|"audit_reported_completion"|"audit_authenticated_agent_execution";
type EvidenceType="none_yet"|"first_party_http_requests"|"existing_public_software"|"public_question"|"public_research_proxy"|"browser_client_reported"|"access_authenticated_agent_execution";
export interface HeadquartersNextAction {
 id:string;kind:DecisionKind;title:string;next_step:string;why:string;
 priority:number;priority_type:"workflow_triage_not_market_demand";
 evidence_type:EvidenceType;evidence_value:number|null;evidence_unit:string;
 source_url:string|null;verified_demand:false;authorized_for_build:false;
}
export interface HeadquartersNextActionsResponse {
 recommendations:HeadquartersNextAction[];
 coverage:{traffic_capture_exists:boolean;public_market_source_count:number;
  research_hypothesis_count:number;real_user_validation_experiments:number};
 generated_at:string;disclaimer:string;
}
interface TrafficRow {slug:string;grouped_requests:number;}
interface MarketRow {signal_key:string;provider:string;evidence_kind:string;title:string;
 source_url:string;public_metric_label:string;public_metric_value:number;}
interface IdeaRow {category_key:string;title:string;research_status:string;source_count:number;}
interface ActivityRow {slug:string;channel:"browser_client_reported"|"access_authenticated_agent_execution";success_count:number;}
const DISCLAIMER="This is a read-only, deterministic investigation queue. Scores indicate work sequencing, not verified popularity, customer demand, forecast revenue, investment advice, or AI-agent adoption. No recommendation authorizes a build, spend, payment, deployment or release.";
const PRIORITY_TYPE="workflow_triage_not_market_demand" as const;
const base=(id:string,kind:DecisionKind,title:string,next_step:string,why:string,
 priority:number,evidence_type:EvidenceType,evidence_value:number|null,evidence_unit:string,
 source_url:string|null):HeadquartersNextAction=>({
 id,kind,title,next_step,why,priority,priority_type:PRIORITY_TYPE,evidence_type,
 evidence_value,evidence_unit,source_url,verified_demand:false,authorized_for_build:false
});
export async function nextActionsSnapshot(db:NonNullable<AdminRequestContext["env"]["DB"]>):Promise<HeadquartersNextActionsResponse>{
 const [latest,market,ideas,experiments,activity]=await Promise.all([
  db.prepare("SELECT capture_id FROM hq_traffic_captures ORDER BY capture_day DESC LIMIT 1")
   .first<{capture_id:string}>(),
  db.prepare("SELECT signal_key,provider,evidence_kind,title,source_url,public_metric_label,public_metric_value "+
   "FROM hq_public_market_signals ORDER BY last_seen_at DESC,signal_key LIMIT 30").all<MarketRow>(),
  db.prepare("SELECT c.category_key,c.title,c.research_status,COUNT(e.source_id) AS source_count "+
   "FROM hq_demand_categories c LEFT JOIN hq_demand_evidence e ON c.category_key=e.category_key "+
   "WHERE c.origin='hypothesis' AND c.research_status!='dismissed' "+
   "GROUP BY c.category_key ORDER BY CASE c.research_status WHEN 'shortlisted' THEN 0 WHEN 'investigating' THEN 1 ELSE 2 END,source_count DESC LIMIT 10").all<IdeaRow>(),
  db.prepare("SELECT COUNT(*) AS total FROM hq_validation_experiments WHERE status IN ('active','completed')")
   .first<{total:number}>(),
  db.prepare("SELECT slug,channel,SUM(success_count) AS success_count FROM hq_tool_activity_daily "+
   "WHERE activity_day>=date('now','-6 days') GROUP BY slug,channel "+
   "ORDER BY success_count DESC,slug LIMIT 12").all<ActivityRow>()
 ]);
 const actions:HeadquartersNextAction[]=[];
 const browserReported=activity.results.filter(r=>r.channel==="browser_client_reported");
 const authenticatedAgents=activity.results.filter(r=>r.channel==="access_authenticated_agent_execution");
 if(!browserReported.length){
  actions.push(base("measurement:tool-success","measure_tool_completions",
   "Verify successful browser-tool execution measurements",
   "After an approved release, test privacy-limited success reporting in real browsers. Do not submit sensitive file contents or fabricate activity.",
   "No client-reported tool-completion events have been recorded in this environment; missing counts are not evidence of zero product usage.",
   66,"none_yet",null,"not_measured",null));
 }else{
  for(const item of browserReported.slice(0,4))actions.push(base(
   "success:"+item.slug,"audit_reported_completion",
   "Audit client-reported completions: "+item.slug,
   "Independently test the action, verify error handling, and compare usability with real user sessions under appropriate consent; avoid computing a conversion ratio from sampled HTTP requests.",
   "These are client-side successful-action reports. They can be spoofed and do not independently prove human use.",
   57,"browser_client_reported",item.success_count,"client_reported_successes",null));
 }
 for(const item of authenticatedAgents.slice(0,2))actions.push(base(
  "agent-execution:"+item.slug,"audit_authenticated_agent_execution",
  "Review authenticated tool execution: "+item.slug,
  "Verify the calling service's permission scope, payload privacy, execution success and quota. Independently establish external agent demand before commercializing the API.",
  "A signed Access token accompanied a server-executed private tool. This proves neither autonomous-agent identity nor public market demand.",
  54,"access_authenticated_agent_execution",item.success_count,
  "access_authenticated_executions",null));

 if(!latest){
  actions.push(base("evidence:capture-first-party","measure_first_party",
   "Measure existing YorpHives Free Tools usage",
   "Capture an authorized, privacy-limited seven-day Cloudflare HTTP snapshot; then compare current production routes against the staged catalogue.",
   "No first-party Free Tools traffic capture is stored. Absence of a capture must never be represented as zero usage.",
   75,"none_yet",null,"not_measured",null));
 }else{
  const paths=await db.prepare("SELECT slug,grouped_requests FROM hq_traffic_tool_paths "+
   "WHERE capture_id=? ORDER BY grouped_requests DESC,slug LIMIT 12")
   .bind(latest.capture_id).all<TrafficRow>();
  const max=Math.max(1,...paths.results.map(x=>x.grouped_requests));
  for(const path of paths.results.slice(0,6)){
   const relative=path.grouped_requests/max;
   actions.push(base("traffic:"+path.slug,"audit_existing_tool",
    "Verify the "+path.slug+" tool experience",
    "Check that the route belongs to the production catalogue, review completed interactions, QA mobile and agent access, and measure task success before investing in expansion.",
    "Cloudflare recorded grouped HTTP requests on this route; this can be automated traffic and is not verified tool usage.",
    43+Math.min(19,Math.floor(relative*19)),"first_party_http_requests",
    path.grouped_requests,"sampled_grouped_http_requests",
    "https://yorphives.com/free-tools/"+encodeURIComponent(path.slug)+"/"));
  }
 }
 if(!market.results.length){
  actions.push(base("evidence:market-source-collection","verify_source_collection",
   "Verify independent existing-tool and user-problem sources",
   "Confirm a legitimate live WordPress.org and Stack Exchange collection in the private research Workflow; retain provider failures and links.",
   "No production public-market source records have been collected yet, so no market findings are asserted.",
   68,"none_yet",null,"not_measured",null));
 }else{
  for(const source of market.results){
   const product=source.evidence_kind==="existing_product";
   // Public install bands, votes and dates are not real user-intent conversion data.
   actions.push(base("market:"+source.signal_key,
    product?"compare_existing_software":"investigate_public_problem",
    (product?"Compare existing software: ":"Research problem: ")+source.title,
    product?"Inspect the linked existing product's scope and reviews; seek independent search queries, competitive gaps, maintenance requirements and rights before proposing a YorpHives alternative.":
     "Read the original question, determine whether the problem recurs in other communities, then interview or survey the affected audience.",
    product?"A public product listing demonstrates existing supply, not opportunity size or paying customers.":
     "A public question expresses a problem for an individual, not representative search demand.",
    product?45:42,product?"existing_public_software":"public_question",
    source.public_metric_value,source.public_metric_label,source.source_url));
  }
 }
 for(const idea of ideas.results){
  if(Number(idea.source_count)<=0)continue;
  actions.push(base("idea:"+idea.category_key,"validate_hypothesis",
   "Validate research hypothesis: "+idea.title,
   "Set an independent validation experiment with a measurable outcome in Validation Lab before engineering begins.",
   "This AI hypothesis is linked to public inspiration sources; no independent demand validation is implied.",
   idea.research_status==="shortlisted"?72:idea.research_status==="investigating"?58:39,
   "public_research_proxy",Number(idea.source_count),"linked_public_sources",null));
 }
 actions.sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
 return {recommendations:actions.slice(0,24),
  coverage:{traffic_capture_exists:!!latest,public_market_source_count:market.results.length,
   research_hypothesis_count:ideas.results.length,real_user_validation_experiments:Number(experiments?.total||0)},
  generated_at:new Date().toISOString(),disclaimer:DISCLAIMER};
}
const esc=(value:unknown)=>String(value??"").replace(/[\r\n]+/g," ").replace(/[\\`*_{}\[\]<>#|]/g,"\\$&");
export function nextActionsResponse(request:Request,data:HeadquartersNextActionsResponse):Response{
 const url=new URL(request.url),accept=request.headers.get("accept")||"";
 const markdown=url.searchParams.get("format")==="markdown"||
  (!url.searchParams.has("format")&&accept.includes("text/markdown"));
 if(!markdown){const response=adminJson(data);response.headers.set("vary","Accept");return response;}
 const lines=["# Headquarters — Evidence-Based Next Actions","",esc(data.disclaimer),"",
  "First-party capture: "+data.coverage.traffic_capture_exists,
  "Stored market-source records in this bounded sample: "+data.coverage.public_market_source_count,
  "Measured validation experiments: "+data.coverage.real_user_validation_experiments,""];
 for(const r of data.recommendations)lines.push("## "+esc(r.title),
  "Investigation sequence score: "+r.priority+" (NOT market demand)",
  "Evidence: "+r.evidence_type+"; value: "+(r.evidence_value??"unavailable")+" "+r.evidence_unit,
  "Next step: "+esc(r.next_step),
  "Why: "+esc(r.why),
  "Source: "+esc(r.source_url||"not yet available"),
  "Approved to build: no","");
 return new Response(lines.join("\n"),{headers:{
  "content-type":"text/markdown; charset=utf-8","cache-control":"no-store",
  "x-content-type-options":"nosniff","vary":"Accept"
 }});
}
export async function onRequestGet(context:AdminRequestContext):Promise<Response>{
 const identity=await requireAdmin(context);
 if(isAdminResponse(identity))return identity;
 return nextActionsResponse(context.request,await nextActionsSnapshot(context.env.DB!));
}
