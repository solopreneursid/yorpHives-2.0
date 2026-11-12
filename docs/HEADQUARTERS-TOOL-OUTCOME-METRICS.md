# Headquarters v7 — Tool outcome evidence and private agent execution

## Outcome and intent

YorpHives needs to distinguish **traffic to a tool page**, a **browser-reported successful tool action**, and a **successful Access-authenticated server tool execution**. They are separate metrics, with different provenance and levels of trust. None alone establishes unique users, customers, bot-free traffic, paid adoption, or validated market demand. Current Free Tools catalogue categories are inventory, not limits on future sectors or products.

## Components

1. `migrations/0020_headquarters_tool_activity.sql`: private D1 allowlist of instrumented tools and daily anonymous aggregate counts, independently keyed by **tool slug and channel**. No raw events, IPs, usernames, session IDs, cookies, source text, file contents, or agent input/output retained. Daily global maximum **1,000 counted completions per instrumented slug and channel**, with atomic SQL stop at quota.
2. `functions/api/v1/tool-activity.ts`: bounded same-origin JSON intake for `{slug,event:"completed"}`, exact two-key payload, maximum 180 characters, validated registered slug and event, no cross-origin browser writes, no cookies or token collection, returns `browser_client_reported`, `verified_server_execution:false`. **Spoofable by any HTTP client**; this is an unverified usage signal, not a human authentication mechanism. Limits reduce abuse but do not eliminate fraud.
3. `free-tools/usage-telemetry.js`: only after success for selected browser-first tools. Reports just slug and event marker via same-origin keepalive; no text, uploaded files, filename, result, analytics identifier or location. Global Privacy Control, Do Not Track set to 1, or browser automation indicated by `navigator.webdriver` suppress reporting. These signals are best-effort and can be spoofed. Existing private staging events may include earlier CI browser smoke and are not evidence of real user adoption. Session-local per-tool soft budget of three reports, without transmitting or storing user/session IDs. Only 8 known tools seeded initially.
4. `functions/api/v1/agent-tools.ts`: a **separate, restricted, server-executed proof of capability**, not an open MCP server. GET discovery in JSON or Markdown. POST requires signed Cloudflare Access JWT from a service token allowlisted in `HQ_TOOL_SERVICE_TOKEN_IDS` (separate from Admin read-only CI tokens). No fallback owner identity, anonymous access, or payment capability. Tools: `sha256-text` and `json-compact`, max UTF-8 input 8,192 bytes, no network side effects, no persistent user content. Count only actual successful authorized executions. Responses can be JSON or Markdown. No arbitrary code execution or external fetching. If the service-token allowlist is **not configured**, authenticated execution returns HTTP 503.
5. `functions/api/admin/tool-activity.ts`: protected seven-day JSON/Markdown dashboard endpoint. Shows independent metrics, explicit provenance, limited instrumented coverage and missing-measurement status.
6. `admin/tool-activity.js` and Market Explorer: separate successful browser reports from server-executed private agent tools and do not calculate sampled HTTP request ratios. Recorded counts and supported tool coverage are inspectable.
7. `functions/api/admin/next-actions.ts`: investigations use reported completion counts (not conversion forecasts), require independent UX verification, and separately audit authenticated agent scope and execution. Missing events lead to a research task rather than zero-demand claims.

## Privacy, security, and scale boundaries

- Browser reporting is a self-reported *signal*, cannot prove human identity, and is vulnerable to crafted same-origin or manually spoofed requests. Before production, obtain privacy/legal review, abuse/rate-limit controls, compatibility testing and a founder release approval. A daily aggregate cap is a safety brake, not an enterprise analytics solution.
- SessionStorage is used solely for client-side reporting suppression, never a persistent person identifier. The browser sends no personal or customer document data. Authentication audit occurs in Cloudflare Access; this ledger intentionally stores no service-token ID.
- Agent tool calls are verified server operations under a restricted Access credential, but they **do not** imply a paid MCP integration, anonymous public AI-agent use, or real external-agent demand. Expose publicly only after designing scoped product authentication, cost-aware quotas, policy, billing and verification.
- If D1 is unavailable, report failure instead of claiming the action was counted. A tool whose slug is not registered returns `accepted:false`; instrumentation of future products requires explicit review and expansion of the registry.
- The first deployment is **private staging only**. The public YorpHives production site and product functionality remain unchanged. The code has no ready-to-use client credential; no secrets are committed.

## Validation

- Migrate 0020 to the private staging D1 following migrations 0014–0019.
- `node --test` / `npm run check` must pass signed JWT service-only authorization tests (existing CI token cannot execute), cross-origin/invalid payload rejection, unknown tool exclusion, exact daily caps, error-not-counted behavior, actual SHA-256/JSON compaction, GET content negotiation and no automatic approvals.
- Authenticated Admin staging browser smoke must display the measurement panel and read-only API without impersonating the owner or sending synthetic customer events.
- Verify a real successful browser tool action in an authenticated, approved staging session. Inspect exactly one aggregate increment with no user-content fields; confirm GPC/DNT opt-out, per-tab limit, errors not counted and no workflow breakage.
- Verify real signed service execution only when a **new** scoped service token is explicitly provisioned. Do not reuse the Admin CI service identity.
- Reconcile the complete stacked PR chain and owner authorization before any main/public release. The new test run passes only within its incremental branch and does not authorize all preceding features.

## Next milestones

Measure *actual* verified tool-completion outcomes under user consent where feasible, instrument more categories, validate agent API usage via separate scoped credentials, add Search Console search-performance data when the connected provider exposes authorized action, and reconcile production's real tool inventory against the development catalogue. Do not blend source categories into an imaginary universal demand score.
