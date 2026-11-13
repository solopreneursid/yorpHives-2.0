# YorpHives Headquarters project boundary

This repository's active project is YorpHives Headquarters, the private monitoring and intelligence system. Use a checkout directory named `headquarters`. The separate public product website belongs in a sibling `website` checkout of https://github.com/solopreneursid/YorpHives.git.

## Headquarters scope

- Interface: `admin/`.
- Private API: `functions/api/admin/`, `functions/admin/`, and related private modules in `functions/_lib/`.
- Monitoring and research: `admin-monitor/`, `hq-intelligence/`, `hq-engine/`.
- Self-hosted runtime: `self-host/`.
- Supporting records: Headquarters migrations, tests, scripts and documentation.
- Historical repair implementation: `admin-agent/`. Its presence does not authorize autonomous repairs.

Headquarters observes both systems, collects evidence, researches opportunities and revenue, and recommends actions. The founder owns changes. Publishing requires the founder's exact Preview → Go Live → OTP flow. Keep monitoring permissions separate from release execution.

## Website boundary

Public products and their production source are maintained in the sibling `website` repository. Resolve repository and branch before editing, testing or releasing. A Headquarters request authorizes Headquarters work. It does not authorize unrelated changes to public products.

This repository still contains legacy website-preview assets (`index.html`, `app.js`, `styles.css`, `free-tools/`, `discover/`, `explore/`, `listing/`, `builder/`, `connect/`, and `functions/api/v1/`). They remain here because current tests and preview tooling reference them. Treat them as legacy website scope, never as Headquarters UI. Migration must update callers, tests and deployment inputs together.

Brand assets, middleware, database history and root build configuration currently have shared callers. Inspect those callers before changing them. Never copy live database files, credentials or runtime state between projects.

## Working practice

Run Headquarters commands from `headquarters/` and website commands from `website/`. Use explicit working directories. Keep each repository's commits, tests, previews and release target identifiable. A successful website check does not verify Headquarters, and a successful Headquarters check does not verify the website.
