# YorpHives Headquarters — private monitoring system

**This repository is Headquarters, NOT the production YorpHives website.**

| Project | Git repository | Canonical directory | Responsibility |
| --- | --- | --- | --- |
| Headquarters | `solopreneursid/yorpHives-2.0` | `yorphives-workspace/headquarters/` | Monitor HQ and the website, discover issues/opportunities and report evidence for founder decisions |
| Website | `solopreneursid/YorpHives` | `yorphives-workspace/website/` | Public website, released tools/products, marketing, monetization |

**New ChatGPT/Codex session?** Read `AGENTS.md`, `PROJECT-IDENTITY.json` and `docs/PROJECT-DIRECTORIES.md` before editing any files. Verify the Git remote. The Headquarters application starts in `admin/`; the self-hosted runtime is in `self-host/` (read `self-host/README.md`).

To create or check sibling Git workspaces: `node scripts/workspace-boundaries.mjs setup` or `node scripts/workspace-boundaries.mjs verify`. To check a Headquarters path: `node scripts/workspace-boundaries.mjs guard headquarters admin/index.html`.

**Migration caveat:** This repository still retains historical website-preview code, including root `index.html` and `free-tools/`, for existing tests and preview routes. Those files are **not** the canonical live website. Do not develop public products here. See `docs/HEADQUARTERS-LEGACY-WEBSITE-EXTRACTION.md`.

**Current rule (14 November 2026): Headquarters is monitoring-only.** It observes issues, security, technologies, products, performance, revenues and markets and reports evidence and opportunities. The founder prepares, tests and publishes any code changes separately in the appropriate repository. Headquarters has no Preview, Go Live, OTP or production execution controls. See `docs/HEADQUARTERS-MONITORING-ONLY-POLICY.md`. No production deployment is authorized by code tests alone.
