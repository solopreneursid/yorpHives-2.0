# YorpHives Delivery Roadmap

## Stage 1 — Platform front door

- [x] Establish the five-audience platform positioning.
- [x] Build a responsive entry point with clear audience pathways.
- [x] Publish a machine-readable platform overview.
- [ ] Connect discovery cards to real catalogue destinations.
- [ ] Add a browser search experience backed by catalogue data.

## Stage 2 — Canonical discovery

- [x] Define typed listing contracts and lifecycle validation.
- [x] Add the initial D1 catalogue schema and migration.
- [x] Build public catalogue list and detail APIs.
- [x] Support JSON and Markdown representations from the catalogue API.
- [x] Filter listings by type, category, audience, and text query.
- [ ] Provision and bind the preview D1 database.
- [ ] Add verified listing administration and moderation.
- [ ] Add privacy-conscious usage aggregation before showing popularity.

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
