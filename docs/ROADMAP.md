# YorpHives Delivery Roadmap

## Product structure and experience

- [x] Replace directory-first homepage with build-request-led positioning.
- [x] Establish primary navigation: Home, Free Tools, Explore, Builder, Connect.
- [x] Create dedicated Free Tools, Explore, Builder and Connect routes.
- [x] Add privacy-preserving browser utilities: word counter, JSON formatter/validator and URL encoder/decoder.
- [x] Load recently added YorpHives applications from the canonical catalogue.
- [x] Keep Explore scoped to YorpHives-built applications.
- [x] Publish truthful empty states where product data or analytics are not yet available.
- [ ] Add project request intake with validation, spam protection and secure persistence.
- [ ] Add more free tools based on search demand and user needs.
- [ ] Add screenshots, demo recordings and release metadata for every YorpHives application.

## Agentic Internet foundation

- [x] Publish `llms.txt` and a YorpHives well-known platform manifest.
- [x] Publish OpenAPI documentation for the existing public catalogue endpoints.
- [x] Support JSON and Markdown catalogue responses.
- [ ] Add capability registry with versioned schemas and execution policies.
- [ ] Add human, business, creator and agent identity principals.
- [ ] Add scoped credentials, authorization middleware, revocation and audit events.
- [ ] Add MCP server/tools backed by canonical service contracts.
- [ ] Add rate limits, quotas, structured errors and idempotency for mutating operations.
- [ ] Add execution observability, retry handling and abuse controls.
- [ ] Evaluate x402 only for agent use cases that need per-request payments.

## Free Tools and discovery

- [x] Publish first browser-local utilities.
- [ ] Instrument privacy-conscious aggregate usage events.
- [ ] Add measured trending rankings only after sufficient real usage.
- [ ] Add catalogue admin and review/moderation workflow.
- [ ] Add SEO metadata, structured data, sitemap and tool-specific landing pages.

## Explore applications

- [x] Create YorpHives-only app marketplace route.
- [ ] Add product lifecycle and release validation.
- [ ] Add product detail pages with genuine screenshots, demos, pricing and installation instructions.
- [ ] Add account-aware free/premium access.

## Builder opportunity platform

- [x] Define Builder as a paid opportunity-discovery product, not a public generic directory.
- [ ] Implement member identity and skill profiles.
- [ ] Build opportunity source ingestion, deduplication, freshness checks and moderation.
- [ ] Add source attribution, eligibility, location, compensation, deadlines and application links.
- [ ] Add matching, saved searches, alerts and opportunity tracking.
- [ ] Add YorpHives project postings and application workflow.
- [ ] Add member workspace and access controls.

## Dodo Payments and entitlements

- [ ] Configure server-owned Dodo product/price mappings for monthly and annual Builder memberships and paid apps.
- [ ] Implement checkout creation on the server.
- [ ] Verify signed Dodo webhooks against raw request bodies.
- [ ] Persist provider events idempotently and reconcile out-of-order lifecycle events.
- [ ] Implement entitlements, cancellation, expiration, refunds and chargeback handling.
- [ ] Test replay, duplicate delivery, failed delivery and access revocation.
- [ ] Never grant paid access from a browser redirect.

## Release gates

A stage is not complete because its UI exists. Require automated tests, preview deployment, browser and API smoke tests, accessibility checks, security review for sensitive flows, and truthful release metadata. Do not connect unverified implementation to production payments or user data.
