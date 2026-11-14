# Independently owned release controller (NOT Headquarters)

This folder is an independent, open-source release-control **library**, not
a deployed application. It must never be bundled into the live HQ Pages
Functions runtime, exposed as `/api/admin/release`, enabled by the watchdog,
or given to agents as a tool.

## Release sequence required by the founder

1. A developer changes source in the correct website or HQ repository.
2. Independent CI/security tests pass against an exact immutable commit SHA.
3. A preview deployed with **separate** staging storage is inspected by
   the founder and the founder explicitly selects **Go Live** in a
   SEPARATE authenticated release service (not Headquarters).
4. The service independently verifies the public provider metadata
   (GitHub source SHA, reviewed PR, Cloudflare preview deployment SHA,
   preview output, CI results, owner-only role, unchanged production
   configuration and independent recovery/rollback receipts).
5. The service challenges for **fresh six-digit OTP** from a founder-held
   TOTP authenticator. Cloudflare Access email login by itself is NOT
   an adequate second factor for release.
6. A dedicated durable atomic replay ledger and rate limiter validate
   and consume the time-step. Reusing an OTP is denied. Missing ledger
   or rate limiting fails closed.
7. The service signs a two-minute Ed25519 approval bound to the exact
   `system/project/repository/source_sha/preview_deployment_id`.
8. A **separate release executor** validates the receipt signature,
   checks the exact SHA and preview again, atomically consumes the receipt
   nonce, and promotes the approved immutable artifact; never rebuilds an
   arbitrary branch. The owner can abort at any point.
9. The executor verifies live Access denial, no privileged GitHub Worker
   bindings, exact deployed SHA, rollback artifact, website and HQ
   read-only contracts, and records a signed non-PII audit receipt.
10. Failed verification means **NO DEPLOY** and a human incident report.

`owner-release-contract.mjs` implements parts of steps 4–7 as **pure
backend-independent guard logic**, strict OTP/TOTP RFC 6238 checks and
receipt signing/verification. It contains NO deployment actions, secret
storage, user account provisioning, identity JWT adapter, browser UI or
run-loop. The one-time store, owner identity verifier, OTP provisioning,
provider verifier, release executor, clock, secure storage and hosting
must be separately created, provisioned and tested before use.

Do not store any OTP seed, provider token, GitHub PAT, TOTP recovery code
or signing private key in GitHub, Cloudflare Pages env shared with HQ,
a browser bundle, issue comment, LLM prompt, or CI logs. Prefer separate
self-hosted read-only identity and signed review records. Hardware-backed
passkeys/WebAuthn can replace TOTP as a modular step-up adapter later.

## What must remain blocked *right now*

- The canonical HQ Pages runtime still binds `ADMIN_AGENT_SERVICE` to
  `yorphives-admin-agent` with historical privileged credentials.
- The independent HQ monitoring-only replacement is not yet
  authenticated/browser verified on a truly isolated preview.
- Production D1 `quick_check(1)` passed and has a bookmark, but a genuine
  provider backup download/import into another database has NOT passed.
- No external login, owner OTP enrollment, durable replay store or
  release executor is deployed.
- Both website and HQ production auto-deploys are disabled in Cloudflare;
  development PRs cannot silently publish.
- Old archival Pages Function references still block deletion of the
  legacy HQ mission Worker.

**Do not call this system production-ready or bypass any founder approval.**
The signed receipt's `production_deployment_authorized_for_exact_sha` field
is a claim within an authenticated and independently validated release
session, NOT proof that a deployment occurred.

Future portability: verify GitHub/Cloudflare through swappable adapters,
enable self-hosted Gitea/Forgejo + reverse proxy + SQLite/Postgres and
a separate deployment executor without changing the approval protocol.
