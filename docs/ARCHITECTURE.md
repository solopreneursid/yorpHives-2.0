# YorpHives 2.0 Architecture

## Design objective

Build an outcome-oriented capability network with two first-class consumers: humans and software agents. Both interfaces invoke the same versioned capability implementation and shared authorization/metering layer.

## Current deployment topology

```
Human UI / HTTP Agent / MCP Client
              |
        Cloudflare edge
              |
        Pages Functions
   |-- discovery + OpenAPI
   |-- HTTP execution gateway
   |-- MCP Streamable HTTP adapter
   |-- identity / API key routes
   |-- commerce / Stripe routes
              |
       Shared platform layer
   |-- authentication + scopes
   |-- rate limiting + budgets
   |-- append-only usage / audit
   |-- credit ledger + settlement
              |
        Cloudflare D1 (preview)
              |
      Pure capability handlers
          text.analyze@1.0.0
```

The preview uses one isolated D1 database for principals, credentials, grants, entitlements, rate-limit windows, usage events, credits, orders, payment events, and audit events. Static assets remain on Pages. No AI inference provider, queue, or Durable Object is required for this first commercial foundation.

## Boundaries

- **Experience:** accessible HTML/CSS/JS; no business secrets.
- **Discovery:** canonical capability metadata, machine manifest, OpenAPI, and agent guide.
- **Gateway:** request parsing, input ceilings, version resolution, structured errors, authentication and rate limiting.
- **Identity:** durable principals separated from revocable API credentials.
- **Authorization:** scopes, capability grants, per-principal budgets, and capability quotas.
- **Capability runtime:** pure deterministic handlers; no implicit network access.
- **Protocols:** HTTP is canonical; MCP adapts the same handler and trust checks.
- **Commerce:** provider-independent orders, server-controlled offers, usage and credit ledgers; Stripe is the first payment adapter.
- **Operations:** structured logs, health checks, immutable audit trail, and controlled reconciliation.

## Data model and invariants

- API secrets are returned once; only hashes and short prefixes are stored.
- Financial and usage history is append-only; corrections use compensating entries.
- Credit balances are derived from the credit ledger, never maintained as a mutable counter.
- Provider webhooks are signature-verified and deduplicated; a paid order grants credits at most once.
- Client-supplied amounts are never trusted. Checkout accepts a pack ID from server-side configuration.
- A credential's scopes cannot exceed its parent credential's scopes.
- A valid principal does not automatically receive a capability grant.
- Zero spending limits mean no paid execution allowance, not unlimited spending.

## Future data services

Add services only when a measured requirement exists:
- D1 for relational records and financial ledgers.
- R2 for user-owned or generated files with lifecycle and deletion policies.
- Queues for asynchronous jobs and high-volume metering aggregation.
- Durable Objects only for strong per-entity coordination.
- Workflows for durable multi-step operations.

Do not put every request through a Durable Object or create microservices before workload boundaries justify them.

## Portability

Domain models, schemas, capability contracts, pricing, authorization semantics, and workflow definitions remain provider-neutral. Cloudflare bindings and Stripe transport code are adapters, not domain types.

## Deployment isolation

The new trust-commerce branch deploys only to the isolated `yorphives-2-preview` Pages project and its dedicated `yorphives-2-trust-preview` D1 database. The existing `yorphives.com` Pages project, production DNS, and PDF-processing Worker are not modified. A separate production database and reviewed cutover are mandatory before a production release.
