# Headquarters live issue repair and YorpMind employee coaching

## Evidence read from private staging (13 Nov 2026)

Database: `yorphives-2-catalogue-preview`. Do not publish identifiers,
owner email, raw AI output, secrets, private issue evidence, or arbitrary
user-supplied content through the public website.

- Latest scheduled uptime check: **7/7 monitors passed**. Two older
  Cloudflare Access 401 findings were already recorded as **verified**.
  HTTP 401 at a protected admin route is not by itself an outage.
- Asset monitor: **5 investigating low-priority `missing-canonical`
  findings** on JSON/YAML/text/API discovery routes; 14 other security
  findings were marked `fixed`. Those security statuses alone do not
  substitute for a fresh verified live HTTP security-header check.
- Repair job records: **2 failed**. Both report `Workers AI returned no
  text response.` and attempted a canonical-tag change on a machine-readable
  document. Neither produced a branch, independent QA or a draft patch.
- Previously **0** `yorpmind_experiences`, 0 `yorpmind_team_reports`,
  0 successful revision-matched repair-QA records.

**Important observation:** The stored monitor's historical evidence for some
machine-readable routes said `text/html`. This could indicate a real HTML
fallback, wrong deployed content, unexpected content negotiation or an old
monitor response. Live independent HTTP fetches were not available in this
inspection environment. The updated monitor must distinguish these possibilities
instead of automatically declaring a canonical-link repair successful.

## Implemented remediation

### 1. Accurate document-format checks

`admin-monitor/asset-policy.js` defines the expected response format for
the manifest, OpenAPI YAML, `llms.txt`, robots, sitemap, well-known
discovery and the Free Tools API.

`admin-monitor/asset-intelligence.js` now:

- Requires a valid machine-readable representation and status 200.
- Reports an HTML fallback, wrong MIME type or invalid JSON as a
  **functionality problem** with bounded provenance.
- Applies HTML title, description and canonical checks **only to HTML
  pages**, not to discovery files or API endpoints.
- When a previous machine-readable document has a `missing-canonical`
  finding, retires the false positive with an explicit explanation that
  it was a mistaken monitoring rule; this **does not certify the route**.
- Reports a wrong response format independently, so no real routing
  breakage is silently hidden.

### 2. Avoid expensive or impossible repair dispatch

`functions/_lib/repair-intake.js` is a read-only policy. The existing
Cloudflare Access-protected repair endpoint now checks that a recorded
finding is active and targets a file the restricted page-repair Worker is
authorized to change.

- JSON, YAML, XML, text, API and discovery routes => **specialist review**.
- Security headers and Cloudflare zone policy => **security review**.
- Informational change observations => **confirm a real defect first**.
- Eligible ordinary page problems => normal bounded draft workflow.

An ineligible request stops **before a repair job or model call is created**,
with an actionable explanation and a ChatGPT/YorpMind handoff suggestion.
This does not grant either assistant more privileges.

### 3. Honest Workers AI result handling

`admin-agent/model-output.js` safely reads common Workers AI result
structures, extracts bounded JSON without promoting model reasoning, and
refuses empty/truncated responses. The Repair Worker uses the parser both
for patch generation and independent AI review.

Generation and code-review steps have **no automatic retry**, so one
bad provider response cannot silently double bill the model. Model
reasoning effort is explicitly bounded to `medium` with fixed completion
limits. This mitigates failures; only a real staging model run can verify
end-to-end usefulness. Do not claim a real AI repair was completed.

### 4. Training YorpMind and its employees with provenance

`functions/_lib/yorpmind-repair-coaching.js` extracts up to four small
**unverified coaching proposals** per daily scan from actual failed
`admin_repair_jobs` and source links:

- **YorpMind 1 · Engineering Lead / Engineering worker:** investigate
  empty model results, response shapes, completion limits, and
  retry-related spending before considering any patch.
- **YorpMind 5 · Quality & Security Observer / Quality worker:**
  investigate the incorrect HTML SEO rule for non-HTML files and require
  a response-type check and independent verification.

The existing team scan stores these as `yorpmind_team_reports`
(state `proposed`), preserving source job identifiers and a clear
`tested_fix:false`, `approved_skill:false` declaration. It is bounded
and uses **zero AI inference calls**, with no new autonomous authority.

**Applied to private staging D1 on 13 November 2026:** Four incident-
linked coaching reports were recorded from the two real failed repair jobs:
two for `yorpmind1` (Engineering) and two for `yorpmind5` (Quality).
All are in `proposed` state, marked `tested_fix:false` and
`approved_skill:false`. The import used zero AI calls, zero production
changes, and passed `PRAGMA foreign_key_check`. Verified repair
experiences, approved skills and independent issue-specific QA remained **0**.
A pre-write Cloudflare D1 Time Travel bookmark was captured, and the
insertions were recorded in the private Headquarters audit log.

The current YorpMind UI labels those cards **OBSERVED · NEEDS PROOF**.
They may help workers decide what to investigate, but **do not**
constitute an approved skill or verified repair. Actual self-evolution
through `yorpmind_experiences` remains gated on founder-reported,
independently verified, matching-commit QA.

### QA and launch boundaries

Tests cover real observed failure categories, route classification,
read-only repair preflight, model wrappers, truncation handling,
idempotent coaching ingestion, absence of model spending and no
unexpected autonomous approvals.

**Not in this change:** deployment to the public website, Admin Agent
Worker or monitoring Worker; making D1 production writes; asserting
that historical security findings truly are fixed; adding or approving
YorpMind skills; granting temporary rights; merging the stacked PRs.

The next step after staging preview and GitHub CI is an independently
authenticated browser check, a staged monitor rerun that demonstrates
correct response contracts, and a genuine repair QA record before
YorpMind graduates a candidate into an approved reusable lesson.
