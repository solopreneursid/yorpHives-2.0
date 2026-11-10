import { requireSession } from "../../../_lib/session.js";
import { json } from "../../../_lib/http.js";
export async function onRequestGet({ request, env }) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const p = auth.session;
  return json({ data: { principal: { id: p.id, kind: p.kind, display_name: p.display_name, email: p.email }, csrf_token: (await import("../../../_lib/security.js")).randomToken(24) } }, 200, { "Cache-Control": "no-store" });
}
