# YorpHives Admin Control Center

## Staging architecture

The Admin Control Center and its repair agent run only in the dedicated staging environment. The public YorpHives website, production Pages project, production database, public DNS, and production release pipeline are not changed by this feature.

### Available controls

- Existing health monitors, asset scans, dependency observations, production page snapshots and findings.
- Cloudflare GraphQL traffic analytics endpoint.
- Finding triage with audited state changes.
- Durable D1 repair job history.
- A dedicated Cloudflare Workflow that uses Workers AI to propose a bounded repair.
- Isolated `build/agent/*` branches, GitHub CI verification, and draft pull requests.
- Admin activity history and release readiness review.

## Analytics setup

Add `CF_ANALYTICS_API_TOKEN` as an encrypted secret in the `yorphives-admin-staging` Pages project. Create a custom Cloudflare API token with Account Analytics:Read and restrict its Zone Resources to the YorpHives zone. Do not use a Global API Key.

## Repair agent setup

The repair agent uses a dedicated Worker named `yorphives-admin-agent`, Cloudflare Workflows, the existing staging D1 database, and a Workers AI binding. The Admin Pages project calls it through a private Service binding; the agent Worker has no public route or `workers.dev` hostname.

Add one encrypted Worker secret:

| Secret | Scope | Purpose |
| --- | --- | --- |
| `GITHUB_TOKEN` | Fine-grained token, repository `solopreneursid/yorpHives-2.0` only | Contents: Read and write; Pull requests: Read and write; Checks: Read. Allows the agent to create an isolated branch, read CI results, and open a draft PR. |

The Worker uses the Cloudflare Workers AI binding and does not require an external model-provider key. It uses `@cf/qwen/qwen3.8-27b`, one bounded inference call per job, a 3,500-token output cap, and a maximum of two repair jobs per 24 hours. Workers AI has a daily free allocation; usage beyond the included allowance can incur charges.

The Pages project must have the `ADMIN_AGENT_SERVICE` Service binding pointing to `yorphives-admin-agent` in both its preview and production environment configurations. In this architecture, “production” refers only to the production environment of the separate Admin staging Pages project; it does not refer to the public YorpHives site.

## Repair workflow

1. Admin submits a repair request; the API checks owner authentication, same-origin, request size, finding ID, and daily quota.
2. The Pages Function creates a D1 job and starts a durable Cloudflare Workflow through the private Service binding.
3. The Workflow loads a bounded set of eligible source files and asks Workers AI for complete replacement contents in a strict JSON format.
4. The agent rejects changes outside its allowlist. It cannot edit tests, `.github/`, migrations, authentication, Cloudflare Access, release controls, deployment configuration, monitoring infrastructure, or secrets.
5. It creates a branch named `build/agent/repair-<job-id>`. The existing repository platform-check workflow runs on that branch.
6. The Workflow waits for the platform contract checks. Only when they pass does it open a draft PR against `build/yorphives-admin-reliability`.
7. D1 records the branch, PR URL, verification summary, and audit event. The job enters `needs_review`; no merge or deployment occurs.

A failed inference, invalid patch, failed CI run, or CI timeout leaves a failed job record and does not open a PR.

## Release safety

- Admin Access remains owner-only.
- Public pages and Free Tools remain anonymous.
- Agent execution is available only through the protected Admin Pages project and its private service binding.
- The agent can create draft PRs but cannot merge or deploy.
- It cannot edit authentication, Access policies, security workflows, deployment configuration, migrations, monitoring infrastructure, or production release controls.
- A green CI run does not authorize a production release. Human review and explicit release authorization remain required.

## Cost strategy

- Reuse the existing D1 database and Cloudflare account.
- Use Cloudflare Workflows for durable orchestration and Workers AI's included daily allocation where eligible.
- Use the existing public repository's GitHub Actions checks; no third-party agent platform or always-on compute service is required.
- Limit agent execution to two jobs per 24 hours and one inference request per job.
