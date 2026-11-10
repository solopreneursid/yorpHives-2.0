# YorpHives 2.0 Delivery Roadmap

## Phase 0 — Capability platform foundation
- [x] Human-facing discovery experience.
- [x] Canonical first capability and shared HTTP/MCP execution.
- [x] Versioned API, OpenAPI, manifest, and agent guide.
- [x] Isolated Pages preview and browser-tested initial vertical slice.

## Phase 1 — Production trust and commerce foundation (in progress)
- [x] Principal model for humans, developers, agents, and services.
- [x] Hashed API credentials, key expiry/revocation, and least-privilege scopes.
- [x] Explicit capability grants and quota/spending ceilings.
- [x] D1 schema and immutable usage, credit, payment-event, and audit ledgers.
- [x] Per-IP and per-principal rate limiting.
- [x] Server-configured credit packs and Stripe Checkout adapter.
- [x] Signed, duplicate-safe payment webhook settlement.
- [x] Operator-triggered Stripe reconciliation.
- [x] Health endpoint, global response hardening, and operational documentation.
- [ ] Configure preview-only bootstrap and Stripe test secrets; provision first operator principal.
- [ ] End-to-end test Stripe test-mode checkout, webhook replay, and reconciliation.
- [ ] Add refund/dispute handling, tax/invoice workflow, and scheduled reconciliation.
- [ ] Configure logs, traces, alerts, backup exports, and rehearse restore.
- [ ] External MCP client conformance and independent security review.
- [ ] Consumer login, email verification, recovery, and OAuth 2.1 PKCE.

## Phase 2 — Capability registry
- [ ] D1-backed catalog with immutable versions and lifecycle states.
- [ ] Publication validation: unique IDs, valid schemas, metadata completeness, destination checks.
- [ ] Generate OpenAPI and machine manifest from the canonical registry.
- [ ] Compatibility, deprecation, and rollback rules.
- [ ] Capability verification suite and evidence records.

## Phase 3 — Commercial capabilities
- [ ] Implement atomic credit reservation/debit in the paid execution gateway.
- [ ] Publish the first paid capability only after cost and abuse controls pass.
- [ ] Entitlement products and one-time outcome purchases.
- [ ] Revenue attribution, refund accounting, provider fees, and gross-margin reporting.

## Phase 4 — Growth channels
- [ ] Contextual affiliate program with disclosures.
- [ ] Advertising policy and suitable placements.
- [ ] Sponsored content workflow and editorial standards.
- [ ] Lead referral consent and attribution.
- [ ] Business licensing and embedded capabilities.

## Phase 5 — Composition
- [ ] Typed workflow contracts and deterministic execution.
- [ ] Step-level audit trail, cost estimate, and permission preview.
- [ ] Human approval checkpoints.
- [ ] Agent planning only over verified capabilities.

## Phase 6 — Network
- [ ] Third-party provider onboarding and verification.
- [ ] Provider isolation, scopes, quality scoring, and dispute process.
- [ ] Revenue sharing and payouts.
- [ ] Provider APIs and webhook lifecycle.
- [ ] Content and workflow licensing.

## Release gate

A capability is not production-ready merely because it appears in the UI or catalog. Release requires contract, authorization, abuse, observability, cost-bound, and deployed integration tests. The platform must not claim agentic readiness until discovery and invocation are verified by independent clients and its security controls are exercised end to end.
