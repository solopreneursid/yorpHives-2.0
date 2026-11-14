# YorpHives Headquarters — implementation program
**Policy revision:** 14 November 2026. **Monitoring and intelligence only.** The founder has retired all Headquarters Preview, Go Live, OTP and publishing workflows. For the current authority boundary see `docs/HEADQUARTERS-MONITORING-ONLY-POLICY.md`; older release/OTP design documents are historical records, not active requirements.

## Product promise
A private, social-style Home / Inbox / Discover / Business / YorpMind / Investigations workspace that continuously monitors the public YorpHives website, its tools and products, Headquarters itself, infrastructure/security, technology, global market openings, traffic and revenue. It explains verified evidence, flags missing/unavailable data, prioritizes founder decisions and learns from independently verified outcomes.

**Headquarters finds and recommends. The founder investigates, codes, tests and publishes through separate development and deployment tools.** No AI employee, scheduled scanner or UI action may fix code, submit repairs, send production OTPs or launch releases.

## Permanent project identity
- Headquarters repository: `solopreneursid/yorpHives-2.0` in the independent `headquarters/` checkout.
- Public website repository: `solopreneursid/YorpHives` in the independent `website/` checkout.
- A fresh ChatGPT session MUST read `AGENTS.md`, `PROJECT-IDENTITY.json`, verify Git origin, and keep edits isolated. Historical website-preview files in the HQ repo are not authoritative site source.
- Distinct storage, credentials, deployment targets and monitoring observations must be preserved; no implicit cross-system writes.

## Phase A — retire publishing controls (current development slice)
1. Remove Preview and Go Live buttons from Home, mobile navigation, release desk and all founder shortcuts.
2. Replace Releases with **Investigations**: historical, authenticated, read-only evidence and safe links to development records.
3. Keep permanent authenticated `410 MONITOR_ONLY` responses on retired `/api/admin/go-live`, `/api/admin/go-live-plan`, `/api/admin/go-live-otp` routes. No email, DB mutation, release planning or publishing from these routes.
4. Preserve Security's narrow emergency legacy-grant revocation. It is not a production release permission control.
5. Update Node/API tests, signed-in staging QA, offline visual QA and operator docs to prevent accidental restoration of the old publishing design.
6. Never confuse a draft PR or passing static contract checks with a deployed, production-verified feature.

## Phase B — continuous monitoring
- Read-only website/home/tools/API probes with source timestamp, last success, failure reason, deduplicated findings and bounded request budgets.
- Function-level checks for actual tools and user journeys (not just 2xx); authenticated checks only with separate least-privilege service identities.
- Independent self-hosted Headquarters watchdog and OS supervisor with restart, recorded heartbeat and alert route. An in-app scheduler alone cannot detect its own downtime.
- Report infrastructure/dependency/CVE findings, changes in published pages, security posture and monitoring coverage. Unchecked or stale routes are never marked healthy.
- After the founder deploys an external fix, re-run relevant checks and mark the observation verified only on actual supporting evidence.

### Phase B implementation slice — browser journey evidence (14 November 2026)

- Independent, optional Playwright/Chromium watcher has been implemented for four real File Studio text-tool journeys (JSON formatter/minifier, Base64 encoder, URL decoder) with exact output verification.
- A private 0600 atomic snapshot records source, timestamp, output hashes and verdict; missing/stale/unavailable coverage never counts as healthy. An owner-authenticated self-hosted API exposes it read-only.
- Self-hosted Founder Pulse has a dedicated functional-monitoring card; core Cloudflare-hosted feed retains its existing data contract.
- Deterministic mock-browser contract, snapshot, transition, authentication and HTTP API tests have been added.
- **Not completed:** live browser deployment or authenticated production visual QA; PDF/image/download tools and user journeys; external watchdog alerts; continuous intelligence expansion; revenue integrations; large-scale website-preview extraction. None may be claimed verified solely from this branch.

## Phase C — source-backed research and opportunity discovery
- Modular scanners for emerging open-source models, frameworks, competitor/product changes and global market needs.
- Store evidence URL, publication/observed date, region, confidence, hypothesis and counter-evidence.
- YorpMind deduplicates findings and makes practical, founder-readable investigation recommendations; agents never write code or publish.

## Phase D — business and revenue intelligence
- Read-only, consented, self-hostable integrations for website analytics, verified revenue, advertising, conversion and costs where available.
- Compare recorded trends over real intervals; distinguish estimated potential from measured earnings and missing accounts from zero revenue.
- Rank product ideas, sponsored/guest-post opportunities and monetization options by evidence, costs, risk and fit; no automatic purchases or campaigns.

## Phase E — straightforward social-style interface
- Home: short updates prioritized by severity, freshness and impact.
- Inbox: issues and monitored changes needing founder attention, with one-tap copyable context for independent coding.
- Discover: technologies, global problems and market opportunities.
- Business: traffic, costs, revenue and opportunities with clear data-source status.
- YorpMind: research roles, saved knowledge and evidence, not fake autonomous activity.
- Investigations: read-only historical evidence. No development/deployment/OTP button anywhere.

## Phase F — operational production hardening, externally managed
- Verify full test suite, private staging browser auth, independent safety checks, server supervision, real backup/restore and recovery rehearsals before the founder separately deploys Headquarters.
- **Important current infrastructure limitation, last observed 14 November 2026:** preview and canonical Headquarters Pages environments were documented as sharing physical D1 ID `e8690813-b139-44a2-a1c7-bea2d2777ead`. The older migration ledger had 29 applied migrations. This must be rechecked; do not mutate shared staging data, apply migration 0030, create new paid resources, or claim backups without explicit owner authorization and evidence.
- No code in this repository can claim the founder's real production deployment has been verified without exact live evidence. A draft branch or preview deployment is not a live Headquarters rollout.

## Current milestone and verification truth
The codebase already contains an internal scheduled observation loop, partial monitoring/market/revenue interfaces, a social-style Founder Pulse, and a newly drafted independent watchdog. A monitoring-only UI/API retirement is being implemented in a separate draft PR. Fully operational independent alerts, revenue integrations, broad functional checks, autonomous verified research and live operational QA remain incomplete.

**Do not rebuild the retired Go Live project from archived docs.** The product is an intelligence and monitoring console, not a release platform.
