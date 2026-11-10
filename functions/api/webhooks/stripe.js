import { sha256Hex, verifyStripeSignature } from "../../_lib/security.js";
import { failure, success } from "../../_lib/platform.js";
import { readJson } from "../../_lib/http.js";

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.STRIPE_WEBHOOK_SECRET) return failure("WEBHOOK_NOT_CONFIGURED", "Payment webhook verification is not configured.", 503, request);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 256 * 1024) return failure("PAYLOAD_TOO_LARGE", "Webhook payload exceeds 256 KB.", 413, request);
  const signature = request.headers.get("Stripe-Signature");
  if (!await verifyStripeSignature(raw, signature, env.STRIPE_WEBHOOK_SECRET)) return failure("INVALID_WEBHOOK_SIGNATURE", "Webhook signature is invalid or expired.", 400, request);
  let event;
  try { event = JSON.parse(raw); } catch { return failure("INVALID_WEBHOOK", "Webhook body must be valid JSON.", 400, request); }
  if (!event?.id || !event.type || !event.data?.object) return failure("INVALID_WEBHOOK", "Webhook event is missing required fields.", 400, request);
  const payloadHash = await sha256Hex(raw);
  const now = new Date().toISOString();
  if (event.type !== "checkout.session.completed") {
    await env.DB.prepare("INSERT OR IGNORE INTO payment_events (id, provider, provider_event_id, event_type, payload_sha256, processed_at) VALUES (?, 'stripe', ?, ?, ?, ?)").bind(crypto.randomUUID(), event.id, event.type, payloadHash, now).run();
    return success({ received: true, ignored: true, event_type: event.type });
  }
  const session = event.data.object;
  const orderId = session.metadata?.order_id || session.client_reference_id;
  if (!orderId || session.payment_status !== "paid") return failure("PAYMENT_NOT_SETTLED", "Only completed, paid checkout sessions can grant credits.", 409, request);
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND provider = 'stripe'").bind(orderId).first();
  if (!order || order.provider_session_id !== session.id || order.amount_minor !== session.amount_total || order.currency.toLowerCase() !== session.currency) {
    return failure("PAYMENT_ORDER_MISMATCH", "The provider payment does not match a pending YorpHives order.", 409, request);
  }
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO payment_events (id, provider, provider_event_id, event_type, payload_sha256, processed_at) VALUES (?, 'stripe', ?, ?, ?, ?)").bind(crypto.randomUUID(), event.id, event.type, payloadHash, now),
    env.DB.prepare("INSERT OR IGNORE INTO credits_ledger (id, principal_id, delta_credits, entry_type, source_ref, description, created_at) SELECT ?, principal_id, credits, 'purchase', id, ?, ? FROM orders WHERE id = ? AND status IN ('pending','paid') AND provider_session_id = ?").bind(crypto.randomUUID(), `Purchase ${order.pack_id}`, now, orderId, session.id),
    env.DB.prepare("UPDATE orders SET status = 'paid', paid_at = COALESCE(paid_at, ?) WHERE id = ? AND status = 'pending' AND EXISTS (SELECT 1 FROM credits_ledger WHERE entry_type = 'purchase' AND source_ref = ?)").bind(now, orderId, orderId)
  ]);
  const settled = await env.DB.prepare("SELECT status, credits FROM orders WHERE id = ?").bind(orderId).first();
  if (settled?.status !== "paid") return failure("PAYMENT_SETTLEMENT_PENDING", "The payment event was received but the order could not be settled. Retry the webhook.", 503, request);
  return success({ received: true, settled: true, order_id: orderId, credits: settled.credits });
}
