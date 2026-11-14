# YorpHives — permanent workspace separation

**Two products, two Git repositories, two sibling directories.** This page is intended for a new ChatGPT/Codex session with zero chat memory.

```text
yorphives-workspace/
├── headquarters/                        ← Private monitoring system
│   ├── .git/                              origin solopreneursid/yorpHives-2.0
│   ├── AGENTS.md                          session-independent coding rules
│   ├── PROJECT-IDENTITY.json              machine-readable identity
│   ├── admin/                             HQ UI
│   ├── functions/api/admin/               HQ API
│   ├── admin-monitor/                     monitors
│   ├── hq-intelligence/                   opportunity intelligence
│   ├── hq-engine/                         HQ mission orchestration
│   ├── self-host/                         own-server runtime and private DB
│   └── scripts/workspace-boundaries.mjs   identity and ownership guard
└── website/                             ← Public product website
    ├── .git/                              origin solopreneursid/YorpHives
    ├── index.html                         public site homepage
    ├── free-tools/                        published tools
    └── ...                                product/SEO/deployment files
```

The production website is **not** `headquarters/index.html`; that is old experimental website-preview source bundled in the Headquarters repository. The **Headquarters UI** is `headquarters/admin/index.html`. Never treat a shared filename as proof of project identity.

| Intent | Choose Git source | Allowed primary paths |
| --- | --- | --- |
| HQ design, UI, monitoring, issues, research, YorpMind, release oversight | `solopreneursid/yorpHives-2.0` | `admin/`, `self-host/`, `admin-monitor/`, `hq-intelligence/`, `hq-engine/` |
| Public YorpHives pages, free tools, growth, AdSense, new products | `solopreneursid/YorpHives` | Paths inside the separate `website/` checkout |
| Logo/shared middleware/database/configuration | Both dependencies must be inspected | No unilateral changes; record consumers and tests first |

## Create and verify on your development computer

From an existing Headquarters checkout with Node 22+ and Git installed:

```sh
node scripts/workspace-boundaries.mjs setup
node scripts/workspace-boundaries.mjs verify
```

The command creates `yorphives-workspace/headquarters` and `yorphives-workspace/website` if missing, refuses repositories pointing to the wrong origin, and does **not** merge files, move databases, alter a production site or deploy. Use an absolute directory argument to choose another workspace destination.

For future tasks:

```sh
node scripts/workspace-boundaries.mjs identify
node scripts/workspace-boundaries.mjs guard headquarters admin/index.html
```

Before changing the website, switch to the other working copy and independently verify the Git remote. `yorpHives-2.0` still retains historical public-preview files for compatibility; see `HEADQUARTERS-LEGACY-WEBSITE-EXTRACTION.md`. That remaining physical extraction is **unfinished**, even though the project ownership boundary is now explicit.

## Non-negotiable release boundary

Headquarters monitors both systems but cannot automatically repair or publish either. A founder-reviewed *target-specific* preview, deliberate Go Live action and correct OTP are prerequisites for live changes. Separate independent tests, deployment configuration, database, private secrets and audit trail for each project.
