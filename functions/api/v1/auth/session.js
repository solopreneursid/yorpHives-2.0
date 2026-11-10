import { requireSession, cookieValue } from "../../../_lib/session.js";
import { sha256Hex, constantTimeEqual } from "../../../_lib/security.js";
import { json } from "../../../_lib/http.js";
export async function onRequestGet({ request, env }) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const csrf = cookieValue(request, "yh_csrf") || "";
  if (!csrf || !constantTimeEqual(await sha256Hex(csrf), auth.session.csrf_hash)) return json({ error: { code: "CSRF_COOKIE_INVALID", message: "Refresh your sign-in session." } }, 403, { "Cache-Control": "no-store" });
  return json({ data: { principal: { id: auth.session.id, kind: auth.session.kind, display_name: auth.session.display_name, email: auth.session.email }, csrf_token: csrf } }, 200, { "Cache-Control": "no-store" });
}
