import { authenticate, failure, hasScope, success, rateLimit } from "../../../_lib/platform.js";

export async function onRequestGet({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return auth.response;
  if (!auth.principal) return failure("AUTHENTICATION_REQUIRED", "Supply an API credential.", 401, request);
  const rate = await rateLimit(request, env, auth.principal.id);
  if (!rate.ok) return rate.response;
  if (!hasScope(auth.principal, "commerce:orders:read")) return failure("INSUFFICIENT_SCOPE", "This credential cannot read purchase history.", 403, request, { required_scope: "commerce:orders:read" });
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") || 50);
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.trunc(requestedLimit))) : 50;
  const rows = await env.DB.prepare("SELECT id, pack_id, credits, amount_minor, currency, status, provider, created_at, paid_at FROM orders WHERE principal_id = ? ORDER BY created_at DESC, id DESC LIMIT ?").bind(auth.principal.id, limit).all();
  return success({ orders: rows.results || [] });
}
