import { authenticate, failure, hasScope, success, audit, rateLimit } from "../../../_lib/platform.js";
import { readJson, requestId } from "../../../_lib/http.js";

export async function onRequestPost({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return auth.response;
  if (!auth.principal) return failure("AUTHENTICATION_REQUIRED", "Supply an API credential.", 401, request);
  if (!hasScope(auth.principal, "capabilities:grant")) return failure("INSUFFICIENT_SCOPE", "This credential cannot grant capabilities.", 403, request, { required_scope: "capabilities:grant" });
  const limit = await rateLimit(request, env, auth.principal.id);
  if (!limit.ok) return limit.response;
  const parsed = await readJson(request);
  if (!parsed.ok || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return failure("INVALID_REQUEST", "Send a valid JSON object.", 400, request);
  const { principal_id: principalId, capability_id: capabilityId, enabled = true, daily_unit_limit: dailyUnits = 100, daily_spending_limit_minor: dailySpend = 0, per_execution_limit_minor: perExecution = 0 } = parsed.value;
  if (typeof principalId !== "string" || typeof capabilityId !== "string" || !/^[a-z][a-z0-9.-]{1,80}$/.test(capabilityId)) return failure("INVALID_GRANT", "Provide principal_id and a valid capability_id.", 422, request);
  if (typeof enabled !== "boolean" || !Number.isSafeInteger(dailyUnits) || dailyUnits < 1 || dailyUnits > 100000 || !Number.isSafeInteger(dailySpend) || dailySpend < 0 || !Number.isSafeInteger(perExecution) || perExecution < 0 || perExecution > dailySpend) return failure("INVALID_GRANT_LIMITS", "Grant limits are invalid. Spending limits use integer minor currency units.", 422, request);
  const principal = await env.DB.prepare("SELECT id FROM principals WHERE id = ? AND status = 'active'").bind(principalId).first();
  if (!principal) return failure("PRINCIPAL_NOT_FOUND", "The target principal is not active.", 404, request);
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO capability_grants (principal_id, capability_id, enabled, daily_unit_limit, daily_spending_limit_minor, per_execution_limit_minor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(principal_id, capability_id) DO UPDATE SET enabled = excluded.enabled, daily_unit_limit = excluded.daily_unit_limit, daily_spending_limit_minor = excluded.daily_spending_limit_minor, per_execution_limit_minor = excluded.per_execution_limit_minor").bind(principalId, capabilityId, enabled ? 1 : 0, dailyUnits, dailySpend, perExecution, now).run();
  await audit(env, { actorId: auth.principal.id, action: "capability.grant.updated", targetType: "capability_grant", targetId: principalId + ":" + capabilityId, requestId: requestId(request), metadata: { enabled, daily_unit_limit: dailyUnits, daily_spending_limit_minor: dailySpend, per_execution_limit_minor: perExecution } });
  return success({ principal_id: principalId, capability_id: capabilityId, enabled, daily_unit_limit: dailyUnits, daily_spending_limit_minor: dailySpend, per_execution_limit_minor: perExecution });
}
