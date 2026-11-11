# YorpHives Admin Control Center

## Current staging implementation

The Admin Control Center is deployed only to the dedicated Admin staging Pages project. It does not alter the public Pages project, production database, public DNS, or production deployment pipeline.

### Available now

- Existing health monitors, asset scans, dependency observations, production page snapshots and findings.
- Responsive Control Center navigation.
- Cloudflare GraphQL traffic analytics API and popular request paths.
- Finding triage: mark a finding investigating, accept a risk, or reopen it. Every transition is recorded in `admin_audit_events`.
- Repair request creation and durable D1 job history.
- Optional outbound agent webhook dispatch and authenticated agent callback.
- Release readiness area linking to GitHub PRs and CI. Production deployment is deliberately not enabled from this staging build.

### Environment variables

Configure these in the dedicated `yorphives-admin-staging` Pages project. Never expose them to client-side JavaScript.

| Variable | Type | Purpose |
| --- | --- | --- |
| `CF_ANALYTICS_API_TOKEN` | Secret | Read-only Cloudflare GraphQL Analytics API token. |
| `CF_ANALYTICS_ZONE_ID` | Plain text, optional | Defaults to the YorpHives zone ID in the server route. |
| `ADMIN_AGENT_WEBHOOK_URL` | Secret or protected variable | HTTPS endpoint for the external code-repair agent. |
| `ADMIN_AGENT_WEBHOOK_TOKEN` | Secret | High-entropy shared bearer token for dispatch and callbacks. |

For analytics, create a custom Cloudflare API token with Account Analytics:Read and restrict its Zone Resources to the YorpHives zone. Do not use a Global API Key.

### Agent webhook contract

Admin sends a POST request with a Bearer token and JSON payload:

```json
{
  "event": "yorphives.admin.repair.requested",
  "job_id": "UUID",
  "finding_id": "finding-id-or-null",
  "requested_by": "allowlisted-admin-email",
  "request_text": "Requested investigation and repair",
  "repository": "solopreneursid/yorpHives-2.0",
  "base_branch": "build/yorphives-admin-reliability",
  "callback_url": "https://admin-staging.yorphives.com/api/admin/agent-callback",
  "required_controls": [
    "isolated_branch",
    "tests",
    "security_scan",
    "preview_deployment",
    "pull_request_only",
    "no_production_deploy"
  ]
}
```

The agent calls the callback URL with the same Bearer token. Accepted statuses are `running`, `needs_review`, `completed`, and `failed`. Branches must use `agent/` or `repair/`; pull-request URLs must belong to this repository. Callback events are audited.

The webhook is an adapter, not an agent runtime. Until an external agent endpoint and token are configured, requests are stored as `queued` and no code is changed. A webhook service must independently enforce the required branch, test, review, and preview controls.

### Release safety

- Admin Access stays owner-only.
- Public pages and Free Tools stay anonymous.
- Repair jobs never receive permission to deploy production.
- No automated merge, DNS change, Access policy edit, or production database migration is enabled.
- A green CI run alone does not authorize a production release.

## Cost strategy

- Keep the Admin UI on the existing dedicated Pages project.
- Reuse the existing D1 database; do not create another database.
- Use Cloudflare GraphQL Analytics rather than a paid third-party analytics product.
- Prefer a small external agent service only when needed. Use free GitHub Actions minutes and a free/low-cost inference allowance where eligible; enforce a daily job limit.
- Do not enable always-on browser automation, paid model APIs, or scheduled high-frequency scans by default.
