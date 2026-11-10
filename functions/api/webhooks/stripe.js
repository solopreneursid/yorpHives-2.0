import { sha256Hex, verifyStripeSignature } from "../../_lib/security.js";
import { failure, success } from "../../_lib/platform.js";
import { settleStripeSession } from "../../_lib/stripe.js";

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.STRIPE_WEBHOOK_SECRET) return failure("WEBHOOK_NOT_CONFIGURED", "Payment webhook verification is not configured.", 503, request);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 256 * 1024) return failure("PAYLOAD_TOO_LARGE", "Webhook payload exceeds 256 KB.", 413, request);
  if (!await verifyStripeSignature(raw, request.headers.get("Stripe-Signature"), env.STRIPE_WEBHOOK_SECRET)) return failure("INVALID_WEBHOOK_SIGNATURE", "Webhook signature is invalid or expired.", 400, request);
  let event;
  try { event = JSON.parse(raw); } catch { return failure("INVALID_WEBHOOK", "Webhook body must be valid JSON.", 400, request); }
  if (!event?.id || !event.type || !event.data?.object) return failure("INVALID_WEBHOOK", "Webhook event is missing required fields.", 400, request);
  const payloadHash = await sha256Hex(raw);
  if (event.type !== "checkout.session.completed") return success({ received: true, ignored: true, event_type: event.type });
  const settled = await settleStripeSession(env, { eventId: event.id, eventType: event.type, payloadHash, session: event.data.object });
  if (!settled.ok) {
    const status = settled.code === "PAYMENT_SETTLEMENT_PENDING" ? 503 : 409;
    return failure(settled.code, "The provider payment could not be matched and settled against a YorpHives order.", status, request);
  }
  return success({ received: true, settled: true, order_id: settled.orderId, credits: settled.credits });
}
