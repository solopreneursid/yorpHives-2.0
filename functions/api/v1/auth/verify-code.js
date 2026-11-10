import { sha256Hex } from "../../../_lib/security.js";
import { rateLimit, failure, success, audit } from "../../../_lib/platform.js";
import { readJson, requestId, json } from "../../../_lib/http.js";
import { sameOrigin, issueSession, sessionCookies } from "../../../_lib/session.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return failure("ORIGIN_REJECTED", "Cross-origin requests are not accepted.", 403, request);
  const limit = await rateLimit(request, env, null);
  if (!limit.ok) return limit.response;
  const parsed = await readJson(request);
  const email = typeof parsed.value?.email === "string" ? parsed.value.email.trim().toLowerCase() : "";
  const code = typeof parsed.value?.code === "string" ? parsed.value.code.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) return failure("INVALID_VERIFICATION", "Enter the email address and six-digit code.", 422, request);
  const challenge = await env.DB.prepare("SELECT * FROM email_login_challenges WHERE email = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1").bind(email).first();
  if (!challenge || Date.parse(challenge.expires_at) <= Date.now() || challenge.attempts >= 5) return failure("CODE_EXPIRED", "The code expired or is no longer valid. Request a new code.", 401, request);
  if (await sha256Hex(challenge.salt + ":" + code) !== challenge.code_hash) {
    await env.DB.prepare("UPDATE email_login_challenges SET attempts = attempts + 1 WHERE id = ? AND consumed_at IS NULL").bind(challenge.id).run();
    return failure("INVALID_CODE", "That verification code is incorrect.", 401, request, { attempts_remaining: Math.max(0, 4 - challenge.attempts) });
  }
  const consumed = await env.DB.prepare("UPDATE email_login_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL AND attempts < 5").bind(new Date().toISOString(), challenge.id).run();
  if (!consumed.meta?.changes) return failure("CODE_ALREADY_USED", "Request a fresh sign-in code.", 409, request);
  let principal = await env.DB.prepare("SELECT id, kind, display_name, email FROM principals WHERE email = ? LIMIT 1").bind(email).first();
  if (!principal) {
    const id = crypto.randomUUID(), now = new Date().toISOString();
    const name = challenge.display_name || email.split("@")[0];
    try {
      await env.DB.prepare("INSERT INTO principals (id, kind, display_name, email, status, daily_spending_limit_minor, monthly_spending_limit_minor, created_at, updated_at) VALUES (?, 'human', ?, ?, 'active', 0, 0, ?, ?)").bind(id, name.slice(0, 100), email, now, now).run();
    } catch {
      principal = await env.DB.prepare("SELECT id, kind, display_name, email FROM principals WHERE email = ? LIMIT 1").bind(email).first();
    }
    if (!principal) principal = { id, kind: "human", display_name: name.slice(0, 100), email };
  }
  const session = await issueSession(env, principal.id);
  await audit(env, { actorId: principal.id, action: "auth.session_created", targetType: "auth_session", requestId: requestId(request), metadata: { method: "email_otp" } });
  const response = json({ data: { principal: { id: principal.id, kind: principal.kind, display_name: principal.display_name, email: principal.email }, csrf_token: session.csrf, expires_at: session.expires_at } }, 200);
  sessionCookies(session.token, session.csrf, session.max_age).forEach(value => response.headers.append("Set-Cookie", value));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
