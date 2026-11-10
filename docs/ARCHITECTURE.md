# YorpHives Platform Architecture

## North star

YorpHives is a build-led platform with five connected product surfaces:
- **Home:** attract individuals, creators, startups and businesses who need digital products, platforms, automation or AI-enabled solutions built.
- **Free Tools:** useful browser utilities that earn search traffic and repeat visits.
- **Explore:** an app-store-style marketplace exclusively for applications built and released by YorpHives.
- **Builder:** a paid membership application that discovers and organizes earning opportunities for developers, creators, bloggers, freelancers, designers and entrepreneurs, alongside projects posted by YorpHives.
- **Connect:** project enquiries through connect@yorphives.com.

These surfaces share one platform foundation. The human website is not an agent directory; agent compatibility is built into the underlying service architecture.

## Cloudflare Connect 2026 / Agentic Internet alignment

The platform is designed around discoverable, callable and payable capabilities:

1. **Discoverability:** publish `/.well-known/yorphives.json`, `llms.txt`, OpenAPI and capability manifests. Keep machine-readable metadata current and truthful.
2. **Callable services:** expose stable API contracts and, when implemented, MCP tools backed by the same domain services used by the human UI.
3. **Human + agent parity:** the same canonical data and business rules power HTML, JSON and Markdown representations.
4. **Identity and authorization:** model humans, business workspaces, creators and agents as distinct principals. Enforce scopes and authorization server-side on every protected operation.
5. **Persistent state:** use D1 for relational records and entitlements. Use Durable Objects only for strongly consistent coordination or per-entity serialization.
6. **Reliable execution:** use Workers/Pages Functions for edge APIs and Workflows or Queues for durable asynchronous processing, retries and reconciliation.
7. **Observability and auditability:** record security-relevant actions, provider event outcomes, execution status, quotas and errors without logging secrets or unnecessary personal data.
8. **Secure transactions:** enforce idempotency, signed webhook verification, rate limits, explicit side-effect declarations, spending limits and fraud controls.
9. **Interoperability:** keep business logic and contracts portable; Cloudflare is the infrastructure layer, not a requirement imposed on every client or agent.

## Product data boundaries

- Free Tools are YorpHives-operated browser utilities and must be genuinely functional before release.
- Explore contains only YorpHives-owned applications. Each release needs screenshots/demos, pricing, supported platforms, installation/launch steps and a verified lifecycle state.
- Builder opportunities are sourced, deduplicated, categorized, timestamped and reviewed. Listings should identify source, eligibility, location constraints, compensation, deadlines and application destination. Recommendations should be based on member skills and preferences, not unsupported earning guarantees.
- Home trending metrics must derive from privacy-conscious measured usage. Never display invented view, launch or popularity numbers.
- Recent releases are read from the canonical catalogue, not hard-coded marketing cards.
- Project enquiries go to connect@yorphives.com until a verified request-management workflow is implemented.

## Catalogue and API

The canonical catalogue is stored in D1. Public discovery currently exposes:
- `GET /api/v1/catalogue`
- `GET /api/v1/catalogue/{slug}`

Only reviewed and available records are public. JSON is the default representation; Markdown is supported through `Accept: text/markdown` or `?format=markdown`. The OpenAPI document describes only endpoints that currently exist.

## Identity and trust

Human accounts, business workspaces, creator profiles and agent identities are distinct principals. Authorization is evaluated server-side for every protected action. Public discovery does not imply permission to execute or modify. API credentials must be scoped, revocable and auditable.

## Dodo Payments and entitlements

Dodo Payments is the selected payment provider for Builder monthly/annual memberships and paid applications.

Flow:
1. Server creates checkout from a server-owned product/price mapping.
2. Browser redirects to Dodo checkout.
3. Dodo sends a signed webhook.
4. Server verifies the signature against the raw body and validates event freshness.
5. The provider event is persisted idempotently.
6. Subscription/order state is reconciled into YorpHives entitlements.
7. Protected Builder and application services check entitlements server-side.

Redirects never grant access. Cancellation, expiration, refunds and chargebacks must revoke or adjust entitlements according to explicit policy. Provider secrets belong in Cloudflare secrets, never in source control.

## Content negotiation and agent safety

Canonical public resources support HTML for people and JSON/Markdown for agents. Machine-readable output must be derived from the same source data. Agent execution requires authentication, least-privilege scopes, explicit permissions, side-effect declarations, quotas, rate limits and audit trails. Return stable structured errors and require idempotency keys for mutating operations.

## Security and release discipline

Validate input sizes and schemas; prevent SSRF and unsafe destinations; apply abuse controls; verify signatures; protect personal data; and test retries, replay and out-of-order events. Do not label features available until end-to-end evidence exists. Production remains isolated until preview browser QA, API smoke tests, accessibility checks and security review pass.
