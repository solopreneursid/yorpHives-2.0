# YorpHives Headquarters — Prism Night visual identity

The official YorpHives brand mark stays **exactly unchanged**. This is a
presentation-only refinement to the private founder dashboard.

## Style direction

The logo establishes a distinctive electric cyan, aqua and royal-blue
identity. The surrounding application uses the same tones against a
deep midnight-navy canvas with gentle atmospheric light:

- **Background:** #080E1B; restrained static blue/aqua radial lighting
  and a 52px grid at ~2.7% line opacity.
- **Raised surface:** #122138 / #192C47 with layered, non-flat gradients.
- **Hairline edges:** muted blue edges rather than competing heavy borders.
- **Primary action:** gradient from #71ECE9 through #66CAEE to #87ADFF,
  with very dark text (#081C2C). One luminous action per decision context.
- **Information and hover:** cool blue elevations. Supporting buttons stay
  dark and visually quieter than the primary action.
- **Warnings:** amber; errors: rose; health and permission-safe success:
  green. The visual theme must never recolor a warning as success.
- **Typography:** browser/system font stack. White headings; muted blue-grey
  supporting text; aqua section identifiers with controlled letter spacing.

### What makes the visual design feel intentional

1. Ambient backgrounds appear behind the work, not in front of it.
2. Hero panels get a subtle prism top stroke and faint circular geometry.
3. Scrollable data cards remain compact and visually aligned.
4. Navigation has one clear selected state, mirrored in cyan and blue.
5. Buttons and focus states reinforce the same visual hierarchy.
6. No gratuitous gradients on evidence paragraphs, text fields, alerts,
   data tables or every label. The owner must be able to scan quickly.
7. Animations are limited to short hover transitions and respect reduced
   motion. Reduced transparency and forced-colors settings are supported.

## Implementation boundaries

- Source: `admin/headquarters-prism-theme.css` loaded *after*
  `admin/headquarters-refined.css` and existing styles.
- No changes to `/brand/yorphives-logo.webp`, its CSS background definition,
  logo sizes, dimensions, or other logo assets.
- No new image assets, fonts, trackers, external URLs, UI libraries, Worker
  bindings, APIs, AI calls, D1 migrations, runtime scripts or privileged actions.
- All read-only and owner-approved workflows from earlier phases are retained.
- Never permit custom themes to obscure owner sign-in status, confirmation
  boundaries or production-release locks.

## QA checklist

- Test 1440px desktop, 950px tablet and 390px phone layouts.
- Check Home, YorpMind, Ideas, Market Explorer, Opportunity Radar,
  Business Intelligence, Problems to fix, incident dialog, Monitoring,
  Analytics and Publishing.
- Verify logo image path and computed CSS filter remain unchanged.
- Test contrast for high-volume text, primary button text, keyboard focus,
  red/amber/green status chips and input fields.
- Confirm the CSS grid has no horizontal overflow or pointer interaction,
  and reduced-transparency / reduced-motion settings are respected.
- Run platform tests and commit-specific staging deployment before asking
  the founder to review. A successful deployment does **not** constitute a
  signed-in screenshot or real-device browser QA.
- Production release remains disabled without preview review and the
  existing independent founder security approval.
