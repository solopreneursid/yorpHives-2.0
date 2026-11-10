import { authenticate, failure, hasScope, success, audit, rateLimit } from "../../../_lib/platform.js";
import { readJson, requestId } from "../../../_lib/http.js";

function creditPacks(env) {
  try {
    const packs = JSON.parse(env.YH_CREDIT_PACKS_JSON || "[]");
    if (!Array.isArray(packs)) return [];
    return packs.filter(pack => typeof pack.id === "string" && /^[a-z0-9_-]{2,40}$/.test(pack.id) && Number.isSafeInteger(pack.credits) && pack.credits > 0 && Number.isSafeInteger(pack.amount_minor) && pack.amount_minor >= 10000 && typeof pack.currency === "string" && /^[A-Z]{3}$/.test(pack.currency));
  } catch { return []; }
}

async function createRazorpayPaymentLink(env, order, pack, origin) {
  const keyId = env.RAZORPAY_KEY_ID, keySecret = env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED");
  const auth = btoa(keyId + ":" + keySecret);
  const response = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: { Authorization: "Basic " + auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: pack.amount_minor, currency: pack.currency, accept_partial: false,
      description: pack.credits + " YorpHives credits",
      reference_id: order.id.slice(0, 40),
      callback_url: origin + "/account/?checkout=return&order_id=" + encodeURIComponent(order.id),
      callback_method: "get", reminder_enable: false,
      notes: { order_id: order.id, principal_id: order.principal_id, pack_id: pack.id }
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.id || !body.short_url) {
    console.error(JSON.stringify({ event: "razorpay.payment_link_create_failed", order_id: order.id, provider_status: response.status, provider_error: body.error?.code || "unknown" }));
    throw new Error("CHECKOUT_CREATION_FAILED");
  }
  return { id: body.id, url: body.short_url };
}

export async function onRequestPost({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return auth.response;
  if (!auth.principal) return failure("AUTHENTICATION_REQUIRED", "Supply an API credential.", 401, request);
  const limit = await rateLimit(request, env, auth.principal.id);
  if (!limit.ok) return limit.response;
  if (!hasScope(auth.principal, "commerce:checkout")) return failure("INSUFFICIENT_SCOPE", "This credential cannot purchase credits.", 403, request);
  const provider = env.YH_PAYMENT_PROVIDER || "disabled";
  if (!["razorpay", "stripe"].includes(provider) || !env.YH_CREDIT_PACKS_JSON) return failure("COMMERCE_NOT_CONFIGURED", "Configure a supported payment provider and server-side credit packs before enabling checkout.", 503, request);
  if (provider === "razorpay" && (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET)) return failure("COMMERCE_NOT_CONFIGURED", "Razorpay test credentials are not configured.", 503, request);
  if (provider === "stripe") return failure("PAYMENT_PROVIDER_UNAVAILABLE", "Stripe is not enabled for this India-first deployment. Configure Razorpay or another approved provider.", 503, request);
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey || !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) return failure("IDEMPOTENCY_KEY_REQUIRED", "Provide an Idempotency-Key between 16 and 128 safe characters.", 400, request);
  const parsed = await readJson(request);
  if (!parsed.ok || !parsed.value || typeof parsed.value.pack_id !== "string") return failure("INVALID_REQUEST", "Provide pack_id in a JSON object.", 400, request);
  const pack = creditPacks(env).find(item => item.id === parsed.value.pack_id);
  if (!pack) return failure("UNKNOWN_CREDIT_PACK", "The selected credit pack is unavailable or below the provider's minimum payment amount.", 422, request);
  const orderId = crypto.randomUUID(), now = new Date().toISOString();
  await env.DB.prepare("INSERT OR IGNORE INTO orders (id, principal_id, pack_id, credits, amount_minor, currency, status, provider, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)").bind(orderId, auth.principal.id, pack.id, pack.credits, pack.amount_minor, pack.currency, provider, idempotencyKey, now).run();
  const order = await env.DB.prepare("SELECT * FROM orders WHERE principal_id = ? AND idempotency_key = ?").bind(auth.principal.id, idempotencyKey).first();
  if (!order || order.pack_id !== pack.id || order.provider !== provider) return failure("IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different purchase or provider.", 409, request);
  if (order.status === "paid") return success({ order_id: order.id, status: "paid", credits: order.credits });
  if (order.status !== "pending") return failure("ORDER_NOT_PAYABLE", "This order is no longer payable. Start a new checkout with a new idempotency key.", 409, request);
  if (order.checkout_url) return success({ order_id: order.id, status: "pending", checkout_url: order.checkout_url, provider });
  try {
    const session = await createRazorpayPaymentLink(env, order, pack, new URL(request.url).origin);
    await env.DB.prepare("UPDATE orders SET provider_session_id = ?, checkout_url = ? WHERE id = ? AND status = 'pending'").bind(session.id, session.url, order.id).run();
    await audit(env, { actorId: auth.principal.id, action: "commerce.checkout_created", targetType: "order", targetId: order.id, requestId: requestId(request), metadata: { provider, pack_id: pack.id, currency: pack.currency, amount_minor: pack.amount_minor } });
    return success({ order_id: order.id, status: "pending", checkout_url: session.url, credits: pack.credits, provider }, 201);
  } catch (error) {
    const code = error.message === "PAYMENT_PROVIDER_NOT_CONFIGURED" ? "COMMERCE_NOT_CONFIGURED" : "CHECKOUT_CREATION_FAILED";
    return failure(code, "The payment provider could not create checkout. Retry using the same idempotency key.", 502, request, { retryable: true });
  }
}
