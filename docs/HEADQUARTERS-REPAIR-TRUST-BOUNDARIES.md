# Headquarters: autonomous repair trust boundary

## Scope and cost

The Cloudflare repair Worker remains an optional, **owner-dispatched** assistant. No new paid providers or subscriptions are introduced. Repairs are bounded by the existing two-job-per-24-hours limit. Each attempted repair may call Workers AI for patch generation and a separate independent AI review, so dispatch count is **not** a billing amount.

The agent cannot publish to the public website, merge a PR, modify billing, invoke deployment permissions or authorize a release. It may prepare a draft PR only when exact-commit GitHub Actions quality checks have passed.

## Reduced patch allowlist

For autonomous repair proposals, only the existing root `app.js` and existing `.js`, `.mjs`, `.html`, and `.css` under `free-tools/`, `discover/`, `listing/` and `explore/` are eligible.

Explicitly excluded from AI-generated patches are:

- All `admin/`, `admin-agent/`, `admin-monitor/` and `hq-*/` files.
- All `functions/` API/backend routes, including authentication, product, and payment APIs.
- Wrangler and Pages configuration, migrations, workflows, tests, dependencies, manifests, hidden files, scripts and deployment settings.
- New files, deleted files, duplicate paths, source paths outside the exact inspected Git tree, and path traversal.

Admin, backend, and infrastructure improvements continue to be developed through **explicitly reviewed human-assisted engineering PRs**, rather than untrusted autonomous patches.

## Repair branch verification

A repair job reads its approved source from `REPAIR_BASE_BRANCH`, a reviewed Cloudflare Worker setting. The Worker checks that the source branch is still at the same commit immediately before creating a repair branch.

For a retry that finds `build/agent/repair-<job UUID>` already present, the Worker:

1. Verifies that the branch contains exactly one commit after its reviewed source commit.
2. Verifies the parent commit and complete changed-file set.
3. Verifies each changed file's actual content against the AI-reviewed patch.
4. Rejects additional commits, different files, renamed files or changed source content.

The CI receipt stored at `admin-agent/repair-receipts/<job UUID>.json` is also pinned to that exact repair commit. A retry cannot accept a different receipt or extra branch commit.

Before opening or reusing a **draft** pull request, the Worker checks the branch head against the exact SHA that passed all required GitHub checks, then rejects mismatched PR head revisions. The same validation runs on the newly created PR response.

This ensures that CI outcomes cannot be silently transferred to changed code. External GitHub users with direct write access still require repository-level branch protection and token scoping.

## What CI does and does not prove

Required exact-commit checks remain platform tests, isolated Cloudflare Pages preview deployment, browser/SEO tests, static code review and Lighthouse audit.

Passing these checks means **CI-verified proposal for founder review**. It does not establish that the original incident was reproduced, the root cause is correct, or that the proposed fix resolved the incident. Those require an issue-specific test and independent review before a production release.

The independent Workers AI reviewer now uses a fail-closed instruction when evidence is insufficient. As with all model-based review, its output remains advisory and cannot override deterministic security or release gates.

## Next blockers

- Resolve the intentionally flagged sensitive Wrangler configuration change through independent review of PR #24.
- Rehearse a real bounded repair against isolated staging with a known reproducible problem and a matching regression test.
- Record issue-specific test evidence and approval against the tested revision.
- Verify Cloudflare billing and live D1 backup/restore with owner-authorized access.
- Complete cumulative release security review, owner approval and rollback procedures.

No production approval, deploy, paid integration or expanded third-party access is requested by this branch.
