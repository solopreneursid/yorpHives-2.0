# Security and Trust Baseline

## Current public surface

The first public capability, `text.analyze@1.0.0`, is deterministic, read-only, free, and processes text in memory. It does not require a credential and does not persist submitted text. It is not intended for secrets or sensitive personal data.

## Implemented controls

- JSON-only execution with a 96 KiB request-body ceiling and 20,000-character capability input ceiling.
- Explicit capability/version allowlist; no dynamic code execution or arbitrary URL fetching.
- D1-backed fixed-window rate limits: 12 requests/minute per anonymous IP and 90 requests/minute per authenticated principal.
- Principal identities are separate from credentials; API keys are 256-bit random bearer secrets stored only as SHA-256 hashes.
- Explicit key scopes, expiry, revocation, principal status, capability grants, daily execution quotas, and principal/capability spending ceilings.
- Append-only usage, credit, payment-event, and audit ledgers enforced by SQLite triggers.
- Stripe Checkout uses server-controlled pack configuration, per-principal idempotency keys, signed webhook verification, timestamp tolerance, order/amount/currency matching, and duplicate-safe credit issuance.
- Operator-triggered reconciliation retrieves pending Stripe sessions from the provider and uses the same idempotent settlement routine as webhooks.
- MCP validates Origin and modern protocol routing headers; HTTP and MCP execution share authorization and metering.
- Global response hardening: HSTS, nosniff, frame denial, referrer policy, permissions policy, and restrictive CSP directives.
- Secrets are runtime bindings only; no provider or bootstrap secrets are committed.

## Identity boundaries

The initial identity layer supports human, developer, agent, and service principals with scoped API keys. Operator provisioning requires `YH_BOOTSTRAP_SECRET`. This is not yet consumer login or a full OAuth authorization server. Email verification, account recovery, OAuth 2.1 authorization-code + PKCE, federation, and delegated agent identity remain separate work.

## Paid execution policy

No paid capability is currently published. The credit ledger, budget checks, capability grants, Stripe checkout adapter, and reconciliation route are infrastructure only. Checkout remains disabled until `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and a reviewed `YH_CREDIT_PACKS_JSON` are configured on the isolated preview environment. Never use live provider credentials during initial testing.

Before a paid capability is published, it must:
- disclose price, currency, unit, refund behavior, data handling, and maximum execution cost before invocation;
- require explicit capability grant and execution scope;
- pass principal daily/monthly and capability daily/per-execution budget checks;
- reserve/debit credits atomically and record an immutable usage event;
- define retry, partial-failure, cancellation, and refund semantics.

## Remaining production release blockers

- Consumer identity/OAuth, recovery, and consent UX.
- Provider test-mode end-to-end tests, refunds, disputes, tax/invoice handling, and scheduled reconciliation.
- Automated cleanup/retention for rate-limit buckets and non-financial operational records.
- Edge-level abuse controls and bot policy tuned to observed traffic.
- Alerting, backup/restore rehearsal, incident response, and dependency vulnerability automation.
- Independent external MCP client conformance tests.
- Security review before publishing any network-capable or side-effecting capability.

## Agent-specific threat model

Treat agent input, tool arguments, retrieved documents, and third-party capability output as untrusted. Never let instructions embedded in content override system policy. Do not grant agents ambient authority. Use one key per agent and purpose, minimal scopes, explicit budgets, and human approval for consequential or irreversible actions.
