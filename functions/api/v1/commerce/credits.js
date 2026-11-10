import { authenticate, failure, hasScope, success } from "../../../_lib/platform.js";

export async function onRequestGet({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return auth.response;
  if (!auth.principal) return failure("AUTHENTICATION_REQUIRED", "Supply an API credential.", 401, request);
  if (!hasScope(auth.principal, "credits:read")) return failure("INSUFFICIENT_SCOPE", "This credential cannot read credit balances.", 403, request);
  const balance = await env.DB.prepare("SELECT COALESCE(SUM(delta_credits), 0) AS balance FROM credits_ledger WHERE principal_id = ?").bind(auth.principal.id).first();
  const entries = await env.DB.prepare("SELECT id, delta_credits, entry_type, source_ref, description, created_at FROM credits_ledger WHERE principal_id = ? ORDER BY created_at DESC, id DESC LIMIT 50").bind(auth.principal.id).all();
  return success({ balance: balance.balance, entries: entries.results || [] });
}
