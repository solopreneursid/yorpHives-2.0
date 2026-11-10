# Deployment Environments

## Preview

The platform foundation has an isolated Cloudflare Pages project:

- Project: `yorphives-2-preview`
- Preview origin: `https://yorphives-2-preview.pages.dev`
- Git repository: `solopreneursid/yorpHives-2.0`
- Preview branches: enabled for all branches.
- Production deployments: disabled for this project.
- Build command: none (static site).
- Output directory: repository root.
- Preview D1 database: `yorphives-2-catalogue-preview`.
- Pages Functions binding: `DB` in the preview environment only.

The initial catalogue migration is applied to the preview D1 database. It contains schema only; no public listings are seeded. The database enforces that a listing cannot become available without a destination URL, publication timestamp, and review timestamp.

The Pages Git source is configured, but no preview deployment has been observed yet. Do not treat the preview origin as verified until Cloudflare reports a successful deployment. After the first deployment, verify the deployment URL and run browser and content-negotiation smoke tests.

## Production

The existing `yorphives` Pages project and `yorphives.com` custom domains remain attached to the separate `solopreneursid/YorpHives` repository. Do not change that source connection, production branch, custom domains, DNS, D1 bindings, or production secrets as part of this foundation work.

A production migration requires an explicit cutover plan, verified parity, rollback procedure, and successful preview acceptance. The preview project and preview database must never be treated as production.

## Release checks

1. GitHub Actions contract tests pass.
2. Preview deployment reaches a successful deploy stage.
3. Homepage works at mobile and desktop widths.
4. `/llms.txt` returns the machine-readable overview.
5. `/api/v1/catalogue` returns JSON for browser/API clients.
6. `/api/v1/catalogue` with `Accept: text/markdown` returns Markdown.
7. Browser requests to `/` continue to receive HTML; Markdown negotiation returns Markdown.
8. Security headers are present.
9. Unpublished listings remain hidden from public endpoints.
10. No user-facing listing, transaction, or membership is represented as live until its backing workflow is implemented and verified.
