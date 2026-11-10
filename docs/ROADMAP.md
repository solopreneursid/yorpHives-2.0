# YorpHives Delivery Roadmap

## Stage 1 — Platform front door

- [x] Establish the five-audience platform positioning.
- [x] Build a responsive entry point with clear audience pathways.
- [x] Publish a machine-readable platform overview.
- [ ] Connect discovery cards to real catalogue destinations.
- [ ] Add search backed by canonical catalogue data.

## Stage 2 — Canonical discovery

- [ ] Define typed listing contracts and lifecycle validation.
- [ ] Add D1 catalogue schema and migrations.
- [ ] Build public search, category, and listing APIs.
- [ ] Add honest usage measurement before showing popularity.
- [ ] Expose equivalent JSON and Markdown representations.

## Stage 3 — Identity and Builder

- [ ] Implement human, business, creator, and agent principals.
- [ ] Add business problem briefs and builder profiles.
- [ ] Add opportunity publishing, moderation, and discovery.
- [ ] Add scoped API credentials and audit events.

## Stage 4 — Applications and commerce

- [ ] Build application directory and app detail contracts.
- [ ] Integrate Dodo Payments checkout for server-owned products.
- [ ] Verify Dodo webhooks and persist provider events idempotently.
- [ ] Implement subscription lifecycle and entitlement reconciliation.
- [ ] Add cancellation, refund, and chargeback handling.

## Stage 5 — Agent execution

- [ ] Publish OpenAPI and MCP discovery interfaces.
- [ ] Add capability execution contracts and explicit scopes.
- [ ] Add rate limits, quotas, audit trails, and abuse controls.
- [ ] Add x402 only for use cases where per-request payment is appropriate.

## Release gates

A stage is not complete because its UI exists. Require automated tests, preview deployment, smoke tests, security review for sensitive flows, and truthful release metadata. Do not connect an unverified implementation to production payments or user data.
