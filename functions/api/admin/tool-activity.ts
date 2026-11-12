import {adminJson,isAdminResponse,requireAdmin,type AdminRequestContext} from "../../_lib/admin-auth";

interface ActivityRow {
 slug:string;channel:"browser_client_reported"|"access_authenticated_agent_execution";
 success_count:number;first_day:string;last_day:string;
}
interface ActivityTotals {
 browser_client_reported:number;access_authenticated_agent_execution:number;
}
export interface ActivitySnapshot {
 window_days:7;from_day:string;to_day:string;
 data_collected:boolean;registered_browser_tools:number;registered_agent_tools:number;
 totals:ActivityTotals;activity:ActivityRow[];
 provenance:{
  browser:"Browser client-reported successful executions; cannot independently verify human intent or tool correctness.";
  agent:"Server-executed, separately allowlisted Cloudflare Access service tool operations; not public agent traffic.";
  no_correlation:"Do not divide these event counts by sampled HTTP request groups to claim a conversion rate.";
 };
 retention:"Only date, allowlisted tool slug, channel and bounded count stored; never user content, IP, cookies, files or identity.";
}
const sources={
 browser:"Browser client-reported successful executions; cannot independently verify human intent or tool correctness.",
 agent:"Server-executed, separately allowlisted Cloudflare Access service tool operations; not public agent traffic.",
 no_correlation:"Do not divide these event counts by sampled HTTP request groups to claim a conversion rate."
} as const;
const esc=(s:unknown)=>String(s??"").replace(/[\r\n]+/g," ").replace(/[\\`*_{}\[\]<>#|]/g,"\\$&");
export async function activitySnapshot(db:NonNullable<AdminRequestContext["env"]["DB"]>):Promise<ActivitySnapshot>{
 const [summary,registered]=await Promise.all([
  db.prepare(
   "SELECT slug,channel,SUM(success_count) AS success_count,MIN(activity_day) AS first_day,MAX(activity_day) AS last_day "+
   "FROM hq_tool_activity_daily WHERE activity_day>=date('now','-6 days') "+
   "GROUP BY slug,channel ORDER BY success_count DESC,slug LIMIT 100"
  ).all<ActivityRow>(),
  db.prepare("SELECT channel,COUNT(*) AS total FROM hq_tool_activity_registry WHERE enabled=1 GROUP BY channel")
   .all<{channel:string;total:number}>()
 ]);
 const browser=summary.results.filter(x=>x.channel==="browser_client_reported");
 const agent=summary.results.filter(x=>x.channel==="access_authenticated_agent_execution");
 const now=new Date(),before=new Date(now.getTime()-6*86400000);
 return {
  window_days:7,from_day:before.toISOString().slice(0,10),to_day:now.toISOString().slice(0,10),
  data_collected:summary.results.length>0,
  registered_browser_tools:registered.results.find(x=>x.channel==="browser_client_reported")?.total||0,
  registered_agent_tools:registered.results.find(x=>x.channel==="access_authenticated_agent_execution")?.total||0,
  totals:{browser_client_reported:browser.reduce((n,x)=>n+x.success_count,0),
   access_authenticated_agent_execution:agent.reduce((n,x)=>n+x.success_count,0)},
  activity:summary.results,provenance:sources,
  retention:"Only date, allowlisted tool slug, channel and bounded count stored; never user content, IP, cookies, files or identity."
 };
}
export async function onRequestGet(context:AdminRequestContext):Promise<Response>{
 const identity=await requireAdmin(context);
 if(isAdminResponse(identity))return identity;
 const data=await activitySnapshot(context.env.DB!);
 const uri=new URL(context.request.url);
 const markdown=uri.searchParams.get("format")==="markdown"||
  (!uri.searchParams.has("format")&&(context.request.headers.get("accept")||"").includes("text/markdown"));
 if(!markdown){const res=adminJson(data);res.headers.set("vary","Accept");return res;}
 const lines=["# Headquarters — Tool Execution Evidence","",
   "Period: "+data.from_day+" to "+data.to_day,"",
   "Observed success events collected: "+data.data_collected,
   "Browser client-reported successes: "+data.totals.browser_client_reported,
   "Access-authenticated server-executed agent tools: "+data.totals.access_authenticated_agent_execution,
   "","## Metric limitations","- "+sources.browser,"- "+sources.agent,
   "- "+sources.no_correlation,"",
   "## Tool-level recorded events"];
 for(const row of data.activity)lines.push("- "+esc(row.slug)+
   " ("+row.channel+"): "+row.success_count+" recorded executions");
 lines.push("","Retention: "+data.retention);
 return new Response(lines.join("\n"),{headers:{"content-type":"text/markdown; charset=utf-8",
  "vary":"Accept","cache-control":"no-store","x-content-type-options":"nosniff"}});
}
