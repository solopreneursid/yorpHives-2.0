import { requireSession } from "../../_lib/session.js";
import { readJson, json } from "../../_lib/http.js";
export async function onRequestGet({ request, env }) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const rows = await env.DB.prepare("SELECT id, name, description, status, created_at, updated_at FROM applications WHERE owner_principal_id = ? ORDER BY created_at DESC").bind(auth.session.id).all();
  return json({ data: { applications: rows.results || [] } }, 200, { "Cache-Control": "no-store" });
}
export async function onRequestPost({ request, env }) {
  const auth = await requireSession(request, env, { csrf: true });
  if (!auth.ok) return auth.response;
  const parsed = await readJson(request), body = parsed.value;
  if (!parsed.ok || !body || typeof body !== "object" || typeof body.name !== "string" || body.name.trim().length < 2 || body.name.length > 80 || (body.description !== undefined && (typeof body.description !== "string" || body.description.length > 500))) return json({ error: { code: "INVALID_APPLICATION", message: "Provide an application name (2–80 characters) and optional description (up to 500 characters)." } }, 422);
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO applications (id, owner_principal_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, auth.session.id, body.name.trim(), (body.description || "").trim(), now, now).run();
  return json({ data: { id, name: body.name.trim(), description: (body.description || "").trim(), status: "active", created_at: now } }, 201, { "Cache-Control": "no-store" });
}
