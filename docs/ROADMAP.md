# YorpHives 2.0 Delivery Roadmap

## Phase 0 — Foundation (in progress)
- [x] Empty repository initialized.
- [x] Product principles and system boundaries documented.
- [x] Human-facing discovery experience.
- [x] Canonical first capability implementation.
- [x] HTTP discovery and execution API.
- [x] MCP Streamable HTTP adapter for the same handler.
- [x] Machine-readable manifest and OpenAPI contract.
- [ ] Automated tests and build pass.
- [ ] Isolated Cloudflare preview deployment.
- [ ] Browser and external agent integration verification.

## Phase 1 — Production hardening
- [ ] Error taxonomy and contract tests for all API routes.
- [ ] CI quality gates and dependency update policy.
- [ ] Content Security Policy and security header review.
- [ ] Rate limiting / abuse controls.
- [ ] Operational dashboards and alerting.
- [ ] Accessibility and responsive browser QA.
- [ ] Backup, recovery, rollback, and incident runbooks.

## Phase 2 — Capability registry
- [ ] D1-backed catalog with immutable versions and lifecycle states.
- [ ] Publication validation: unique IDs, valid schemas, metadata completeness, destination checks.
- [ ] Generated OpenAPI and machine manifest from canonical registry.
- [ ] Capability compatibility and deprecation rules.
- [ ] Capability verification suite and evidence records.

## Phase 3 — Commerce
- [ ] Identity and scoped credentials.
- [ ] Entitlements and quotas.
- [ ] Append-only usage ledger and idempotent billing events.
- [ ] One-time purchase and prepaid credits.
- [ ] Pay-per-use pricing and budget preflight.
- [ ] Payment provider integration, reconciliation, refunds, tax handling.
- [ ] Revenue attribution and per-capability gross margin.

## Phase 4 — Growth channels
- [ ] Contextual affiliate program with disclosures.
- [ ] Advertising policy and suitable placements.
- [ ] Sponsored content workflow and editorial standards.
- [ ] Lead referral consent and attribution.
- [ ] Business licensing and embedded capabilities.

## Phase 5 — Composition
- [ ] Workflow contracts with typed inputs and outputs.
- [ ] Deterministic workflow execution and step-level audit trail.
- [ ] Cost estimate and permission preview.
- [ ] Human approval checkpoints.
- [ ] Agent planning only over verified capabilities.

## Phase 6 — Network
- [ ] Third-party provider onboarding and verification.
- [ ] Provider isolation, scopes, quality scoring, and dispute process.
- [ ] Revenue sharing and payouts.
- [ ] Provider APIs and webhook lifecycle.
- [ ] Content and workflow licensing.

## Release gate

A capability is not production-ready merely because it appears in the UI or catalog. Release requires passing contract tests, authorization tests, abuse tests, observability checks, cost bounds, and a real deployed integration test. The platform must not claim agentic readiness until discovery and invocation are verified by an independent client.
