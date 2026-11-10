import { authenticate, failure, hasScope, success, audit } from "../../../_lib/platform.js";
import { readJson, requestId } from "../../../_lib/http.js";

function creditPacks(env) {
  try {
    const packs = JSON.parse(env.YH_CREDIT_PACKS_JSON || "[]");
    if (!Array.isArray(packs)) return [];
    return packs.filter(pack => typeof pack.id === "string" && /^[a-z0-9_-]{2,40}$/.test(pack.id) && Number.isSafeInteger(pack.credits) && pack.credits > 0 && Number.isSafeInteger(pack.amount_minor) && pack.amount_minor > 0 && typeof pack.currency === "string" && /^[A-Z]{3}$/.test(pack.currency));
  } catch { return []; }
}

export async function onRequestPost({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return auth.response;
  if (!auth.principal) return failure("AUTHENTICATION_REQUIRED", "Supply an API credential.", 401, request);
  if (!hasScope(auth.principal, "commerce:checkout")) return failure("INSUFFICIENT_SCOPE", "This credential cannot purchase credits.", 403, request);
  if (!env.STRIPE_SECRET_KEY || !env.YH_CREDIT_PACKS_JSON) return failure("COMMERCE_NOT_CONFIGURED", "Checkout is disabled until the payment provider and server-side credit packs are configured.", 503, request);
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey || !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) return failure("IDEMPOTENCY_KEY_REQUIRED", "Provide an Idempotency-Key between 16 and 128 safe characters.", 400, request);
  const parsed = await readJson(request);
  if (!parsed.ok || !parsed.value || typeof parsed.value.pack_id !== "string") return failure("INVALID_REQUEST", "Provide pack_id in a JSON object.", 400, request);
  const pack = creditPacks(env).find(item => item.id === parsed.value.pack_id);
  if (!pack) return failure("UNKNOWN_CREDIT_PACK", "The selected credit pack is not available.", 422, request);
  const orderId = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT OR IGNORE INTO orders (id, principal_id, pack_id, credits, amount_minor, currency, status, provider, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', 'stripe', ?, ?)").bind(orderId, auth.principal.id, pack.id, pack.credits, pack.amount_minor, pack.currency, idempotencyKey, now).run();
  const order = await env.DB.prepare("SELECT * FROM orders WHERE principal_id = ? AND idempotency_key = ?").bind(auth.principal.id, idempotencyKey).first();
  if (!order || order.pack_id !== pack.id) return failure("IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different purchase.", 409, request);
  if (order.status === "paid") return success({ order_id: order.id, status: "paid", credits: order.credits });
  if (order.checkout_url) return success({ order_id: order.id, status: order.status, checkout_url: order.checkout_url });
  const origin = new URL(request.url).origin;
  const form = new URLSearchParams({
    mode: "payment",
    success_url: `${origin}/account/billing?checkout=success&order_id=${order.id}`,
    cancel_url: `${origin}/account/billing?checkout=cancelled&order_id=${order.id}`,
    client_reference_id: order.id,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": pack.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(pack.amount_minor),
    "line_items[0][price_data][product_data][name]": `${pack.credits} YorpHives credits`,
    "metadata[order_id]": order.id,
    "metadata[principal_id]": auth.principal.id
  });
  let response;
  try {
    response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `yh-order-${order.id}` },
      body: form
    });
  } catch {
    return failure("PAYMENT_PROVIDER_UNAVAILABLE", "The payment provider could not be reached. Retry using the same idempotency key.", 503, request);
  }
  const session = await response.json();
  if (!response.ok || !session.id || !session.url) {
    console.error(JSON.stringify({ event: "checkout.session_create_failed", order_id: order.id, provider_status: response.status, provider_error: session.error?.type || "unknown" }));
    return failure("CHECKOUT_CREATION_FAILED", "The payment provider could not create checkout. Retry using the same idempotency key.", 502, request);
  }
  await env.DB.prepare("UPDATE orders SET provider_session_id = ?, checkout_url = ? WHERE id = ? AND status = 'pending'").bind(session.id, session.url, order.id).run();
  await audit(env, { actorId: auth.principal.id, action: "commerce.checkout_created", targetType: "order", targetId: order.id, requestId: requestId(request), metadata: { pack_id: pack.id, currency: pack.currency, amount_minor: pack.amount_minor } });
  return success({ order_id: order.id, status: "pending", checkout_url: session.url, credits: pack.credits }, 201);
}
