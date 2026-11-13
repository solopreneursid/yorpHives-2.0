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


## Verified private branch preview (November 13, 2026)

A real Cloudflare Pages preview for source `8c184d3fe8f9f007f7a8afb51b610d252504a49e` was created using a documented `FormData` multipart request with explicit branch `fix/founder-approval-at-production-only`, not the unsafe JSON body. Deployment `aaa7346f-9150-4aa5-81be-2103f76d263d` at `https://aaa7346f.yorphives-admin-staging.pages.dev` reached successful preview status, while the canonical staging deployment stayed `77ffbf58-5ff8-4f01-90ba-6e657d9acfc0`.

Cloudflare Access lists an application on wildcard `*.yorphives-admin-staging.pages.dev` with a founder allow policy and a separate CI service-auth policy. This is configuration evidence only; authenticated browser QA and an independent anonymous HTTP-denial test on this new preview are still required.

The preview client now validates the current GitHub-connected Headquarters project's production branch, source repository and canonical deployment **before** any POST and confirms the canonical deployment ID is unchanged **after** a successful preview response. If canonical state changes or cannot be rechecked, the job fails and refuses to claim success. Only explicit allowlisted development branches are permitted.


## Split website vs Headquarters publish branches

**Security-critical correction:** Public YorpHives publishes from the `main` branch of its own Cloudflare Pages project; the existing **private Headquarters staging project's canonical Pages branch** is `build/yorphives-admin-reliability`. The release candidate verifier now demands the target's exact base branch: `website → main`, `headquarters → build/yorphives-admin-reliability`. A PR aimed at the wrong branch is ineligible even with a label or green CI. These are *current installed deployment branches*, not proof that a final separate Headquarters production domain already exists.

Draft PR #48 targets the private HQ staging canonical branch for cumulative review and remains unmerged. It is not a production release authorization. The eventual founder-only Go Live executor must independently verify that only the approved target Pages project will change, and must not merge the HQ release into public website `main`.
