# Founder Pulse — social-style Headquarters Home

## Purpose
Make the private Headquarters easy to browse like a familiar social-media app while keeping the complicated monitoring, research, evidence and release machinery behind clear destinations.

This is **Headquarters only**, not a change to the public website. The operational app remains a **monitoring and recommendation system**; it is not authorized to repair, approve, purchase or deploy.

## What appears

- A compact founder greeting and four current-record counters are retained.
- The new **Your daily pulse** section renders card-style posts from existing private cockpit records.
- Filter tabs: **For you**, **Needs attention**, **Work & activity**, **Discover**. These are view-only filters, not task triggers.
- The right rail shows the last recorded monitoring picture, a review digest count and an explicit founder-only publishing boundary.
- On mobile, a bottom bar opens **Home**, **Inbox**, **Discover** and **Releases**, matching the existing sidebar routes. The desktop sidebar remains the full navigation.
- The original issue workspaces, research details, mission desk, action queue, audit trail, Preview and Go Live flows are unchanged and remain accessible.

## Evidence contracts

The browser file `admin/founder-pulse.js` only subscribes to `yorphives:cockpit-evidence` events emitted by the existing `admin/cockpit.js` after it validates the authenticated `/api/admin/cockpit` response.

It performs **no API calls**, launches no model, makes no mutation, has no credentials and requires no third-party UI package. All text from records is inserted using `textContent`, never HTML injection. Destination links are limited to fixed existing private navigation keys.

- Monitoring counts describe stored checks, *not current guaranteed live health*.
- Finding counts never treat unavailable data as zero.
- Opportunities are described as hypotheses, *not verified demand or revenue*.
- The feed is labeled partial when a source is unavailable.
- An authentication or loading failure clears stale cards and shows a retry/disconnected state.
- The feed is capped at nine overview cards; complete detail is available in dedicated workspaces.

## Verification and UX

- A desktop layout keeps feed + supporting context side by side.
- Tablet stacks the sidebar cards and keeps the feed readable.
- Mobile uses a fixed safe-area-aware navigation dock and a single-column feed.
- Tabs support ArrowLeft/ArrowRight/Home/End in addition to pointer and touch.
- `tests/headquarters-founder-pulse.test.mjs` covers markup and non-privilege constraints.
- `scripts/headquarters-offline-visual.mjs` exercises real HTML/CSS/JS against **synthetic** read-only records: source-backed cards, filters, keyboard behavior, outage clearing, partial evidence and mobile dock.
- Offline visual QA does **not** verify a signed-in live environment.

## Boundaries and remaining work

The mobile/desktop changes are UI-level; permissions, data schema, route behavior, website files and existing release processing remain untouched. The existing Founder Go Live/OTP workflow is still incomplete and must not be represented as production-ready. Founder approval for a target-specific preview is required before release; running tests or creating a PR is never permission to publish.
