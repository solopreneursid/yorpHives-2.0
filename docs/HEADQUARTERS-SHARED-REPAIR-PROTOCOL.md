# YorpHives Headquarters — Shared ChatGPT/Headquarters Repair Protocol

## Permanent product rule

A founder can request, investigate, and prepare fixes for both the YorpHives
public website and private Headquarters **from ChatGPT or Headquarters**.
Both entry points use the same GitHub repository and reviewed repair artifacts.
YorpMind learns automatically from eligible, previously reviewed repair outcomes,
regardless of which interface initially identified or investigated the issue.

No AI, chat interface, browser script, or manager can authorize its own production
changes, approve its own CI, accept its own issue-specific QA, change account
permissions, or bypass independent founder MFA.

### Canonical sources

| Record | Source of truth | Trusted scope |
|---|---|---|
| Cross-interface issue description | GitHub issue in solopreneursid/yorpHives-2.0 | Untrusted report, never proof |
| Proposed change | GitHub isolated branch and draft PR | Change proposal only |
| CI and exact revision receipt | Private admin_repair_ci_verifications + GitHub run | Must match exact current SHA |
| Issue-specific reproduction/fix/regression QA | Private admin_repair_qa_reports | Founder-reported review, not independent product QA |
| Historical repair lesson | Private yorpmind_experiences | Provenance-only, no executable authority |
| Future pattern proposal | Private YorpMind evolution registry | Founder-reviewable suggestion |
| Production release | Independent release evidence, exact SHA, preview and separate MFA | Disabled until separately approved |

### ChatGPT → Headquarters

1. In ChatGPT, identify an issue and create a GitHub issue using the already-connected GitHub app; include a reproducible description and acceptance criteria. Do not include secrets.
2. In the private Headquarters staging site, open **AI operations → Shared issue inbox**, refresh, and select **Prepare investigation**. The selected issue's title, canonical URL, and bounded body excerpt enter the existing repair form.
3. The founder reviews and deliberately submits an investigation. This uses existing two-jobs/24h repair budget, D1 auditing and the private repair Worker. Issue synchronization itself uses zero AI calls.
4. Code can be prepared from Headquarters' repair Worker or by ChatGPT/GitHub on the tracked isolated repair branch; it remains a draft PR, not an automatic merge.
5. The existing private release/QA route requires exact current PR SHA, five CI receipts and owner-reported reproduction/fix/regression results. The report cannot certify independent browser QA by itself.
6. On matching QA success, YorpMind automatically saves one provenance-only lesson per (repair ID, commit SHA). On failures, no success lesson is recorded.

### Headquarters → ChatGPT

1. The founder can continue to start a private repair investigation directly from Headquarters.
2. The same repair form also offers **Save description as issue**. This writes a GitHub issue through the existing private GitHub-enabled Worker, separate from dispatching any AI.
3. In ChatGPT, look up that issue and continue research/code changes in the same repository, carrying the issue number and draft PR URL.
4. Returning QA to Headquarters invokes the **same** YorpMind learning path.

### Automatic YorpMind evolution

- A successful, revision-matched QA record inserts a deterministic historical lesson immediately. Duplicate events do not make duplicate memories or incur inference.
- The existing scheduled research Worker checks for missed eligible lessons daily, at most **12** records per pass; it runs before the zero-inference evolution-pattern scan.
- An ineligible result (stale SHA, incomplete CI, failed fix, incomplete regression or missing QA) is never recorded as a successful lesson.
- Lessons are private and labeled `founder_reported_qa`, not independently verified live facts.
- Lessons influence bounded retrieval and future proposals but are **not instructions** and cannot update approved skills, write code, dispatch new paid models or deploy.
- No new database migration, model, credential, provider or cost assumption is required for this stage.

### Security and deployment

- Cloudflare Access guards the private inbox Pages API; service-token identities cannot create issues.
- Same-origin and bounded JSON are enforced for issue creation; an owner is limited to five GitHub issues per UTC day.
- The private repair Worker has an internal service-binding-only endpoint. Its Worker subdomain is disabled. The new inbox never uses any public worker route.
- The browser inserts issue content only using `textContent`, and canonical GitHub issue links are built from verified numeric IDs.
- GitHub issues and PR text remain **untrusted input**, including instructions inserted by an AI agent or an external user.
- Production deployment and privileged skill execution remain **disabled**. Founder approval is a separate operation requiring a preview for the exact Git commit and independent time-limited MFA.

### What this stage does not imply

- It does **not** provide a ChatGPT account credential to Headquarters or expose private D1 directly to a public ChatGPT tool.
- An arbitrary GitHub PR created independently in ChatGPT is **not automatically imported as a verified Headquarters repair job**. For exact QA attribution, use a tracked Headquarters repair branch, or build a separate founder-reviewed PR attachment flow.
- An issue creation or GitHub PR does not automatically start a repair agent. The founder must confirm the agent dispatch.
- No claims of independent end-to-end browser QA, authentic Cloudflare billing receipts, production rollback rehearsal, or deploy authorization are made merely from these tests.

## Verification

The new units test idempotent learning, rejected CI/QA evidence, bounded daily reconciliation, private GitHub issue filtering/creation, Access-authenticated JSON/Markdown APIs, and no automatic paid AI dispatch.

Next release gate: full GitHub CI green, reviewed live staging deploy of the private repair Worker, authenticated browser smoke of issue selection and private QA, then independent staging database recovery and release review.
