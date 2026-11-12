import type {AdminD1Database} from "./admin-auth";

export type BusinessCandidateType=
 "existing_tool_route"|"private_agent_utility"|"existing_public_product"|"public_problem"|"source_backed_hypothesis";
export type BusinessReviewStatus="unreviewed"|"watching"|"investigating"|"shortlisted"|"dismissed";
export type EvidenceClass=
 "adaptive_http_requests"|"browser_reported_completion"|"signed_private_service_execution"|
 "public_software_listing"|"public_question"|"public_research_reference"|"owner_reported_validation";
export interface BusinessEvidence {
 evidence_class:EvidenceClass;
 label:string;
 value:number|null;
 unit:string;
 provenance:string;
 reliable_for:string;
 not_evidence_of:string;
 observed_at:string|null;
 source_url:string|null;
}
export interface BusinessReview {
 status:BusinessReviewStatus;
 revision:number;
 note:string;
 updated_at:string|null;
}
export interface BusinessCandidate {
 candidate_id:string;
 type:BusinessCandidateType;
 title:string;
 summary:string;
 suggested_next_action:string;
 proposed_monetization:string|null;
 investigation_priority:number;
 priority_basis:"review_ordering_not_expected_demand_or_revenue";
 evidence:BusinessEvidence[];
 missing_evidence:string[];
 source_links:{title:string;url:string}[];
 review:BusinessReview;
 independently_validated_demand:false;
 approved_for_engineering:false;
 approved_for_release:false;
}
export type SourceState="observed"|"observed_unverified"|"pending_capture"|"awaiting_collection"|
 "not_ingested"|"disabled_or_unobserved";
export interface BusinessSourceCoverage {
 id:string;name:string;state:SourceState;
 detail:string;record_count:number|null;
}
export interface BusinessBoardSnapshot {
 generated_at:string;
 candidates:BusinessCandidate[];
 coverage:BusinessSourceCoverage[];
 totals:{all:number;tool_routes:number;agent_utilities:number;public_products:number;public_problems:number;hypotheses:number};
 policy:string;
 periods:{http_start:string|null;http_end:string|null;activity_days:7};
}

interface TrafficCapture {capture_id:string;observed_start:string;observed_end:string;recorded_at:string;}
interface TrafficRow {slug:string;grouped_requests:number;}
interface ActivityRow {slug:string;channel:string;success_count:number;}
interface MarketRow {signal_key:string;title:string;excerpt:string;source_url:string;provider:string;
 evidence_kind:string;public_metric_label:string;public_metric_value:number;published_at:string|null;}
interface HypothesisRow {category_key:string;title:string;summary:string;scale:string;monetization_model:string;
 research_status:string;origin_idea_id:string|null;source_count:number;}
interface HypothesisEvidence {category_key:string;title:string;source_url:string;evidence_kind:string;}
interface ValidationRow {idea_id:string;reported_completed:number;total:number;}
interface ReviewRow {candidate_id:string;review_status:BusinessReviewStatus;owner_note:string;
 revision:number;updated_at:string;}
interface CountRow {total:number;}
const MAX_CANDIDATES=75;
const priorityBasis="review_ordering_not_expected_demand_or_revenue" as const;
const POLICY="This board ranks investigation work, not market size or probability of success. Cloudflare requests may be sampled; browser actions are self-reported; public posts and product listings are examples, not confirmed demand. No search, revenue or conversion data is fabricated. Nothing authorizes a build, spend or release.";
const missingCore=["Verified independent demand","Verified user or agent task success","Measured revenue and operating economics"];
const statusDefault:BusinessReview={status:"unreviewed",revision:0,note:"",updated_at:null};

