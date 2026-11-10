# Operations and Deployment

## Environments

- GitHub branch `build/trust-commerce-foundation` is the isolated implementation branch.
- Cloudflare Pages project `yorphives-2-preview` is the only deployment target for this phase.
- D1 database `yorphives-2-trust-preview` is dedicated to this preview.
- The existing `yorphives.com` Pages project, DNS and PDF-processing Worker are not part of this deployment.

Never point a production environment at the preview D1 database. Create a separate production D1 database and run reviewed migrations before any production cutover.

## D1 migrations

The isolated preview database already has migrations `0001_trust_commerce.sql` and `0002_spending_limits.sql` applied and recorded in Wrangler's `d1_migrations` table. For future schema changes:

```bash
npx wrangler d1 migrations list yorphives-2-trust-preview --remote --config wrangler.toml
npx wrangler d1 migrations apply yorphives-2-trust-preview --remote --config wrangler.toml
```

Review migration SQL and target database ID before every remote apply. Never point these preview commands at a production database.

## Health and observability

- `GET /api/v1/health` verifies database connectivity, the required trust-commerce tables, and tracked migrations; it reports degraded state if any check is incomplete.
- Application events use structured JSON logs. Never log bearer credentials, bootstrap secrets, payment signatures, checkout URLs, or raw customer payloads.
- `GET /api/v1/usage` is customer-facing metering, not an operator monitoring dashboard.
- Cloudflare Workers/Pages logs and traces must be enabled and retention/alerting configured before commercial launch.

## Deployment gates

1. GitHub Actions tests pass.
2. Production asset build succeeds.
3. Migration SQL passes in an isolated D1 database.
4. Preview Pages deployment binds the preview database only.
5. Health check is green.
6. HTTP and MCP execution both pass rate-limit and ledger checks.
7. Credential provisioning, scope denial, key revocation, and webhook replay tests pass.
8. No preview secret or test credential is copied into production.

## Preview verification

After a preview deployment finishes, run the deployed integration checks from a machine with network access:

```bash
YH_BASE_URL=https://<preview-host> npm run smoke
```

The smoke test executes the free Text Intelligence capability over HTTP and MCP and therefore appends two metering rows to the selected environment's usage ledger.

## Recovery

- Code rollback must not be treated as a database rollback.
- Use D1 Time Travel or verified exports for recovery, and rehearse restore into a separate database.
- Financial ledgers are append-only. Correct mistakes with compensating entries; never edit historical rows.
- Preserve provider event IDs and order IDs for payment reconciliation.
- If payment settlement is uncertain, freeze new credit issuance and reconcile against provider state before retrying.

## Current operational gaps

Cloudflare project-level observability, alert destinations, scheduled order reconciliation, and tested backup/restore remain to be verified. GitHub push-triggered preview deployment is verified for the trust-commerce branch; production deployment automation and cutover remain intentionally separate.


## India-first customer identity and payments

The customer console is available at `/account/`. Human sign-in is passwordless email OTP. It remains unavailable until the following secrets are configured in the **preview** environment:

- `YH_EMAIL_API_KEY`: Resend API key for transactional email.
- `YH_EMAIL_FROM`: sender address on a domain verified with the email provider.

The email adapter is isolated from identity/session logic so another transactional email provider can be substituted without changing the account model. Verification codes expire after 10 minutes, are stored only as salted hashes, and have five verification attempts. Sessions use Secure, HttpOnly, SameSite cookies; state-changing browser requests require the session-bound CSRF token.

### Razorpay test-mode setup (India)

Stripe is not a launch dependency. For the first India checkout integration, use Razorpay **Test Mode** credentials from an approved Razorpay merchant account. Test Mode does not accept real money. Live acceptance requires Razorpay merchant KYC, product activation and separate live credentials.

Preview-only configuration:

- `YH_PAYMENT_PROVIDER=razorpay`
- `RAZORPAY_KEY_ID`: Test Mode key ID.
- `RAZORPAY_KEY_SECRET`: Test Mode key secret.
- `RAZORPAY_WEBHOOK_SECRET`: separate webhook signing secret configured for the preview webhook.
- `YH_CREDIT_PACKS_JSON`: server-owned pack catalogue, for example:
  `[{"id":"starter","credits":1000,"amount_minor":10000,"currency":"INR"}]`

Amounts are integer paise. The current Payment Links integration requires a minimum pack amount of INR 100. Do not place secrets in source control or client-side environment variables.

Configure the Razorpay Test Mode webhook to call:

`POST https://<preview-host>/api/v1/commerce/webhook`

Subscribe to `payment_link.paid` and use the exact `RAZORPAY_WEBHOOK_SECRET` configured in the preview environment. The receiver validates `X-Razorpay-Signature` against the raw request body before parsing, deduplicates event IDs, verifies order amount/currency/ownership, and inserts purchase credits only once. A browser redirect is never treated as proof of payment.

Before any live launch, complete successful, failed, cancelled, duplicate, forged-signature, mismatched-amount, delayed-webhook and refund scenarios. Refunds and disputes are not yet implemented in the current Razorpay adapter; do not activate live credit sales until those accounting workflows and reconciliation are reviewed.

### New D1 migration

Apply `0003_customer_identity.sql` to the dedicated preview D1 database using the normal Wrangler migration workflow before deploying the new account routes:

`npx wrangler d1 migrations apply yorphives-2-trust-preview --remote`

Confirm the migration is recorded in `d1_migrations` and verify account/session, application, agent authorization and checkout routes against the preview deployment. Never apply this migration to production without explicit release approval.
