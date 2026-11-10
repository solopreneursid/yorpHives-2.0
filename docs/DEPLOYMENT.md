# Deployment Environments

## Preview

The platform foundation is connected to the separate Cloudflare Pages project:

- Project: `yorphives-2-preview`
- Preview origin: `https://yorphives-2-preview.pages.dev`
- Git repository: `solopreneursid/yorpHives-2.0`
- Preview branches: enabled for all branches.
- Production deployments: disabled for this preview project.
- Build command: none (static site).
- Output directory: repository root.

Pull requests and branch pushes should create preview deployments once the Pages Git integration has processed the connection. Verify the deployment URL and run browser and content-negotiation smoke tests before treating a preview as verified.

## Production

The existing `yorphives` Pages project and `yorphives.com` custom domains remain attached to the separate `solopreneursid/YorpHives` repository. Do not change that source connection, production branch, custom domains, DNS, or production secrets as part of this foundation work.

A production migration requires an explicit cutover plan, verified parity, rollback procedure, and successful preview acceptance. The preview project must never be treated as production.

## Release checks

1. GitHub Actions contract tests pass.
2. Preview deployment reaches a successful deploy stage.
3. Homepage works at mobile and desktop widths.
4. `/llms.txt` returns the machine-readable overview.
5. `/` with `Accept: text/markdown` returns Markdown.
6. Browser requests to `/` continue to receive HTML.
7. Security headers are present.
8. No user-facing listing, transaction, or membership is represented as live until its backing workflow is implemented and verified.
