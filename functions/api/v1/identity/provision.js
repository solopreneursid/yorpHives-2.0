import { createApiSecret, sha256Hex, constantTimeEqual } from "../../../_lib/security.js";
import { failure, success } from "../../../_lib/platform.js";
import { readJson, requestId } from "../../../_lib/http.js";

const ALLOWED_KINDS = new Set(["human", "developer", "agent", "service"]);
const ALLOWED_SCOPES = new Set(["identity:read", "capability:execute", "usage:read", "credits:read", "keys:manage", "commerce:checkout", "capabilities:grant"]);

export async function onRequestPost({ request, env }) {
  const bootstrap = env.YH_BOOTSTRAP_SECRET;
  if (!bootstrap) return failure("PROVISIONING_DISABLED", "Set the YH_BOOTSTRAP_SECRET deployment secret before provisioning principals.", 503, request);
  if (!constantTimeEqual(request.headers.get("X-YorpHives-Bootstrap") || "", bootstrap)) {
    return failure("BOOTSTRAP_UNAUTHORIZED", "A valid bootstrap credential is required.", 401, request);
  }
  if (!env.DB) return failure("IDENTITY_UNAVAILABLE", "Identity database binding is missing.", 503, request);
  const parsed = await readJson(request);
  if (!parsed.ok || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return failure("INVALID_REQUEST", "Send a valid JSON object.", 400, request);
  const { kind, display_name: displayName, email = null, label = "Initial API key", scopes = ["identity:read", "capability:execute", "usage:read", "credits:read"], daily_spending_limit_minor: dailyLimit = 0, monthly_spending_limit_minor: monthlyLimit = 0 } = parsed.value;
  if (!ALLOWED_KINDS.has(kind) || typeof displayName !== "string" || displayName.trim().length < 2 || displayName.length > 100) return failure("INVALID_PRINCIPAL", "Provide a supported principal kind and a display name between 2 and 100 characters.", 422, request);
  if (email !== null && (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return failure("INVALID_EMAIL", "Provide a valid email address or null.", 422, request);
  if (!Array.isArray(scopes) || scopes.length === 0 || scopes.some(scope => !ALLOWED_SCOPES.has(scope)) || new Set(scopes).size !== scopes.length) return failure("INVALID_SCOPES", "Requested scopes are invalid or duplicated.", 422, request);
  if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 0 || !Number.isSafeInteger(monthlyLimit) || monthlyLimit < 0) return failure("INVALID_SPENDING_LIMIT", "Spending limits must be non-negative integer minor currency units.", 422, request);
  if (typeof label !== "string" || label.length < 1 || label.length > 80) return failure("INVALID_KEY_LABEL", "Key label must be 1 to 80 characters.", 422, request);
  const now = new Date().toISOString();
  const principalId = crypto.randomUUID();
  const keyId = crypto.randomUUID();
  const { secret, prefix } = createApiSecret();
  const hash = await sha256Hex(secret);
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO principals (id, kind, display_name, email, status, daily_spending_limit_minor, monthly_spending_limit_minor, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)").bind(principalId, kind, displayName.trim(), email, dailyLimit, monthlyLimit, now, now),
      env.DB.prepare("INSERT INTO api_keys (id, principal_id, prefix, secret_hash, label, scopes_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(keyId, principalId, prefix, hash, label.slice(0, 80), JSON.stringify(scopes), now),
      env.DB.prepare("INSERT INTO audit_events (id, actor_principal_id, action, target_type, target_id, request_id, outcome, metadata_json, created_at) VALUES (?, NULL, 'principal.provisioned', 'principal', ?, ?, 'succeeded', ?, ?)").bind(crypto.randomUUID(), principalId, requestId(request), JSON.stringify({ kind, scopes, daily_spending_limit_minor: dailyLimit, monthly_spending_limit_minor: monthlyLimit }), now)
    ]);
  } catch {
    return failure("PROVISIONING_CONFLICT", "Could not create the principal. Check for an existing email address and retry with a new request ID.", 409, request);
  }
  return success({ principal: { id: principalId, kind, display_name: displayName.trim(), email, status: "active", daily_spending_limit_minor: dailyLimit, monthly_spending_limit_minor: monthlyLimit }, api_key: { id: keyId, prefix, label, scopes, secret, shown_once: true } }, 201);
}
