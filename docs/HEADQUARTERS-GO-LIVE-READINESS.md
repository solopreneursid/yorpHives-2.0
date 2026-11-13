# YorpHives read-only Go Live readiness

Founder-only release workflow: development and staging require no administrator approval. Only a verified release can be previewed for publication, and Go Live requires founder OTP.

Private API GET /api/admin/go-live?target=website or headquarters reads live GitHub pull requests, GitHub Actions checks, and Cloudflare Pages metadata. Only one non-draft PR per target, labeled release-candidate and scope:website or scope:headquarters, based on main, from the same repository, is eligible.

Target-specific successful, exact-SHA GitHub Actions jobs and a matching successful, exact-branch Cloudflare Pages preview are required. Website requires contract tests, isolated deployment, browser/SEO, code review, Lighthouse, independent QA and recovery; Headquarters requires contract tests, offline visual QA, authenticated Admin browser smoke, independent QA and recovery. No check is inferred from a D1 historical record or from a PR label.

Optional private preview-only bindings: HQ_RELEASE_GITHUB_READ_TOKEN (read-only GitHub repository/checks), HQ_RELEASE_CLOUDFLARE_READ_TOKEN (Cloudflare Pages Read), HQ_RELEASE_CLOUDFLARE_ACCOUNT_ID (nonsecret existing account). Keep these out of Git and away from AI employees. Missing configuration fails closed.

The two future jobs Independent release QA and Release recovery and rollback have NOT been implemented in current CI. Until they are, readiness cannot pass. The endpoint never performs publishing, never grants permissions, and always reports production_deployment_enabled false. A separate founder-only OTP release executor remains necessary.

## Safe preview deployment rule

Never use a generic Cloudflare Pages create-deployment API call without a verified multipart branch field. During development, an incorrectly encoded request ignored the supplied branch and redeployed the private staging project's default branch. The previous staging deployment was promptly restored through Cloudflare's rollback API and verified as the canonical deployment. The public YorpHives website was not modified.

Future staging previews must use the existing pinned GitHub Actions / scripts/pages-preview-client.mjs workflow, which rejects production branches and requires Cloudflare's returned environment, exact branch, exact commit and successful preview stage to match. Do not treat an API call's submitted parameters as proof of its effects. Never invoke a deployment method if its branch/body encoding cannot be verified.


## Development QA has no owner approval step

Authenticated staging browser QA is a read-only workflow available via manual workflow dispatch to an authorized development operator. It no longer asks the founder to approve or check a box before tests. A trusted future automation can trigger it within existing permissions. It must inspect a previously existing exact-branch preview and never deploy, merge, or modify production. There remains a protected staging deployment environment and signed Access credentials, not broad administrator rights.

A passing offline visual check does NOT substitute for authenticated live staging, and passing smoke tests do NOT substitute for independent security, rollback, cost checks or founder final Go Live.
