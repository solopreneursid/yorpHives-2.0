# Isolated preview deployment

Cloudflare Pages project: `yorphives-2-preview`

Preview origin: `https://yorphives-2-preview.pages.dev`

The project is connected to this repository and currently uses `build/capability-platform-foundation` as its deployment branch. It is isolated from the existing `yorphives.com` Pages project and does not attach production custom domains.

Build command: `npm run build`

Output directory: `dist`

The preview must pass browser, API, MCP, accessibility, security, and build verification before any production migration is considered.

Automatic GitHub push-triggered deployment has not yet been verified. The current preview deployment was triggered through the Cloudflare Pages API. Until the Cloudflare GitHub App webhook is confirmed for this repository, redeployments must be explicitly triggered; do not assume a Git push has reached the preview site.
