# Commerce and Revenue Infrastructure

## Principles

1. Prices and credit quantities are selected only from server-side configuration; clients never submit the amount to charge.
2. Checkout creation requires an authenticated principal, `commerce:checkout`, and an idempotency key.
3. A provider redirect is not proof of payment. Credits are issued only after a verified provider webhook confirms a paid checkout session.
4. Every payment event and credit movement is immutable and auditable.
5. The payment provider is an adapter. Orders, credit packs, ledger entries, and entitlements are YorpHives domain concepts.

## Current implementation

- Stripe Checkout Session adapter at `POST /api/v1/commerce/checkout`.
- Signed webhook verification at `POST /api/webhooks/stripe`, including timestamp tolerance.
- Server-controlled pack list via `YH_CREDIT_PACKS_JSON`.
- Payment-event deduplication and append-only credits ledger.
- Credit balance derived from ledger entries, not a mutable balance field.
- Usage history and credit balance endpoints.
- Orders are idempotent per principal and client-supplied idempotency key.

## Required runtime configuration

Set these only on the isolated preview environment first:

- `STRIPE_SECRET_KEY` — encrypted provider secret.
- `STRIPE_WEBHOOK_SECRET` — encrypted signing secret for the exact webhook endpoint.
- `YH_CREDIT_PACKS_JSON` — non-secret server-side pack catalog, e.g. an array of objects containing `id`, `credits`, `amount_minor`, and uppercase ISO `currency`.

No live pricing has been selected or activated. Keep checkout disabled until the business has chosen prices, tax treatment, refund policy, consumer disclosures, and the provider account's legal/business setup.

## Webhook setup

Configure Stripe to send `checkout.session.completed` events to `/api/webhooks/stripe`. The webhook validates the signature over the exact raw body, enforces a five-minute timestamp tolerance, matches provider session ID, amount and currency to the stored order, and credits the account at most once.

A provider event with a non-paid checkout session is rejected. A duplicate event is safely acknowledged without duplicate credits.

## Reconciliation still required before taking live money

- Scheduled reconciliation against Stripe's API for pending/paid/refunded orders.
- Refund and dispute event handling.
- Failed/expired checkout cleanup.
- Tax calculation and compliant invoices/receipts for each launch market.
- Provider payout and fee reconciliation.
- Chargeback and negative-balance policy.
- Customer support and refund operations.
- Independent webhook replay and concurrency tests.

Do not activate live checkout until these gates pass. Use test-mode provider credentials for integration tests.
