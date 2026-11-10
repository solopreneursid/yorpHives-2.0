import { bearerToken, sha256Hex } from "./security.js";
import { errorResponse, json, requestId } from "./http.js";

const PUBLIC_CAPABILITIES = new Set(["text.analyze"]);
const DEFAULT_ANONYMOUS_LIMIT = 12;
const DEFAULT_AUTHENTICATED_LIMIT = 90;

export function database(env) {
  return env.DB || null;
}

export async function authenticate(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = bearerToken(request);
  if (!token) {
    if (header) return { ok: false, response: errorResponse("INVALID_CREDENTIAL", "Use a valid Bearer API credential.", 401, requestId(request), false) };
    return { ok: true, principal: null, apiKey: null };
  }
  const db = database(env);
  if (!db) return { ok: false, response: errorResponse("IDENTITY_UNAVAILABLE", "Identity storage is not configured.", 503, requestId(request), true) };
  const hash = await sha256Hex(token);
  const row = await db.prepare("SELECT p.id AS principal_id, p.kind, p.display_name, p.status AS principal_status, p.daily_spending_limit_minor, p.monthly_spending_limit_minor, k.id AS key_id, k.scopes_json, k.expires_at, k.revoked_at FROM api_keys k JOIN principals p ON p.id = k.principal_id WHERE k.secret_hash = ? AND k.prefix = ? LIMIT 1").bind(hash, token.slice(0, 16)).first();
  if (!row || row.principal_status !== "active" || row.revoked_at || (row.expires_at && Date.parse(row.expires_at) <= Date.now())) {
    return { ok: false, response: errorResponse("INVALID_CREDENTIAL", "The supplied API credential is invalid or inactive.", 401, requestId(request), false) };
  }
  const scopes = JSON.parse(row.scopes_json);
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)").bind(now, row.key_id, staleBefore).run();
  return { ok: true, principal: { id: row.principal_id, kind: row.kind, display_name: row.display_name, scopes, daily_spending_limit_minor: row.daily_spending_limit_minor, monthly_spending_limit_minor: row.monthly_spending_limit_minor }, apiKey: { id: row.key_id } };
}

export async function rateLimit(request, env, principalId = null) {
  const db = database(env);
  if (!db) return { ok: false, response: errorResponse("RATE_LIMIT_UNAVAILABLE", "Abuse protection is temporarily unavailable.", 503, requestId(request), true) };
  const address = request.headers.get("CF-Connecting-IP") || "unknown";
  const identity = principalId ? "principal:" + principalId : "ip:" + await sha256Hex(address);
  const bucket = await sha256Hex(identity);
  const windowSeconds = 60;
  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  const limit = principalId ? DEFAULT_AUTHENTICATED_LIMIT : DEFAULT_ANONYMOUS_LIMIT;
  const result = await db.prepare("INSERT INTO rate_limit_windows (bucket_key, window_start, request_count, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(bucket_key) DO UPDATE SET request_count = CASE WHEN rate_limit_windows.window_start = excluded.window_start THEN rate_limit_windows.request_count + 1 ELSE 1 END, window_start = excluded.window_start, updated_at = excluded.updated_at RETURNING request_count").bind(bucket, windowStart, new Date().toISOString()).first();
  if (result.request_count > limit) {
    return { ok: false, response: errorResponse("RATE_LIMITED", "Request rate limit exceeded. Retry after the current 60-second window.", 429, requestId(request), true, { limit, window_seconds: windowSeconds }) };
  }
  return { ok: true, remaining: Math.max(0, limit - result.request_count) };
}

