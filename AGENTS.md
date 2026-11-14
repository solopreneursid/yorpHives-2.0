# AGENTS.md — READ FIRST IN EVERY NEW CHAT / AGENT SESSION

> **PROJECT IDENTITY: HEADQUARTERS.** This repository is **NOT** the production YorpHives website.
> Never rely on conversation memory or project name similarities to choose a workspace.
> Confirm the actual Git origin before reading, editing, testing or deploying files.

## Identity matrix (authoritative)

| Project | Sibling checkout | Git origin | What it owns |
| --- | --- | --- | --- |
| **YorpHives Headquarters** | `headquarters/` | `solopreneursid/yorpHives-2.0` | Private monitoring, security findings, opportunities/revenue intelligence, founder dashboard and release review |
| **YorpHives Website** | `website/` | `solopreneursid/YorpHives` | Production public site, products, free tools, SEO, ads, commercial pages and public deployment |

Each directory is a **different Git repository** with its own history, tests, environment and deployment. Neither is a child application of the other. Read `docs/PROJECT-DIRECTORIES.md`.

## Mandatory pre-edit protocol for ChatGPT / Codex / coding agents

1. Read this `AGENTS.md`, `PROJECT-IDENTITY.json` and `docs/PROJECT-DIRECTORIES.md` — even when no prior chat exists.
2. Run `git rev-parse --show-toplevel`, `git remote get-url origin` and `git branch --show-current` in the chosen checkout. Or run `node scripts/workspace-boundaries.mjs identify`.
3. State in your work log: **project, checkout absolute path, exact Git origin, branch/commit and deployment target**.
4. A request about **Headquarters** only authorizes working in `headquarters/`. A request about the **website** only authorizes working in `website/`. If both are required, produce independent commits, tests and approvals. Never change the other project opportunistically.
5. For HQ-only changes run `node scripts/workspace-boundaries.mjs guard headquarters <file-relative-to-HQ-root>` before writing. This fails closed for website-only, unknown and shared paths. Unknown/shared files require explicit dependency review.
6. Verify tests and preview for the targeted project. **Do not deploy, merge or publish** without the founder's review. The exact Preview → Go Live → OTP gate remains mandatory.

## Headquarters-owned code

`admin/` = **Headquarters user interface** (not public website);
`functions/api/admin/`, `functions/admin/` = private APIs;
`admin-monitor/`, `hq-intelligence/`, `hq-engine/` = monitoring/research;
`self-host/` = self-hosted runtime and database. `admin-agent/` is historical code: its presence **does not authorize automatic repair**. HQ observes both properties and reports issues; the founder makes fixes and controls deployment.

## Misleading old paths inside THIS HQ repository

Historical **website-preview** files still exist here: root `index.html`, `app.js`, `styles.css`, `free-tools/`, `discover/`, `explore/`, `listing/`, `builder/`, `connect/`, `functions/api/v1/`, `openapi.yaml`, etc. **They are not the live website's canonical source.** Do NOT build public products in them or confuse them with Headquarters. Existing HQ tests/preview tooling depend on some of them. Their removal requires a gated migration; see `docs/HEADQUARTERS-LEGACY-WEBSITE-EXTRACTION.md`.

`brand/`, `functions/_lib/`, `functions/_middleware.js`, `migrations/`, root configuration and generic tests/docs are **shared/ambiguous**. Never assume ownership or copy secrets/data between projects.

## Safety and publishing

Headquarters is a monitoring system, not an automatic repair/deploy agent. It checks Headquarters and the website, finds vulnerabilities, updates, market openings and revenue opportunities, and queues evidence for the founder. Fixes are made by the founder (with coding assistance). Founder reviews the actual target's final preview and enters an OTP before Go Live. Separate private credentials, backups, environments and release permissions permanently.

**If this file is being read without chat memory, the correct first action is to identify the repository and project, not to invent or inherit earlier context.**
