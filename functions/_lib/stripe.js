export async function settleStripeSession(env, { eventId, eventType, payloadHash, session }) {
  const orderId = session.metadata?.order_id || session.client_reference_id;
  if (!orderId || session.payment_status !== "paid") return { ok: false, code: "PAYMENT_NOT_SETTLED" };
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND provider = 'stripe'").bind(orderId).first();
  if (!order || order.provider_session_id !== session.id || order.amount_minor !== session.amount_total || order.currency.toLowerCase() !== session.currency) {
    return { ok: false, code: "PAYMENT_ORDER_MISMATCH" };
  }
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO payment_events (id, provider, provider_event_id, event_type, payload_sha256, processed_at) VALUES (?, 'stripe', ?, ?, ?, ?)").bind(crypto.randomUUID(), eventId, eventType, payloadHash, now),
    env.DB.prepare("INSERT OR IGNORE INTO credits_ledger (id, principal_id, delta_credits, entry_type, source_ref, description, created_at) SELECT ?, principal_id, credits, 'purchase', id, ?, ? FROM orders WHERE id = ? AND status IN ('pending','paid') AND provider_session_id = ?").bind(crypto.randomUUID(), "Purchase " + order.pack_id, now, orderId, session.id),
    env.DB.prepare("UPDATE orders SET status = 'paid', paid_at = COALESCE(paid_at, ?) WHERE id = ? AND status = 'pending' AND EXISTS (SELECT 1 FROM credits_ledger WHERE entry_type = 'purchase' AND source_ref = ?)").bind(now, orderId, orderId)
  ]);
  const settled = await env.DB.prepare("SELECT status, credits FROM orders WHERE id = ?").bind(orderId).first();
  if (settled?.status !== "paid") return { ok: false, code: "PAYMENT_SETTLEMENT_PENDING" };
  return { ok: true, orderId, credits: settled.credits };
}
