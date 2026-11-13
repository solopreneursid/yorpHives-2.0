# Founder-first YorpHives Headquarters — permanent operating rule

## Authority order

1. **The founder (you) is above everyone and always keeps final control.**
2. **YorpMind and ChatGPT are equal first-level assistants.** The founder chooses
   either one for any finding, project or repair, without losing history.
3. **Other AI workers/employees work below those assistants**, under individual
   tasks, checks, costs and accountability.

An agent may make recommendations, create a draft issue, investigate or prepare
a preview within an explicitly permitted workflow. Being called a manager does
not grant admin authority. No agent can grant or extend its own access.

## Two equivalent ways to work

- **Work with ChatGPT:** The founder receives a copyable message with the
  finding, what is known, and the expected next steps. It can be sent through
  ChatGPT's connected GitHub workflow. The Headquarters website does not
  silently send ChatGPT private records or execute actions on its behalf.
- **Give to YorpMind:** The same finding is placed in Headquarters' existing
  investigation form for the founder to review and start deliberately.
- **Shared learning:** Both paths use one GitHub issue/PR history. YorpMind
  automatically records historical lessons from actual revision-matched CI
  and founder-reported reproduction/fix/regression QA, with provenance.
  AI draft text or a bare report is not evidence of a successful fix.

## Temporary permissions (Phase 11)

The founder may ask to grant YorpMind **or** ChatGPT temporary permission to
help with the website, Headquarters, or both.

Every permission includes:

- Named assistant: `yorpmind` or `chatgpt`
- Specific area and activity: review findings, prepare fixes or prepare
  changes for a test version
- Founder-written reason
- Duration: 15, 30 or 60 minutes
- Maximum of 3 connected actions per approval
- A separate **fresh Cloudflare Access MFA** security confirmation before it
  becomes active, plus immediate cancellation and an immutable audit history
- Automatic rejection after expiry even without a scheduled cleanup job
- A unique verified service identity bound to each assistant via a **separate
  Cloudflare Access audience**, distinct from founder and CI identities

**Important current capability limit:** Only the low-impact `create_issue`
action is connected to the temporary assistant service route in this phase,
and only for approved `prepare_fixes` or `manage_staging` permissions.
Reading/research may occur through normal existing read-only channels.
No generic root-admin, D1 arbitrary SQL, permission editing, account access,
skill approval, billable AI dispatch, production deployment, GitHub merge
or Cloudflare credential management is exposed through a temporary grant.

Even an approved temporary permission is unusable until an **actual**
distinctly authenticated YorpMind/ChatGPT service integration is configured.
The existence of a ChatGPT conversation or GitHub connector is **not**
proof that such a service identity is connected. The browser displays
that limitation. Never store or paste OTP codes into ChatGPT or YorpMind.

The older exact-commit production release workflow remains separate,
with its own preview, CI/QA evidence, independently verified MFA and a
disabled release executor. Temporary permissions **cannot bypass** it.

## Human-first interface rule

The founder home page should show, in this order:

1. Plain-language explanation of who is in charge and the assistants below.
2. What needs attention, and clear choices: **Work with ChatGPT** /
   **Give to YorpMind**.
3. What the assistants are working on and what needs the founder's judgment.
4. A simple temporary-permission form with who/where/what/how long/why and
   one secure confirmation step.
5. Technical diagnostics, IDs, raw data, infrastructure status and
   implementation terms behind optional **Advanced details** controls.

Prefer “Your team is working,” “Needs your review,” “Stop permission,”
“Try again” and “Show me what changed” to acronyms, internal table
names, worker IDs or commands. Never claim a test is complete unless a
real test record supports it. Always distinguish staging previews from
the real public website.

## Operations and deployment

This is a GitHub draft development feature. Migration 0028 must be
backup/restore-tested before applying to private staging; earlier schema
0027 and the SQL migration ledger are still pending reconciliation. A
distinct Cloudflare Access MFA application and separate assistant service
identities must be independently configured and tested before any grants
can become effective. No credentials or OTPs are invented here.

Full repository CI, verified staging preview, authenticated browser QA,
explicit permissions tests, cumulative security review and founder
approval remain required. Do not merge or publish these changes to
production automatically.
