# YorpHives Platform Architecture

## North star

YorpHives connects five groups through a shared discovery and capability layer:

- People discover tools that solve immediate problems.
- Businesses discover ways to get solutions built.
- Developers and creators discover legitimate earning opportunities.
- Users discover and adopt applications.
- AI agents discover capabilities and execute permitted actions.

The product should feel like one platform, not five disconnected microsites.

## Platform layers

### 1. Discovery

The canonical catalogue describes tools, applications, services, opportunities, and agent capabilities. Listings have stable identifiers and slugs, audience tags, lifecycle status, category, destination, access model, authentication requirements, required scopes, side effects, and publication/review timestamps.

The initial D1 schema is in `migrations/0001_catalogue.sql`. Public discovery is exposed through:

- `GET /api/v1/catalogue` — list and filter available listings.
- `GET /api/v1/catalogue/{slug}` — retrieve one available listing.

Both endpoints return JSON by default and Markdown when `Accept: text/markdown` or `?format=markdown` is supplied. Public APIs expose only `available` listings. The schema prevents a listing from becoming available without a destination, publication timestamp, and review timestamp.

No catalogue items are seeded by default. Empty results are preferable to invented tools, fabricated availability, or fake popularity. Search and category pages must be useful without authentication. Popularity labels require measured usage data; never fabricate trending rankings.

### 2. Identity and trust

Human accounts, business workspaces, creator profiles, and agent identities are distinct principals. Authorization is evaluated server-side for every protected action. Public discovery does not imply permission to execute or modify.

### 3. Builder and opportunities

Businesses can describe a problem and discover qualified builders. Creators can publish services, reusable solutions, and opportunities. The platform should make scope, deliverables, payment terms, ownership, and dispute paths explicit before a transaction.

### 4. Applications

Applications remain independently usable while benefiting from shared discovery, identity, billing, and entitlement services. Each app listing must accurately describe availability, supported platforms, access, pricing, and support.

### 5. Agent interface

Provide machine-readable catalogue data, OpenAPI descriptions, and MCP tools backed by the same canonical service contracts as the human interface. Agents receive structured errors, stable identifiers, explicit authorization requirements, and clear side-effect declarations.

## Payments and entitlements

Dodo Payments is the payment system for memberships and paid applications.

Flow:

1. Server creates a checkout session from a server-owned product/price mapping.
2. Browser redirects to Dodo checkout.
3. Dodo sends a signed webhook to the YorpHives webhook endpoint.
4. Server verifies signature and event freshness, then persists the event idempotently.
5. Subscription/order state is reconciled into YorpHives entitlements.
6. Product APIs and UI read entitlements from YorpHives, never from client claims.

Success redirects are informational only. Webhook processing must be idempotent and tolerate retries and out-of-order events. Cancellation, expiration, refunds, and chargebacks must revoke or adjust entitlements according to explicit policy.

## Data and infrastructure

Use Cloudflare-native components where they fit:

- Workers / Pages Functions for APIs and edge routing.
- D1 for relational catalogue, identity references, transactions, and entitlements.
- Durable Objects only where coordination, strongly consistent state, or per-entity serialization is required.
- Queues or Workflows for reliable asynchronous processing where needed.
- R2 for user-approved assets and application media.

Keep personal data collection minimal. Separate public catalogue data from private account and payment records.

## Content negotiation

Canonical public resources should support HTML for people and JSON/Markdown for agents. Use Accept headers and explicit formats; do not make agents scrape presentation markup. Machine-readable output must be derived from the same source data as the human UI.

## Security requirements

- Verify webhook signatures against the raw request body.
- Enforce idempotency for payment events and mutating APIs.
- Keep provider secrets in Cloudflare secrets, never in repository files.
- Validate input size, type, and schema.
- Apply least-privilege scopes to API keys and agent principals.
- Declare side effects and required permissions for each executable capability.
- Log security-relevant actions without logging secrets or unnecessary personal data.

## Delivery discipline

Build in small, testable slices. Keep production isolated until preview smoke tests, accessibility checks, API contract tests, and deployment checks pass. No feature should be labelled available until it has been verified end to end.
