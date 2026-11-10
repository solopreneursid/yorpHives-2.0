import { constantTimeEqual } from "../../../_lib/security.js";
import { json } from "../../../_lib/http.js";

const encoder = new TextEncoder();
async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
function response(status, body) {
  return json(body, status, { "Cache-Control": "no-store" });
}

export async function onRequestPost({ request, env }) {
  if ((env.YH_PAYMENT_PROVIDER || "disabled") !== "razorpay" || !env.RAZORPAY_WEBHOOK_SECRET) return response(503, { error: { code: "WEBHOOK_NOT_CONFIGURED", retryable: true } });
  const raw = await request.text();
  if (raw.length > 1024 * 1024) return response(413, { error: { code: "PAYLOAD_TOO_LARGE", retryable: false } });
  const signature = request.headers.get("X-Razorpay-Signature") || "";
  if (!/^[a-f0-9]{64}$/i.test(signature)) return response(401, { error: { code: "INVALID_SIGNATURE", retryable: false } });
  const expected = await hmacHex(env.RAZORPAY_WEBHOOK_SECRET, raw);
  if (!constantTimeEqual(signature.toLowerCase(), expected)) return response(401, { error: { code: "INVALID_SIGNATURE", retryable: false } });
  let event;
  try { event = JSON.parse(raw); } catch { return response(400, { error: { code: "INVALID_JSON", retryable: false } }); }
  const eventId = request.headers.get("x-razorpay-event-id");
  if (!eventId || eventId.length > 100 || typeof event.event !== "string") return response(400, { error: { code: "INVALID_EVENT", retryable: false } });
  if (event.event !== "payment_link.paid") return response(200, { received: true, ignored: true });
  const link = event.payload?.payment_link?.entity;
  if (!link || link.status !== "paid" || typeof link.reference_id !== "string" || !Number.isSafeInteger(link.amount_paid) || !Array.isArray(link.payments)) return response(400, { error: { code: "INVALID_PAYMENT_EVENT", retryable: false } });
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND provider = 'razorpay' AND provider_session_id = ?").bind(link.notes?.order_id || link.reference_id, link.id).first();
  if (!order) return response(202, { received: true, pending_reconciliation: true });
  if (link.amount_paid !== order.amount_minor || link.currency !== order.currency || (link.notes?.principal_id && link.notes.principal_id !== order.principal_id)) {
    console.error(JSON.stringify({ event: "razorpay.payment_mismatch", order_id: order.id, event_id: eventId }));
    return response(202, { received: true, review_required: true });
  }
  const now = new Date().toISOString();
  const paymentId = link.payments[0]?.payment_id || link.id;
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO payment_events (id, provider, provider_event_id, event_type, payload_sha256, processed_at) VALUES (?, 'razorpay', ?, ?, ?, ?)").bind(crypto.randomUUID(), eventId, event.event, await (async()=>{ const d=await crypto.subtle.digest("SHA-256",encoder.encode(raw)); return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join(""); })(), now),
      env.DB.prepare("UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'pending'").bind(now, order.id),
      env.DB.prepare("INSERT OR IGNORE INTO credits_ledger (id, principal_id, delta_credits, entry_type, source_ref, idempotency_key, description, created_at) SELECT ?, ?, ?, 'purchase', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'paid')").bind(crypto.randomUUID(), order.principal_id, order.credits, order.id, "razorpay:" + paymentId, "Purchase of " + order.credits + " YorpHives credits", now, order.id)
    ]);
  } catch (error) {
    console.error(JSON.stringify({ event: "razorpay.webhook_settlement_failed", order_id: order.id, event_id: eventId }));
    return response(500, { error: { code: "SETTLEMENT_FAILED", retryable: true } });
  }
  return response(200, { received: true, order_id: order.id });
}
