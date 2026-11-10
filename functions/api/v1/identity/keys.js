import { createApiSecret, sha256Hex } from "../../../_lib/security.js";
import { authenticate, failure, hasScope, success, audit, rateLimit } from "../../../_lib/platform.js";
import { readJson, requestId } from "../../../_lib/http.js";

const ALLOWED_SCOPES = new Set(["identity:read", "capability:execute", "usage:read", "credits:read", "keys:manage", "commerce:checkout", "capabilities:grant"]);

export async function onRequestGet({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return auth.response;
  if (!auth.principal) return failure("AUTHENTICATION_REQUIRED", "Supply an API credential.", 401, request);
  const limit = await rateLimit(request, env, auth.principal.id);
  if (!limit.ok) return limit.response;
  if (!hasScope(auth.principal, "keys:manage")) return failure("INSUFFICIENT_SCOPE", "This credential cannot manage API keys.", 403, request);
  const result = await env.DB.prepare("SELECT id, prefix, label, scopes_json, expires_at, revoked_at, last_used_at, created_at FROM api_keys WHERE principal_id = ? ORDER BY created_at DESC LIMIT 100").bind(auth.principal.id).all();
  return success({ keys: (result.results || []).map(key => ({ id: key.id, prefix: key.prefix, label: key.label, scopes: JSON.parse(key.scopes_json), expires_at: key.expires_at, revoked_at: key.revoked_at, last_used_at: key.last_used_at, created_at: key.created_at })) });
}

export async function onRequestPost({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return auth.response;
import { createApiSecret, sha256Hex } from "../../../_lib/security.js";
import { authenticate, failure, hasScope, success, audit, rateLimit } from "../../../_lib/platform.js";
import { readJson, requestId } from "../../../_lib/http.js";

const ALLOWED_SCOPES = new Set(["identity:read", "capability:execute", "usage:read", "credits:read", "keys:manage", "commerce:checkout", "capabilities:grant"]);

export async function onRequestGet({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return auth.response;
  if (!auth.principal) return failure("AUTHENTICATION_REQUIRED", "Supply an API credential.", 401, request);
  const limit = await rateLimit(request, env, auth.principal.id);
  if (!limit.ok) return limit.response;
  if (!hasScope(auth.principal, "keys:manage")) return failure("INSUFFICIENT_SCOPE", "This credential cannot manage API keys.", 403, request);
  const result = await env.DB.prepare("SELECT id, prefix, label, scopes_json, expires_at, revoked_at, last_used_at, created_at FROM api_keys WHERE principal_id = ? ORDER BY created_at DESC LIMIT 100").bind(auth.principal.id).all();
  return success({ keys: (result.results || []).map(key => ({ id: key.id, prefix: key.prefix, label: key.label, scopes: JSON.parse(key.scopes_json), expires_at: key.expires_at, revoked_at: key.revoked_at, last_used_at: key.last_used_at, created_at: key.created_at })) });
}

export async function onRequestPost({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return auth.response;
 return failure("INSUFFICIENT_SCOPE", "This credential cannot manage API keys.", 403, request);
  const parsed = await readJson(request);
  if (!parsed.ok || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return failure("INVALID_REQUEST", "Send a valid JSON object.", 400, request);
  const { label = "API key", scopes, expires_at: expiresAt = null } = parsed.value;
  if (typeof label !== "string" || label.trim().length < 1 || label.length > 80 || !Array.isArray(scopes) || !scopes.length || scopes.some(scope => !ALLOWED_SCOPES.has(scope) || !auth.principal.scopes.includes(scope)) || new Set(scopes).size !== scopes.length) return failure("INVALID_KEY_POLICY", "Label or requested scopes are invalid. New keys cannot exceed the caller's scopes.", 422, request);
  if (expiresAt !== null && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now())) return failure("INVALID_EXPIRY", "expires_at must be a future ISO date or null.", 422, request);
  const { secret, prefix } = createApiSecret();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO api_keys (id, principal_id, prefix, secret_hash, label, scopes_json, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, auth.principal.id, prefix, await sha256Hex(secret), label.trim(), JSON.stringify(scopes), expiresAt, now).run();
  await audit(env, { actorId: auth.principal.id, action: "api_key.created", targetType: "api_key", targetId: id, requestId: requestId(request), metadata: { scopes } });
  return success({ id, prefix, label: label.trim(), scopes, expires_at: expiresAt, secret, shown_once: true }, 201);
}

export async function onRequestDelete({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return auth.response;
  if (!auth.principal) return failure("AUTHENTICATION_REQUIRED", "Supply an API credential.", 401, request);
  const limit = await rateLimit(request, env, auth.principal.id);
  if (!limit.ok) return limit.response;
  if (!hasScope(auth.principal, "keys:manage")) return failure("INSUFFICIENT_SCOPE", "This credential cannot manage API keys.", 403, request);
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return failure("MISSING_KEY_ID", "Provide the key ID in the id query parameter.", 400, request);
  const result = await env.DB.prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND principal_id = ? AND revoked_at IS NULL").bind(new Date().toISOString(), id, auth.principal.id).run();
  if (!result.meta?.changes) return failure("KEY_NOT_FOUND", "The active API key was not found for this principal.", 404, request);
  await audit(env, { actorId: auth.principal.id, action: "api_key.revoked", targetType: "api_key", targetId: id, requestId: requestId(request) });
  return success({ id, revoked: true });
}