function httpsLink(raw:string):string|null{
 try{const url=new URL(raw);return url.protocol==="https:"?url.href:null;}catch{return null;}
}
function ev(evidence_class:EvidenceClass,label:string,value:number|null,unit:string,
 provenance:string,reliable_for:string,not_evidence_of:string,observed_at:string|null=null,
 source_url:string|null=null):BusinessEvidence {
 return {evidence_class,label,value,unit,provenance,reliable_for,not_evidence_of,observed_at,
  source_url:source_url?httpsLink(source_url):null};
}
function candidate(candidate_id:string,type:BusinessCandidateType,title:string,summary:string,
 next:string,priority:number,evidence:BusinessEvidence[],
 missing:string[],source_links:{title:string;url:string}[],
 monetization:string|null=null):BusinessCandidate{
 return {candidate_id,type,title,summary,suggested_next_action:next,
  proposed_monetization:monetization,
  investigation_priority:Math.max(0,Math.min(85,priority)),priority_basis:priorityBasis,
  evidence:evidence.slice(0,8),missing_evidence:[...new Set(missing)].slice(0,8),
  source_links:source_links.slice(0,4),review:{...statusDefault},
  independently_validated_demand:false,approved_for_engineering:false,approved_for_release:false};
}
function linked(title:string,source_url:string):{title:string;url:string}|null{
 const url=httpsLink(source_url);return url?{title:String(title).slice(0,240),url}:null;
}
export async function buildBusinessBoard(db:AdminD1Database,agentConfigured=false):Promise<BusinessBoardSnapshot>{
 const [latest,activity,market,ideas,sourceRows,validation,review,referenceCount]=await Promise.all([
  db.prepare("SELECT capture_id,observed_start,observed_end,recorded_at FROM hq_traffic_captures ORDER BY capture_day DESC LIMIT 1")
   .first<TrafficCapture>(),
  db.prepare("SELECT slug,channel,SUM(success_count) AS success_count FROM hq_tool_activity_daily "+
   "WHERE activity_day>=date('now','-6 days') GROUP BY slug,channel ORDER BY success_count DESC,slug LIMIT 100")
   .all<ActivityRow>(),
  db.prepare("SELECT signal_key,title,excerpt,source_url,provider,evidence_kind,public_metric_label,"+
   "public_metric_value,published_at FROM hq_public_market_signals ORDER BY last_seen_at DESC,signal_key LIMIT 36")
   .all<MarketRow>(),
  db.prepare("SELECT c.category_key,c.title,c.summary,c.scale,c.monetization_model,c.research_status,"+
   "c.origin_idea_id,COUNT(e.source_id) AS source_count FROM hq_demand_categories c "+
   "LEFT JOIN hq_demand_evidence e ON e.category_key=c.category_key "+
   "WHERE c.origin='hypothesis' GROUP BY c.category_key "+
   "ORDER BY c.updated_at DESC LIMIT 32").all<HypothesisRow>(),
  db.prepare("SELECT e.category_key,s.title,s.source_url,e.evidence_kind FROM hq_demand_evidence e "+
   "JOIN hq_intelligence_sources s ON s.source_id=e.source_id "+
   "JOIN hq_demand_categories c ON c.category_key=e.category_key "+
   "WHERE c.origin='hypothesis' ORDER BY e.matched_at DESC LIMIT 120").all<HypothesisEvidence>(),
  db.prepare("SELECT idea_id,COUNT(*) AS total,"+
   "SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS reported_completed "+
   "FROM hq_validation_experiments GROUP BY idea_id LIMIT 100").all<ValidationRow>(),
  db.prepare("SELECT candidate_id,review_status,owner_note,revision,updated_at FROM "+
   "hq_business_opportunity_reviews ORDER BY updated_at DESC LIMIT 300").all<ReviewRow>(),
  db.prepare("SELECT COUNT(*) AS total FROM hq_demand_categories WHERE origin='reference'")
   .first<CountRow>()
 ]);
 const traffic=latest?await db.prepare(
  "SELECT slug,grouped_requests FROM hq_traffic_tool_paths WHERE capture_id=? "+
  "ORDER BY grouped_requests DESC,slug LIMIT 60"
 ).bind(latest.capture_id).all<TrafficRow>():{results:[] as TrafficRow[]};
 const record=new Map<string,{http:number|null;browser:number|null;agent:number|null}>();
 for(const row of traffic.results)record.set(row.slug,{http:row.grouped_requests,browser:null,agent:null});
 for(const row of activity.results){
  const group=record.get(row.slug)||{http:null,browser:null,agent:null};
  if(row.channel==="browser_client_reported")group.browser=row.success_count;
  if(row.channel==="access_authenticated_agent_execution")group.agent=row.success_count;
  record.set(row.slug,group);
 }
 const results:BusinessCandidate[]=[];
 const activityBrowser=activity.results.filter(x=>x.channel==="browser_client_reported");
 const activityAgent=activity.results.filter(x=>x.channel==="access_authenticated_agent_execution");
 for(const [slug,metrics] of record){
  // Agent-only tools are a different class; never pretend they're Free Tools routes.
  if(metrics.http===null&&metrics.browser===null)continue;
  const link=httpsLink("https://yorphives.com/free-tools/"+slug+"/");
  const evidence:BusinessEvidence[]=[];
  if(metrics.http!==null)evidence.push(ev("adaptive_http_requests","Observed Free Tools path requests",
   metrics.http,"sampled_grouped_http_requests","Cloudflare HTTP Requests Adaptive top-N",
   "This production route received requests during a bounded reporting period",
   "Unique users, completed tool actions, verified humans, API calls or conversions",latest?.observed_end||null,link));
  if(metrics.browser!==null)evidence.push(ev("browser_reported_completion","Reported successful tool actions",
   metrics.browser,"client_reported_events","Browser success callback, privacy-minimal D1 aggregate",
   "The browser supplied a success marker for an allowlisted tool",
   "Verified human use or independently audited task success",null,link));
  results.push(candidate("tool:"+slug,"existing_tool_route","Investigate YorpHives route: "+slug,
   "Production tool presence and usability must be reconciled against the live catalogue; a development-manifest mismatch is not proof that a product is missing.",
   metrics.http!==null?
    "Audit live functionality, real task outcomes and production inventory before optimizing the tool or adding adjacent features.":
    "Confirm whether client-reported events came from real users or staging QA, then independently test the tool and obtain Search Console evidence.",
   metrics.http!==null?62+(metrics.browser!==null?5:0):47,
   evidence,missingCore.concat([
    ...(metrics.http===null?["First-party production HTTP capture"]:[]),
    ...(metrics.browser===null?["Instrumented successful-action evidence"]:[]),
    "Search Console landing-page queries and clicks",
    "Production catalogue functionality and release status"
   ]),link?[{title:"Production route to verify",url:link}]:[]));
 }
 for(const item of activityAgent.slice(0,10)){
  const evidence=[ev("signed_private_service_execution","Private Access-authenticated tool executions",
   item.success_count,"executions","Server-executed bounded tool under separately scoped Access token",
   "A private deterministic tool ran successfully under authenticated service credentials",
   "Real external AI-agent demand, public MCP traffic, paid usage or billing")];
  results.push(candidate("api:"+item.slug,"private_agent_utility",
   "Review private agent utility: "+item.slug,
   "This is an authorized internal API operation, not proof that autonomous external agents use YorpHives.",
   "Audit scoped permissions and API task quality, then independently research external demand before commercialization.",
   49,evidence,missingCore.concat(["External agent discovery and authorized real-client usage","API unit economics"]),
   []));
 }
 for(const item of market.results){
  const product=item.evidence_kind==="existing_product";
  const kind:BusinessCandidateType=product?"existing_public_product":"public_problem";
  const link=linked(item.title,item.source_url);
  const evidence=[ev(product?"public_software_listing":"public_question",
   product?"Published existing software listing":"Public community question",
   Number(item.public_metric_value),item.public_metric_label,
   product?"WordPress.org public plugin metadata":"Stack Exchange public question metadata",
   product?"An existing named software product is publicly listed":"A public participant expressed a question",
   product?"Search volume, paying customers, revenue or install precision":
    "Representative global demand, customer intent, search volume or paid conversion",
   item.published_at,item.source_url)];
  results.push(candidate("market:"+item.signal_key,kind,
   (product?"Compare existing product: ":"Investigate expressed problem: ")+item.title,
   item.excerpt||"Public source observation. Independent commercial research is required.",
   product?
    "Compare features, maintenance costs, lawful differentiation and market competition; validate direct user needs before proposing a YorpHives equivalent.":
    "Verify this problem recurs across independent sources, user segments and regions; test a small solution before investing.",
   product?44:42,evidence,missingCore.concat(["Independent search interest","Region-specific user interviews"]),
   link?[link]:[]));
 }
 const sourceMap=new Map<string,{title:string;url:string}[]>();
 for(const item of sourceRows.results){
  const link=linked(item.title,item.source_url);
  if(!link)continue;
  const list=sourceMap.get(item.category_key)||[];
  if(list.length<3)list.push(link);
  sourceMap.set(item.category_key,list);
 }
 const validated=new Map(validation.results.map(x=>[x.idea_id,x]));
 for(const idea of ideas.results){
  const links=sourceMap.get(idea.category_key)||[];
  if(!links.length)continue;
  const tests=idea.origin_idea_id?validated.get(idea.origin_idea_id):null;
  const evidence:BusinessEvidence[]=[ev("public_research_reference","Original public research references",
   links.length,"linked_source_examples","Source-linked AI research proposal",
   "Relevant public examples exist in the research ledger",
   "Product-market fit, reliable geographic demand or correct AI synthesis",
   null,links[0]?.url||null)];
  if(tests?.reported_completed)evidence.push(ev("owner_reported_validation","Completed owner-reported experiments",
   tests.reported_completed,"owner_reported_experiments","Validation Lab manual results",
   "A founder recorded completed experiment outcomes",
   "Independently audited trials, verified customers or a production release"));
  const stage=idea.research_status;
  results.push(candidate("idea:"+idea.category_key,"source_backed_hypothesis",
   "Evaluate source-backed idea: "+idea.title,
   idea.summary||"AI hypothesis, not a validated market opportunity.",
   "Design an independent measurable experiment before engineering. Check whether an existing YorpHives product already serves this need.",
   stage==="shortlisted"?57:stage==="investigating"?48:37,
   evidence,missingCore.concat(["Verified independent research",
    "Production catalogue overlap audit","Search Console and competitor analysis"]),
   links,idea.monetization_model));
 }
 const reviewMap=new Map(review.results.map(x=>[x.candidate_id,x]));
 for(const entry of results){
  const r=reviewMap.get(entry.candidate_id);
  if(r)entry.review={status:r.review_status,revision:r.revision,note:r.owner_note,updated_at:r.updated_at};
 }
 results.sort((a,b)=>{
  const stage=(r:BusinessReviewStatus)=>r==="shortlisted"?3:r==="investigating"?2:r==="watching"?1:0;
  return stage(b.review.status)-stage(a.review.status)||
   b.investigation_priority-a.investigation_priority||a.candidate_id.localeCompare(b.candidate_id);
 });
 const coverage:BusinessSourceCoverage[]=[
  {id:"cloudflare_http",name:"Production Free Tools HTTP requests",
   state:latest?"observed":"pending_capture",
   detail:latest?"Adaptive top-N grouped HTTP requests; not unique humans or completed actions.":
    "Authorized owner capture is missing from the private Headquarters ledger.",record_count:latest?traffic.results.length:null},
  {id:"browser_completions",name:"Browser-reported successful actions",
   state:activityBrowser.length?"observed_unverified":"awaiting_collection",
   detail:"Self-reported client events may include automation or spoofed requests; QA is not excluded retrospectively.",
   record_count:activityBrowser.length},
  {id:"private_agent_execution",name:"Restricted authenticated agent API executions",
   state:activityAgent.length?"observed":agentConfigured?"awaiting_collection":"disabled_or_unobserved",
   detail:agentConfigured?"Private scoped server executions only; not public agent-market demand.":
    "Separate execution service-token credentials are not configured; current operation remains restricted.",
   record_count:activityAgent.length},
  {id:"public_market_sources",name:"Existing software and public problems",
   state:market.results.length?"observed":"awaiting_collection",
   detail:"Public listings and questions are illustrative supply or expressed concerns, not measured demand.",
   record_count:market.results.length},
  {id:"research_hypotheses",name:"Open-ended source-linked hypotheses",
   state:ideas.results.length?"observed_unverified":"awaiting_collection",
   detail:"AI hypotheses must retain original source URLs; none is independently validated.",
   record_count:ideas.results.length},
  {id:"existing_reference_categories",name:"Existing tool category reference catalogue",
   state:"observed_unverified",
   detail:"Seed examples are not a whitelist or a measured demand indicator.",
   record_count:referenceCount?.total||0},
  {id:"search_console",name:"Google Search Console queries, clicks and impressions",
   state:"not_ingested",detail:"No authenticated, verified Search Console records are ingested into Headquarters. Google connection and provider bridge required.",
   record_count:null},
  {id:"google_analytics",name:"GA4 engagement and measured conversions",
   state:"not_ingested",detail:"No authenticated GA4 page, action or transaction records are ingested into Headquarters.",
   record_count:null},
  {id:"revenue",name:"AdSense, subscriptions and paid API revenue",
   state:"not_ingested",detail:"No verified invoices, ad earnings or payment-processor events are connected. Revenue and profitability are unknown.",
   record_count:null}
 ];
 const all=results.slice(0,MAX_CANDIDATES);
 return {generated_at:new Date().toISOString(),candidates:all,coverage,
  totals:{all:all.length,tool_routes:all.filter(x=>x.type==="existing_tool_route").length,
   agent_utilities:all.filter(x=>x.type==="private_agent_utility").length,
   public_products:all.filter(x=>x.type==="existing_public_product").length,
   public_problems:all.filter(x=>x.type==="public_problem").length,
   hypotheses:all.filter(x=>x.type==="source_backed_hypothesis").length},
  policy:POLICY,
  periods:{http_start:latest?.observed_start||null,http_end:latest?.observed_end||null,activity_days:7}};
}
