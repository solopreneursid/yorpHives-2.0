// Privacy-limited first-party research adapter. No cookies, IPs, user IDs,
// per-visitor events, query strings, source user agents or inferred conversions.
export const GRAPHQL_LIMIT=250;
const LIVE_HOSTS=new Set(["yorphives.com","www.yorphives.com"]);
const MAX_REQUESTS=1000000000;
export const TRAFFIC_GRAPHQL_QUERY=`query HQFreeToolsTraffic($zoneTag: String!, $start: Time!, $end: Time!) {
 viewer {
  zones(filter: {zoneTag: $zoneTag}) {
   httpRequestsAdaptiveGroups(
    filter: {
     datetime_geq: $start
     datetime_lt: $end
     requestSource: "eyeball"
     clientRequestPath_like: "/free-tools/%"
     edgeResponseStatus_geq: 200
     edgeResponseStatus_lt: 400
    }
    limit: 250
    orderBy: [count_DESC]
   ) {
    count
    dimensions { clientRequestPath clientRequestHTTPHost }
   }
  }
 }
}`;
export function normalizedToolSlug(path){
 if(typeof path!=="string"||path.length>150)return null;
 const match=/^\/free-tools\/([a-z0-9](?:[a-z0-9-]{0,70}[a-z0-9])?)\/?$/.exec(path);
 return match?match[1]:null;
}
export function normalizeTrafficPayload(payload){
 if(!payload||typeof payload!=="object")throw Error("Invalid Cloudflare Analytics response.");
 if(Array.isArray(payload.errors)&&payload.errors.length){
  throw Error("Cloudflare Analytics query rejected: "+payload.errors.slice(0,2).map(x=>String(x.message||"API error").slice(0,135)).join("; "));
 }
 const zones=payload.data?.viewer?.zones;
 if(!Array.isArray(zones)||zones.length!==1)throw Error("Analytics zone is not accessible.");
 const rows=zones[0]?.httpRequestsAdaptiveGroups;
 if(!Array.isArray(rows))throw Error("Analytics API returned no grouped-path dataset.");
 const grouped=new Map();
 let acceptedGroups=0,skippedGroups=0;
 for(const row of rows.slice(0,GRAPHQL_LIMIT)){
  const dims=row?.dimensions;
  const host=String(dims?.clientRequestHTTPHost||"").toLowerCase();
  const slug=normalizedToolSlug(dims?.clientRequestPath);
  const count=Number(row?.count);
  if(!LIVE_HOSTS.has(host)||!slug||!Number.isSafeInteger(count)||count<0||count>MAX_REQUESTS){
   skippedGroups++;continue;
  }
  grouped.set(slug,Math.min(MAX_REQUESTS,(grouped.get(slug)||0)+count));
  acceptedGroups++;
 }
 const tools=[...grouped.entries()]
  .map(([slug,count])=>({slug,path:"/free-tools/"+slug+"/",grouped_requests:count}))
  .sort((a,b)=>b.grouped_requests-a.grouped_requests||a.slug.localeCompare(b.slug));
 return {
  tools,candidate_groups:Math.min(rows.length,GRAPHQL_LIMIT),
  accepted_groups:acceptedGroups,skipped_groups:skippedGroups,
  request_count:tools.reduce((sum,tool)=>sum+tool.grouped_requests,0),
  top_n_limited:rows.length>=GRAPHQL_LIMIT
 };
}
export async function queryToolTraffic(token,zoneId,now=new Date(),send=fetch){
 if(typeof token!=="string"||token.length<10)throw Error("Cloudflare Analytics is not configured.");
 if(!/^[a-f0-9]{32}$/i.test(zoneId||""))throw Error("Invalid Cloudflare Analytics zone identifier.");
 const end=new Date(now);
 const start=new Date(end.getTime()-7*86400000);
 const response=await send("https://api.cloudflare.com/client/v4/graphql",{
  method:"POST",
  redirect:"manual",
  signal:AbortSignal.timeout(12000),
  headers:{"authorization":"Bearer "+token,"content-type":"application/json","accept":"application/json"},
  body:JSON.stringify({query:TRAFFIC_GRAPHQL_QUERY,
   variables:{zoneTag:zoneId,start:start.toISOString(),end:end.toISOString()}})
 });
 if(!response.ok)throw Error("Cloudflare Analytics returned HTTP "+response.status);
 const raw=await response.text();
 if(raw.length>500000)throw Error("Analytics response exceeded size limit.");
 const data=normalizeTrafficPayload(JSON.parse(raw));
 return {...data,start:start.toISOString(),end:end.toISOString(),
  capture_day:end.toISOString().slice(0,10)};
}
export async function saveTrafficCapture(db,observation,actor){
 const captureId=crypto.randomUUID();
 const row=await db.prepare(
  "INSERT INTO hq_traffic_captures(capture_id,capture_day,observed_start,observed_end,tool_paths,grouped_requests,candidate_groups,recorded_by) "+
  "VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(capture_day) DO NOTHING RETURNING capture_id"
 ).bind(captureId,observation.capture_day,observation.start,observation.end,
  observation.tools.length,Math.min(MAX_REQUESTS,observation.request_count),
  observation.candidate_groups,actor).first();
 if(!row?.capture_id)return {created:false,capture_id:null};
 // A capture is published only after all path rows succeed. The API does not
 // infer missing data as zero traffic for specific listed tools.
 for(const tool of observation.tools){
  await db.prepare(
   "INSERT INTO hq_traffic_tool_paths(capture_id,slug,path,grouped_requests) VALUES (?,?,?,?)"
  ).bind(captureId,tool.slug,tool.path,tool.grouped_requests).run();
 }
 return {created:true,capture_id:captureId};
}
