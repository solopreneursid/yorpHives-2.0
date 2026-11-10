import { sha256Hex, randomToken, constantTimeEqual } from "./security.js";
import { json, requestId } from "./http.js";

export function cookieValue(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}
export function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}
export async function sessionPrincipal(request, env) {
  const token = cookieValue(request, "yh_session");
  if (!token || !env.DB) return null;
  const row = await env.DB.prepare("SELECT s.id AS session_id, s.csrf_hash, s.expires_at, s.revoked_at, p.id, p.kind, p.display_name, p.email, p.status FROM auth_sessions s JOIN principals p ON p.id = s.principal_id WHERE s.token_hash = ? LIMIT 1").bind(await sha256Hex(token)).first();
  if (!row || row.revoked_at || row.status !== "active" || Date.parse(row.expires_at) <= Date.now()) return null;
  return { ...row, token };
}
export async function requireSession(request, env, { csrf = false } = {}) {
  if (!sameOrigin(request)) return { ok: false, response: json({ error: { code: "ORIGIN_REJECTED", message: "Cross-origin requests are not accepted." }, request_id: requestId(request) }, 403) };
  const session = await sessionPrincipal(request, env);
  if (!session) return { ok: false, response: json({ error: { code: "SESSION_REQUIRED", message: "Sign in to continue." }, request_id: requestId(request) }, 401) };
  if (csrf) {
    const supplied = request.headers.get("X-YH-CSRF") || "";
    const cookie = cookieValue(request, "yh_csrf") || "";
    if (!supplied || !cookie || !constantTimeEqual(supplied, cookie) || !constantTimeEqual(await sha256Hex(supplied), session.csrf_hash)) return { ok: false, response: json({ error: { code: "CSRF_VALIDATION_FAILED", message: "Refresh the page and retry the request." }, request_id: requestId(request) }, 403) };
  }
  return { ok: true, session };
}
export function sessionCookies(token, csrf, maxAge) {
  return [
    "yh_session=" + token + "; Path=/api/v1; Max-Age=" + maxAge + "; HttpOnly; Secure; SameSite=Lax",
    "yh_csrf=" + csrf + "; Path=/api/v1; Max-Age=" + maxAge + "; Secure; SameSite=Strict"
  ];
}
export function clearSessionCookies() {
  return [
    "yh_session=; Path=/api/v1; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    "yh_csrf=; Path=/api/v1; Max-Age=0; Secure; SameSite=Strict"
  ];
}
export async function issueSession(env, principalId) {
  const token = randomToken(32), csrf = randomToken(24), now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare("INSERT INTO auth_sessions (id, principal_id, token_hash, csrf_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), principalId, await sha256Hex(token), await sha256Hex(csrf), expires, now.toISOString(), now.toISOString()).run();
  return { token, csrf, expires_at: expires, max_age: 604800 };
}
