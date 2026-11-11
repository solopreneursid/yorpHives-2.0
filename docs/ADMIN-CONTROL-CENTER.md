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
| `ADMIN_AGENT_WEBHOOK_URL` | Plain text, optional | Defaults to the fixed YorpHives GitHub repository-dispatch endpoint. |
| `ADMIN_AGENT_WEBHOOK_TOKEN` | Secret | Fine-grained GitHub token with Contents: Read and write on this repository, used only to trigger the workflow. |
| `ADMIN_AGENT_CALLBACK_TOKEN` | Secret | High-entropy random bearer token shared by the staging Pages project and the GitHub Actions secret. |

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

The staging Pages route sends a GitHub `repository_dispatch` event. The `Admin repair agent` workflow runs on GitHub-hosted runners, uses Cloudflare Workers AI (`@cf/qwen/qwen3.8-27b`) for one bounded patch-generation request, validates every changed path against an allowlist, runs `npm run check`, pushes an `agent/` branch, and opens a draft PR against the Admin staging branch. The workflow reports status using `ADMIN_AGENT_CALLBACK_TOKEN`. Callback events are audited.

The workflow cannot change `.github/`, migrations, deployment configuration, Access/authentication code, monitoring infrastructure, secrets, or production release controls. It does not merge or deploy. Local checks must pass before a PR is created; GitHub CI also runs on `agent/**` and `repair/**` branch pushes. Review the PR and CI before merging it manually.

Configure GitHub repository Actions secrets `CF_AI_API_TOKEN` (Cloudflare token with Workers AI:Run only) and `ADMIN_AGENT_CALLBACK_TOKEN` (same random value configured in Pages). The Cloudflare account ID is set in the workflow. Configure the Pages project with `ADMIN_AGENT_WEBHOOK_TOKEN` (fine-grained GitHub token with Contents:Read and write for this repository) and `ADMIN_AGENT_CALLBACK_TOKEN`. Never paste any token into chat.

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
- Use GitHub-hosted Actions for on-demand isolated execution and Cloudflare Workers AI's included daily allowance where eligible. Jobs run sequentially and each uses one bounded inference call; usage beyond the free allowance can incur charges.
- Do not enable always-on browser automation, paid model APIs, or scheduled high-frequency scans by default.
