# YorpHives read-only Go Live readiness

Founder-only release workflow: development and staging require no administrator approval. Only a verified release can be previewed for publication, and Go Live requires founder OTP.

Private API GET /api/admin/go-live?target=website or headquarters reads live GitHub pull requests, GitHub Actions checks, and Cloudflare Pages metadata. Only one non-draft PR per target, labeled release-candidate and scope:website or scope:headquarters, based on main, from the same repository, is eligible.

Seven successful exact-SHA GitHub Actions jobs and a matching, successful exact-branch Cloudflare Pages preview are required. No check is inferred from a D1 historical record or from a PR label.

Optional private preview-only bindings: HQ_RELEASE_GITHUB_READ_TOKEN (read-only GitHub repository/checks), HQ_RELEASE_CLOUDFLARE_READ_TOKEN (Cloudflare Pages Read), HQ_RELEASE_CLOUDFLARE_ACCOUNT_ID (nonsecret existing account). Keep these out of Git and away from AI employees. Missing configuration fails closed.

The two future jobs Independent release QA and Release recovery and rollback have NOT been implemented in current CI. Until they are, readiness cannot pass. The endpoint never performs publishing, never grants permissions, and always reports production_deployment_enabled false. A separate founder-only OTP release executor remains necessary.