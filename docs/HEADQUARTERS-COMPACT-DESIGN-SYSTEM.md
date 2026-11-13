# YorpHives Headquarters — compact, human-first UI

## Design review and defect corrected

The founder's Firefox screenshots of the private staging site showed:

- Changing a page while scrolled far down retained the old page's offset,
  making the left column appear blank while right-side activity continued.
- A large, always-visible sidebar displaced the actual work and made
  navigation longer than necessary.
- Huge research and insight cards created mismatched columns and excessive
  empty space, especially when the sidebar held more entries than the main list.
- Issue and recommendation tables expanded down the entire document without
  a practical within-panel scroll, sticky headings or a clear decision path.
- The original issue titles surfaced technical header names rather than
  the owner's problem in everyday language.

## Non-negotiable interaction model

- Top level: **the founder**. YorpMind and ChatGPT remain peer assistants;
  all other AI specialists sit below.
- Landing view: see who is in charge, what needs attention and the
  corresponding next action before research and technical information.
- Left navigation: **My Home**, **YorpMind**, **Problems to fix**, **Fix
  problems** always visible. Ideas and less-frequent operational tools live in
  accessible native collapsible groups. All existing route keys are retained.
- Every selected page resets the document scroll to top and expands the active
  navigation group automatically.
- Research and action lists have a bounded vertical region with a visible
  scrollbar and keyboard focus. No result is removed or silently truncated;
  original evidence remains reachable.
- Research sidebars use a matching bounded height so a short main list
  never creates enormous empty page regions.
- Suggestions that are *not confirmed problems* start collapsed.
- Low-priority public source records and tool-level activity are available
  behind explicit **Explore** controls, not always on screen.
- Issue titles are summarized in plain language with their original evidence
  in a smaller visible line, a full hover title, and a detailed incident panel.
  The row action **Mark investigating** only changes review status; it does
  not start an AI model. **View details** opens the actual evidence.
- From the full incident view, the founder chooses **Work with ChatGPT**
  (copyable prompt) or **Prepare for YorpMind** (existing founder-confirmed
  investigation form). Neither choice silently executes a fix.
- Dark theme, cyan focus/selection, accessible contrast, mobile 390px
  responsiveness and reduced-motion support.

## Architecture

This phase is presentation-only: `admin/headquarters-refined.css` is a
standalone last-loaded stylesheet, `admin/headquarters-refined.js` provides
progressive disclosure and keyboard scrolling, and existing data APIs,
Cloudflare Access, signed assistant identity checks and release gates remain
unchanged.

It intentionally does not introduce image assets, webfonts, UI frameworks,
paid providers, database migrations, Cloudflare Worker writes or new
privileged behavior. Avoid changing shared generated Tailwind CSS directly
for these view-specific refinements.

## QA and release evidence

- Node contract tests verify every route and its native collapse/scroll
  structure; existing platform tests guard core behavior.
- The real Access-authenticated Playwright smoke script now tests cross-page
  scroll reset, research sidebar bounds, the issues list and a 390px viewport.
  Those smoke steps do **not** count as having run unless their credentialed
  report actually exists.
- Release to a new staging Pages commit first; compare that SHA with
  GitHub CI. Manually inspect Home, Ideas, Market Explorer, Problems,
  incident dialog, phone/tablet layouts and short/long data cases.
- The production website and admin production permissions are unchanged
  until the founder separately reviews the exact preview and approves a
  scoped release through independent MFA.

## Visual consistency rules for future pages

1. Primary content never shares row height with an unbounded sidebar.
2. Default card padding 12–18px; 9–13px gaps; no giant decorative
   spacers or repeated explanatory paragraphs.
3. Main heading stays close to the controls it introduces.
4. Within-panel scroll regions are capped around 400–650px desktop;
   sticky table headings and visible keyboard focus are mandatory.
5. Desktop uses stable 2-column grids when useful, 1-column stacks
   on small screens. Never allow document-wide sideways scroll.
6. Use progressive native disclosure for advanced details, without
   removing original evidence or functional controls.
7. A single action label must explain exactly what happens:
   "View details", "Mark investigating", "Prepare for YorpMind", etc.
8. Keep the release, security and identity constraints visible at the
   point where the founder can authorize something; don't bury them
   underneath a generic success banner.