export async function authorizeCapability(request, env, capabilityId, estimatedCostMinor = 0) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return auth;
  const rate = await rateLimit(request, env, auth.principal?.id || null);
  if (!rate.ok) return rate;
  if (auth.principal && !auth.principal.scopes.includes("capability:execute")) {
    return { ok: false, response: errorResponse("INSUFFICIENT_SCOPE", "This credential cannot execute capabilities.", 403, requestId(request), false, { required_scope: "capability:execute" }) };
  }
  if (auth.principal && !PUBLIC_CAPABILITIES.has(capabilityId)) {
    const grant = await env.DB.prepare("SELECT enabled, daily_unit_limit, daily_spending_limit_minor, per_execution_limit_minor FROM capability_grants WHERE principal_id = ? AND capability_id = ?").bind(auth.principal.id, capabilityId).first();
    if (!grant?.enabled) return { ok: false, response: errorResponse("CAPABILITY_NOT_ENTITLED", "No active grant exists for this capability.", 403, requestId(request), false, { capability_id: capabilityId }) };
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const used = await env.DB.prepare("SELECT COALESCE(SUM(units),0) AS units, COALESCE(SUM(amount_minor),0) AS amount_minor FROM usage_ledger WHERE principal_id = ? AND capability_id = ? AND created_at >= ?").bind(auth.principal.id, capabilityId, dayStart.toISOString()).first();
    if (used.units >= grant.daily_unit_limit) return { ok: false, response: errorResponse("CAPABILITY_QUOTA_EXCEEDED", "The capability daily execution quota has been reached.", 429, requestId(request), false, { daily_unit_limit: grant.daily_unit_limit }) };
    if (estimatedCostMinor > grant.per_execution_limit_minor || used.amount_minor + estimatedCostMinor > grant.daily_spending_limit_minor) return { ok: false, response: errorResponse("CAPABILITY_SPENDING_LIMIT", "The capability spending ceiling would be exceeded.", 429, requestId(request), false, { per_execution_limit_minor: grant.per_execution_limit_minor, daily_spending_limit_minor: grant.daily_spending_limit_minor }) };
  }
  if (auth.principal && estimatedCostMinor > 0) {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const monthStart = new Date(Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), 1)).toISOString();
    const spent = await env.DB.prepare("SELECT COALESCE(SUM(amount_minor),0) AS amount_minor FROM usage_ledger WHERE principal_id = ? AND created_at >= ?").bind(auth.principal.id, dayStart.toISOString()).first();
    const monthSpent = await env.DB.prepare("SELECT COALESCE(SUM(amount_minor),0) AS amount_minor FROM usage_ledger WHERE principal_id = ? AND created_at >= ?").bind(auth.principal.id, monthStart).first();
    if (auth.principal.daily_spending_limit_minor < spent.amount_minor + estimatedCostMinor || auth.principal.monthly_spending_limit_minor < monthSpent.amount_minor + estimatedCostMinor) {
      return { ok: false, response: errorResponse("SPENDING_LIMIT_REACHED", "The principal spending ceiling would be exceeded.", 429, requestId(request), false, { daily_limit_minor: auth.principal.daily_spending_limit_minor, monthly_limit_minor: auth.principal.monthly_spending_limit_minor }) };
    }
  }
  return { ok: true, principal: auth.principal, remaining: rate.remaining };
}

export async function recordUsage(env, { principalId = null, capabilityId, version, id, outcome = "succeeded", units = 1, amountMinor = 0, currency = null }) {
  if (!env.DB) throw new Error("Usage ledger is unavailable.");
  await env.DB.prepare("INSERT INTO usage_ledger (id, principal_id, capability_id, capability_version, request_id, units, amount_minor, currency, outcome, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)").bind(crypto.randomUUID(), principalId, capabilityId, version, id, units, amountMinor, currency, outcome, new Date().toISOString()).run();
}

export async function debitCredits(env, { principalId, credits, sourceRef, idempotencyKey, description }) {
  if (!Number.isSafeInteger(credits) || credits <= 0) throw new TypeError("credits must be a positive integer");
  const result = await env.DB.prepare("INSERT OR IGNORE INTO credits_ledger (id, principal_id, delta_credits, entry_type, source_ref, idempotency_key, description, created_at) SELECT ?, ?, ?, 'usage_debit', ?, ?, ?, ? WHERE COALESCE((SELECT SUM(delta_credits) FROM credits_ledger WHERE principal_id = ?), 0) >= ?").bind(crypto.randomUUID(), principalId, -credits, sourceRef, idempotencyKey, description, new Date().toISOString(), principalId, credits).run();
  return { debited: Boolean(result.meta?.changes), changes: result.meta?.changes || 0 };
}

export async function audit(env, { actorId = null, action, targetType = null, targetId = null, requestId: id = null, outcome = "succeeded", metadata = {} }) {
  await env.DB.prepare("INSERT INTO audit_events (id, actor_principal_id, action, target_type, target_id, request_id, outcome, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), actorId, action, targetType, targetId, id, outcome, JSON.stringify(metadata), new Date().toISOString()).run();
}

export function hasScope(principal, scope) {
  return Boolean(principal?.scopes?.includes(scope));
}

export function failure(code, message, status, request, details) {
  return errorResponse(code, message, status, requestId(request), false, details);
}

export function success(data, status = 200) {
  return json({ status: "ok", data }, status);
}
