# Legacy website preview inside Headquarters — extraction tracker

**Status: NOT extracted. Public website canonical source is verified separate. A read-only cross-repository metadata adapter exists in Headquarters, with website publisher still awaiting repository write access.** The two Git origins are already distinct, but the Headquarters repository contains experimental public website preview sources alongside private Headquarters code. It is unsafe to delete or relocate them without updating callers.

## This is NOT the production website

Live public website source: `solopreneursid/YorpHives` (sibling `website/`).
Private Headquarters development source: `solopreneursid/yorpHives-2.0` (sibling `headquarters/`).

Legacy website-preview groups in the Headquarters tree:
- Site pages and public tools: root `index.html`, `app.js`, `styles.css`, `free-tools/`, `discover/`, `explore/`, `listing/`, `builder/`, `connect/`.
- Public APIs: `functions/api/v1/`.
- Metadata: `openapi.yaml`, `llms.txt`, `site.webmanifest`, `robots.txt`, `sitemap.xml`, `.well-known/`, `_headers`.
- Shared candidates requiring dependency inspection: `brand/`, `functions/_lib/`, `functions/_middleware.js`, `migrations/`, generic tests/scripts and workflow files.

## Safe extraction sequence

1. Inventory each legacy file's consumers in HQ tests, self-hosted HTTP serving, preview routing, Cloudflare Pages Functions and deployment workflows.
2. Compare historic preview features with the **actual** production website repository, checking for absent/newer/different behaviors. Never overwrite production source with old preview code.
3. If the founder wants a feature moved, create an independent **website development branch** and test it against a separate website preview; preserve live pages and permissions.
4. Adapt Headquarters to monitor the actual website over read-only HTTP and use isolated test fixtures instead of shipping public-preview pages.
5. Only after equivalence and independent HQ desktop/mobile QA, remove obsolete website-preview files from Headquarters on an HQ-only branch.
6. Verify separate build outputs, routes, migrations, secrets, backups, CI jobs and exact founder-controlled release/OTP gates.

The workspace guard and session instructions prevent misidentification **now**. They are a containment measure, not evidence that legacy files have been physically moved or that production releases are complete.
