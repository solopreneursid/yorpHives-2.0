// Both channels are bounded and *never* store content or visitor identifiers.
export const CHANNELS=Object.freeze({
 BROWSER:"browser_client_reported",
 AGENT:"access_authenticated_agent_execution"
});
export const MAX_DAILY_ACTIVITY=1000;
export function isAllowedSlug(slug){
 return typeof slug==="string"&&/^[a-z0-9](?:[a-z0-9-]{1,70}[a-z0-9])$/.test(slug);
}
export async function recordActivity(db,slug,channel){
 if(!isAllowedSlug(slug)||!Object.values(CHANNELS).includes(channel))
  throw new Error("Unsupported tool activity source.");
 const registered=await db.prepare(
  "SELECT enabled FROM hq_tool_activity_registry WHERE slug=? AND channel=?"
 ).bind(slug,channel).first();
 if(!registered||registered.enabled!==1) return {accepted:false,reason:"not_instrumented"};
 const saved=await db.prepare(
  "INSERT INTO hq_tool_activity_daily(activity_day,slug,channel,success_count) "+
  "VALUES (date('now'),?,?,1) "+
  "ON CONFLICT(activity_day,slug,channel) DO UPDATE SET "+
  "success_count=hq_tool_activity_daily.success_count+1,"+
  "last_recorded_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "+
  "WHERE hq_tool_activity_daily.success_count<? RETURNING success_count"
 ).bind(slug,channel,MAX_DAILY_ACTIVITY).first();
 if(!saved)return {accepted:false,reason:"daily_budget_exhausted"};
 return {accepted:true,reason:null};
}
