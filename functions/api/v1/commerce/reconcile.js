import { constantTimeEqual, sha256Hex } from "../../../_lib/security.js";
import { audit, failure, success } from "../../../_lib/platform.js";
import { settleStripeSession } from "../../../_lib/stripe.js";

export async function onRequestPost({ request, env }) {
  if (!env.YH_COMMERCE_RECONCILE_SECRET || !constantTimeEqual(request.headers.get("X-YorpHives-Reconcile") || "", env.YH_COMMERCE_RECONCILE_SECRET)) {
    return failure("RECONCILIATION_UNAUTHORIZED", "A valid reconciliation credential is required.", 401, request);
  }
  if (!env.DB || !env.STRIPE_SECRET_KEY) return failure("RECONCILIATION_NOT_CONFIGURED", "Database and payment provider credentials are required.", 503, request);
  const pending = await env.DB.prepare("SELECT id, provider_session_id FROM orders WHERE provider = 'stripe' AND status = 'pending' AND provider_session_id IS NOT NULL ORDER BY created_at ASC LIMIT 25").all();
  const report = { checked: 0, settled: 0, expired: 0, pending: 0, errors: [] };
  for (const order of pending.results || []) {
    report.checked++;
    let response;
    try {
      response = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(order.provider_session_id), {
        headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY }
      });
    } catch {
      report.errors.push({ order_id: order.id, code: "PROVIDER_UNAVAILABLE" });
      continue;
    }
    const session = await response.json();
    if (!response.ok || !session.id) {
      report.errors.push({ order_id: order.id, code: "PROVIDER_LOOKUP_FAILED" });
      continue;
    }
    if (session.status === "expired") {
      await env.DB.prepare("UPDATE orders SET status = 'expired' WHERE id = ? AND status = 'pending'").bind(order.id).run();
      report.expired++;
      continue;
    }
    if (session.payment_status !== "paid") {
      report.pending++;
      continue;
    }
    const payloadHash = await sha256Hex(JSON.stringify(session));
    const settled = await settleStripeSession(env, {
      eventId: "reconcile_" + session.id,
      eventType: "reconciliation.checkout_session.paid",
      payloadHash,
      session
    });
    if (settled.ok) report.settled++;
    else report.errors.push({ order_id: order.id, code: settled.code });
  }
  await audit(env, { action: "commerce.reconciliation.completed", targetType: "payment_provider", targetId: "stripe", metadata: report });
  console.log(JSON.stringify({ event: "commerce.reconciliation.completed", ...report }));
  return success(report);
}
