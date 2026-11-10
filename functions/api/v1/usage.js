import { authenticate, failure, hasScope, success, rateLimit } from "../../_lib/platform.js";

export async function onRequestGet({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return auth.response;
  if (!auth.principal) return failure("AUTHENTICATION_REQUIRED", "Supply an API credential.", 401, request);
  const rate = await rateLimit(request, env, auth.principal.id);
  if (!rate.ok) return rate.response;
  if (!hasScope(auth.principal, "usage:read")) return failure("INSUFFICIENT_SCOPE", "This credential cannot read usage.", 403, request);
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") || 50);
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.trunc(requestedLimit))) : 50;
  const rows = await env.DB.prepare("SELECT id, capability_id, capability_version, request_id, units, amount_minor, currency, outcome, created_at FROM usage_ledger WHERE principal_id = ? ORDER BY created_at DESC, id DESC LIMIT ?").bind(auth.principal.id, limit).all();
  const totals = await env.DB.prepare("SELECT COUNT(*) AS executions, COALESCE(SUM(units),0) AS units, COALESCE(SUM(amount_minor),0) AS amount_minor FROM usage_ledger WHERE principal_id = ? AND created_at >= ?").bind(auth.principal.id, new Date(Date.now() - 30 * 86400000).toISOString()).first();
  return success({ period: "last_30_days", totals, events: rows.results || [] });
}
