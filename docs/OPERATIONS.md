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

- `GET /api/v1/health` performs a bounded database health query and reports degraded state when the binding is unavailable.
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

Cloudflare project-level observability, alert destinations, scheduled order reconciliation, tested backup/restore, and automated preview deployment from the new branch remain to be verified.
