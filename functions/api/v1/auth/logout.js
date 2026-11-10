import { requireSession, clearSessionCookies } from "../../../_lib/session.js";
import { json } from "../../../_lib/http.js";
export async function onRequestPost({ request, env }) {
  const auth = await requireSession(request, env, { csrf: true });
  if (!auth.ok) return auth.response;
  await env.DB.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").bind(new Date().toISOString(), auth.session.session_id).run();
  const response = json({ data: { signed_out: true } }, 200, { "Cache-Control": "no-store" });
  clearSessionCookies().forEach(value => response.headers.append("Set-Cookie", value));
  return response;
}
