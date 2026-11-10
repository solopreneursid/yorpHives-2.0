# Deployment Environments

## Preview

The platform foundation has an isolated Cloudflare Pages project:

- Project: `yorphives-2-preview`
- Latest verified deployment: `https://c81f885e.yorphives-2-preview.pages.dev`
- Source commit: `3656615fc7193107d979c1cf86d3e85fac5834c7`
- Git repository: `solopreneursid/yorpHives-2.0`
- Preview branches: enabled for all branches.
- Production deployments: disabled for this project.
- Build command: none (static site).
- Output directory: repository root.
- Preview D1 database: `yorphives-2-catalogue-preview`.
- Pages Functions binding: `DB` in the preview environment only.

The latest preview deployment completed successfully. Cloudflare logs confirm that the repository was cloned, the Pages Functions Worker compiled successfully, all required static assets were published, and deployment completed. The deployment has `uses_functions=true` and the preview `DB` binding attached.

Migrations `0001_catalogue.sql`, `0002_catalogue_integrity.sql`, and `0003_catalogue_ownership.sql` are applied to the preview D1 database. It contains schema and validation triggers only; no public listings are seeded. The database prevents publication without a destination URL, publication timestamp, and review timestamp. It also rejects unsafe destination schemes, malformed JSON arrays, and paid listings without a valid currency code. These constraints were exercised against the preview database, and temporary verification rows were removed.

The homepage deployment and Pages Functions Worker build completed successfully. GitHub Actions contract tests and browser-script syntax checks passed for the homepage analytics changes. Browser-level visual QA and live HTTP/API smoke tests remain pending because the connected inspection environment cannot reach the preview hostname directly. Do not treat the preview as accepted until those checks pass.

## Production

The existing `yorphives` Pages project and `yorphives.com` custom domains remain attached to the separate `solopreneursid/YorpHives` repository. Do not change that source connection, production branch, custom domains, DNS, D1 bindings, or production secrets as part of this foundation work.

A production migration requires an explicit cutover plan, verified parity, rollback procedure, and successful preview acceptance. The preview project and preview database must never be treated as production.

## Release checks

1. GitHub Actions contract tests pass.
2. Preview deployment reaches a successful deploy stage.
3. Homepage works at mobile and desktop widths.
4. `/discover/` search and filters work against the preview catalogue API.
5. `/listing/?slug=...` renders available listing details safely.
6. `/llms.txt` returns the machine-readable overview.
9. `/api/v1/catalogue` returns JSON for browser/API clients.
8. `/api/v1/catalogue` with `Accept: text/markdown` returns Markdown.
9. Browser requests to `/` continue to receive HTML; Markdown negotiation returns Markdown.
10. Security headers are present.
11. Unpublished listings remain hidden from public endpoints.
12. No user-facing listing, transaction, or membership is represented as live until its backing workflow is implemented and verified.
