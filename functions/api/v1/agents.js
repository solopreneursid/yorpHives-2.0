import { requireSession } from "../../_lib/session.js";
import { readJson, json } from "../../_lib/http.js";
import { createApiSecret, sha256Hex } from "../../_lib/security.js";
import { audit } from "../../_lib/platform.js";
const SCOPES = new Set(["identity:read","capability:execute","usage:read","credits:read","commerce:orders:read"]);
export async function onRequestGet({ request, env }) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const rows = await env.DB.prepare("SELECT a.id, a.agent_principal_id, p.display_name, a.application_id, a.scopes_json, a.daily_spending_limit_minor, a.monthly_spending_limit_minor, a.status, a.expires_at, a.created_at, a.revoked_at FROM agent_authorizations a JOIN principals p ON p.id = a.agent_principal_id WHERE a.owner_principal_id = ? ORDER BY a.created_at DESC").bind(auth.session.id).all();
  return json({ data: { agents: (rows.results || []).map(a => ({ ...a, scopes: JSON.parse(a.scopes_json), scopes_json: undefined })) } }, 200, { "Cache-Control": "no-store" });
}
export async function onRequestPost({ request, env }) {
  const auth = await requireSession(request, env, { csrf: true });
  if (!auth.ok) return auth.response;
  const parsed = await readJson(request), b = parsed.value;
  if (!parsed.ok || !b || typeof b !== "object" || typeof b.display_name !== "string" || b.display_name.trim().length < 2 || b.display_name.length > 100) return json({ error: { code: "INVALID_AGENT", message: "Provide an agent name between 2 and 100 characters." } }, 422);
  const scopes = b.scopes;
  if (!Array.isArray(scopes) || !scopes.length || scopes.some(s => !SCOPES.has(s)) || new Set(scopes).size !== scopes.length) return json({ error: { code: "INVALID_AGENT_SCOPES", message: "Agent scopes must be selected from the supported least-privilege scope list." } }, 422);
  const daily = b.daily_spending_limit_minor, monthly = b.monthly_spending_limit_minor;
  if (!Number.isSafeInteger(daily) || daily < 0 || !Number.isSafeInteger(monthly) || monthly < daily) return json({ error: { code: "INVALID_SPENDING_LIMIT", message: "Set non-negative daily and monthly limits; the monthly limit must be at least the daily limit." } }, 422);
  if (b.application_id) {
    const app = await env.DB.prepare("SELECT id FROM applications WHERE id = ? AND owner_principal_id = ? AND status = 'active'").bind(b.application_id, auth.session.id).first();
    if (!app) return json({ error: { code: "APPLICATION_NOT_FOUND", message: "The application does not belong to this account or is inactive." } }, 404);
  }
  const principalId=crypto.randomUUID(), authorizationId=crypto.randomUUID(), keyId=crypto.randomUUID(), now=new Date().toISOString();
  const {secret,prefix}=createApiSecret();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO principals (id, kind, display_name, email, status, daily_spending_limit_minor, monthly_spending_limit_minor, created_at, updated_at) VALUES (?, 'agent', ?, NULL, 'active', ?, ?, ?, ?)").bind(principalId,b.display_name.trim(),daily,monthly,now,now),
    env.DB.prepare("INSERT INTO api_keys (id, principal_id, prefix, secret_hash, label, scopes_json, created_at, application_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(keyId,principalId,prefix,await sha256Hex(secret),"Agent credential",JSON.stringify(scopes),now,b.application_id||null),
    env.DB.prepare("INSERT INTO agent_authorizations (id, owner_principal_id, agent_principal_id, application_id, scopes_json, daily_spending_limit_minor, monthly_spending_limit_minor, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(authorizationId,auth.session.id,principalId,b.application_id||null,JSON.stringify(scopes),daily,monthly,b.expires_at||null,now),
    env.DB.prepare("INSERT INTO audit_events (id, actor_principal_id, action, target_type, target_id, request_id, outcome, metadata_json, created_at) VALUES (?, ?, 'agent.authorized', 'principal', ?, ?, 'succeeded', ?, ?)").bind(crypto.randomUUID(),auth.session.id,principalId,request.headers.get("X-Request-ID"),JSON.stringify({scopes,daily_spending_limit_minor:daily,monthly_spending_limit_minor:monthly,application_id:b.application_id||null}),now)
  ]);
  await audit(env,{actorId:auth.session.id,action:"agent.credential_issued",targetType:"api_key",targetId:keyId,metadata:{agent_principal_id:principalId}});
  return json({data:{authorization_id:authorizationId,agent:{id:principalId,display_name:b.display_name.trim(),scopes,daily_spending_limit_minor:daily,monthly_spending_limit_minor:monthly,application_id:b.application_id||null},api_key:{id:keyId,prefix,secret,shown_once:true}}},201,{"Cache-Control":"no-store"});
}
export async function onRequestDelete({ request, env }) {
  const auth = await requireSession(request, env, { csrf: true });
  if (!auth.ok) return auth.response;
  const id=new URL(request.url).searchParams.get("id");
  if (!id) return json({error:{code:"MISSING_AUTHORIZATION_ID",message:"Provide the agent authorization id."}},400);
  const row=await env.DB.prepare("SELECT agent_principal_id FROM agent_authorizations WHERE id = ? AND owner_principal_id = ? AND status = 'active'").bind(id,auth.session.id).first();
  if (!row) return json({error:{code:"AGENT_NOT_FOUND",message:"No active agent authorization exists for this account."}},404);
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE agent_authorizations SET status = 'revoked', revoked_at = ? WHERE id = ? AND owner_principal_id = ? AND status = 'active'").bind(now,id,auth.session.id),
    env.DB.prepare("UPDATE principals SET status = 'suspended', updated_at = ? WHERE id = ?").bind(now,row.agent_principal_id),
    env.DB.prepare("UPDATE api_keys SET revoked_at = ? WHERE principal_id = ? AND revoked_at IS NULL").bind(now,row.agent_principal_id)
  ]);
  await audit(env,{actorId:auth.session.id,action:"agent.authorization_revoked",targetType:"principal",targetId:row.agent_principal_id});
  return json({data:{authorization_id:id,revoked:true}},200,{"Cache-Control":"no-store"});
}
