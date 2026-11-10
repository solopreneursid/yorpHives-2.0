# Isolated preview deployment

Cloudflare Pages project: `yorphives-2-preview`

Project production-branch origin: `https://yorphives-2-preview.pages.dev`

Trust-commerce preview branch: `build/trust-commerce-foundation`

Trust-commerce preview alias: `https://build-trust-commerce-foundat.yorphives-2-preview.pages.dev`

The project is connected to this repository. The configured production branch remains `build/capability-platform-foundation`; the trust-commerce branch deploys as a preview environment. The preview environment alone is bound to D1 database `yorphives-2-trust-preview`. The project is isolated from the existing `yorphives.com` Pages project and does not attach production custom domains.

Build command: `npm run build`

Output directory: `dist`

**GitHub push-triggered preview deployment is verified.** A push to `build/trust-commerce-foundation` produced a Cloudflare Pages preview deployment, and the GitHub Actions smoke-test job successfully exercised the branch alias.

The preview must pass browser, API, MCP, accessibility, security, migration, and build verification before any production migration is considered.
