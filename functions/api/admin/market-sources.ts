import {adminJson,isAdminResponse,requireAdmin,type AdminRequestContext} from "../../_lib/admin-auth";

interface PublicMarketSignal {
 signal_key:string;provider:"wordpress_plugins"|"stackexchange_questions";
 evidence_kind:"existing_product"|"public_question";
 source_query:string;title:string;excerpt:string;source_url:string;
 published_at:string|null;public_metric_label:"active_install_band"|"question_score";
 public_metric_value:number;is_exact_metric:0|1;last_seen_at:string;
}
interface MarketRun {
 run_id:string;observed_count:number;inserted_count:number;
 recorded_at:string;warnings_json:string;
}
interface MarketSnapshot {
 sources:PublicMarketSignal[];provider_counts:Record<string,number>;
 latest_run:{run_id:string;observed_count:number;inserted_count:number;recorded_at:string;warnings:string[]}|null;
 provenance:string;limitations:string[];generated_at:string;
}
const provenance="Public software listings and community questions are evidence of existing products or expressed problems, NOT verified search demand, revenue, conversion, or AI-agent use.";
const disclaimers=[
 "WordPress active installation counts are published approximate bands, not exact usage or market size.",
 "Stack Exchange question score is public community voting, not global search volume.",
 "Sources come from a rotating, bounded daily sample, not comprehensive coverage across countries or industries.",
 "Original sources remain attributable to WordPress.org and Stack Exchange. No private user information is stored."
];
const esc=(value:unknown)=>String(value??"").replace(/[\r\n]+/g," ").replace(/[\\`*_{}\[\]<>#|]/g,"\\$&");
export async function marketSnapshot(db:NonNullable<AdminRequestContext["env"]["DB"]>):Promise<MarketSnapshot>{
 const [rows,counts,last]=await Promise.all([
  db.prepare(
   "SELECT signal_key,provider,evidence_kind,source_query,title,excerpt,source_url,published_at,"+
   "public_metric_label,public_metric_value,is_exact_metric,last_seen_at "+
   "FROM hq_public_market_signals ORDER BY last_seen_at DESC LIMIT 75"
  ).all<PublicMarketSignal>(),
  db.prepare(
   "SELECT provider,COUNT(*) AS total FROM hq_public_market_signals GROUP BY provider"
  ).all<{provider:string;total:number}>(),
  db.prepare(
   "SELECT run_id,observed_count,inserted_count,recorded_at,warnings_json "+
   "FROM hq_public_market_runs ORDER BY recorded_at DESC LIMIT 1"
  ).first<MarketRun>()
 ]);
 let run:MarketSnapshot["latest_run"]=null;
 if(last){let warnings:string[]=[];try{const items=JSON.parse(last.warnings_json);
   if(Array.isArray(items))warnings=items.slice(0,8).filter(x=>typeof x==="string");
  }catch{}
  run={run_id:last.run_id,observed_count:last.observed_count,
   inserted_count:last.inserted_count,recorded_at:last.recorded_at,warnings};
 }
 return {sources:rows.results,provider_counts:Object.fromEntries(counts.results.map(x=>[x.provider,x.total])),
  latest_run:run,provenance,limitations:disclaimers,generated_at:new Date().toISOString()};
}
export function marketResponse(request:Request,data:MarketSnapshot):Response{
 const uri=new URL(request.url);
 const markdown=uri.searchParams.get("format")==="markdown"||
  (!uri.searchParams.has("format")&&(request.headers.get("accept")||"").includes("text/markdown"));
 if(!markdown){const response=adminJson(data);response.headers.set("vary","Accept");return response;}
 const lines=["# YorpHives — existing software and public problem evidence","",
  esc(data.provenance),"",
  "Latest collection: "+(data.latest_run?.recorded_at||"Not collected"),"",
  "## Public sources"];
 for(const item of data.sources)lines.push(
  "### "+esc(item.title),
  "Provider: "+item.provider+"; signal type: "+item.evidence_kind,
  "Public metadata: "+item.public_metric_label+" = "+item.public_metric_value+
    (item.is_exact_metric?"":" (not an exact verified demand measure)"),
  "Source: "+esc(item.source_url),"");
 lines.push("## Limitations",...disclaimers.map(x=>"- "+esc(x)));
 return new Response(lines.join("\n"),{headers:{"content-type":"text/markdown; charset=utf-8",
  "cache-control":"no-store","vary":"Accept","x-content-type-options":"nosniff"}});
}
export async function onRequestGet(context:AdminRequestContext):Promise<Response>{
 const identity=await requireAdmin(context);
 if(isAdminResponse(identity))return identity;
 return marketResponse(context.request,await marketSnapshot(context.env.DB!));
}
