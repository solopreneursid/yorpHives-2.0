# YorpHives 2.0 Architecture

## Design objective

Build an outcome-oriented capability network with two first-class consumers: humans and software agents. Both interfaces must invoke the same versioned capability implementation.

## Initial deployment topology

```
Browser / Agent
      |
Cloudflare edge + Pages static assets
      |
Pages Functions
  |-- /api/v1/capabilities   canonical public catalog
  |-- /api/v1/execute        versioned execution gateway
  |-- /api/mcp               MCP Streamable HTTP adapter
      |
Capability handlers
  |-- text.analyze@1.0.0     deterministic, in-memory
```

The first slice deliberately avoids a database, queue, AI inference provider, and user accounts. This reduces idle cost and avoids collecting personal data before a real requirement exists.

## Boundaries

- **Experience:** accessible HTML/CSS/JS; no business logic or secrets.
- **Discovery:** catalog contract, manifest, OpenAPI, machine guide.
- **Gateway:** request parsing, limits, version resolution, structured errors.
- **Capability runtime:** pure deterministic handlers; no implicit network access.
- **Protocols:** HTTP is canonical; MCP adapts the same handler. Protocol adapters must not duplicate business logic.
- **Commerce:** planned boundary for offers, quotes, entitlements, usage events, credits, billing, refunds, attribution, and provider settlement.
- **Trust:** future identity, scopes, budgets, approvals, audit events, abuse controls.

## Canonical capability identity

Use immutable IDs such as `text.analyze` and semantic versions. Breaking input/output changes require a new major version. Catalog metadata is the canonical public description. Execution handlers are registered by `id@version`.

## Future data services

Only add storage when a capability needs durable state:
- D1 for relational catalog, accounts, entitlements, usage ledger, and orders.
- R2 for user-owned or generated files with lifecycle and deletion policies.
- Queues for asynchronous jobs and metering aggregation.
- Durable Objects only for coordination requiring strongly consistent per-entity state.
- Workflows only for durable multi-step processes.

Do not put every request through a Durable Object or create microservices before workload boundaries justify them.

## Portability

Domain models, schemas, capability contracts, pricing, authorization semantics, and workflow definitions remain provider-neutral. Cloudflare bindings are infrastructure adapters, not domain types.

## Deployment isolation

The current production website is served by an existing Cloudflare Pages project connected to a different GitHub repository. The existing PDF-processing Worker is also a separate production service. This repository must deploy to a separate preview Pages project first. No production DNS, current Pages project, or existing Worker is changed by this foundation branch.
