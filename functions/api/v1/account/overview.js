import { requireSession } from "../../../_lib/session.js";
import { json } from "../../../_lib/http.js";
export async function onRequestGet({ request, env }) {
  const auth=await requireSession(request,env);
  if(!auth.ok)return auth.response;
  const id=auth.session.id;
  const [credits,creditEntries,usage,keys,orders,apps,agents]=await Promise.all([
    env.DB.prepare("SELECT COALESCE(SUM(delta_credits),0) AS balance FROM credits_ledger WHERE principal_id = ?").bind(id).first(),
    env.DB.prepare("SELECT id,delta_credits,entry_type,description,created_at FROM credits_ledger WHERE principal_id = ? ORDER BY created_at DESC LIMIT 50").bind(id).all(),
    env.DB.prepare("SELECT COUNT(*) AS executions, COALESCE(SUM(amount_minor),0) AS amount_minor FROM usage_ledger WHERE principal_id = ? AND created_at >= datetime('now','-30 days')").bind(id).first(),
    env.DB.prepare("SELECT id,prefix,label,scopes_json,expires_at,revoked_at,last_used_at,created_at,application_id FROM api_keys WHERE principal_id = ? ORDER BY created_at DESC LIMIT 100").bind(id).all(),
    env.DB.prepare("SELECT id,pack_id,credits,amount_minor,currency,status,provider,created_at,paid_at FROM orders WHERE principal_id = ? ORDER BY created_at DESC LIMIT 50").bind(id).all(),
    env.DB.prepare("SELECT id,name,description,status,created_at FROM applications WHERE owner_principal_id = ? ORDER BY created_at DESC").bind(id).all(),
    env.DB.prepare("SELECT a.id,a.agent_principal_id,p.display_name,a.application_id,a.scopes_json,a.daily_spending_limit_minor,a.monthly_spending_limit_minor,a.status,a.expires_at,a.created_at,a.revoked_at FROM agent_authorizations a JOIN principals p ON p.id=a.agent_principal_id WHERE a.owner_principal_id=? ORDER BY a.created_at DESC").bind(id).all()
  ]);
  const events=await env.DB.prepare("SELECT capability_id,outcome,units,amount_minor,currency,created_at FROM usage_ledger WHERE principal_id = ? ORDER BY created_at DESC LIMIT 50").bind(id).all();
  return json({data:{
    credits:{balance:credits.balance,entries:creditEntries.results||[]},
    usage:{executions:usage.executions,amount_minor:usage.amount_minor,events:events.results||[]},
    keys:(keys.results||[]).map(k=>({...k,scopes:JSON.parse(k.scopes_json),scopes_json:undefined})),
    orders:orders.results||[],applications:apps.results||[],
    agents:(agents.results||[]).map(a=>({...a,scopes:JSON.parse(a.scopes_json),scopes_json:undefined}))
  }},200,{"Cache-Control":"no-store"});
}
