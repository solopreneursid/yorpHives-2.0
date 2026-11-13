# Project directories

Keep two sibling Git checkouts.

| Directory | Purpose | Repository |
| --- | --- | --- |
| `headquarters/` | Private monitoring, research, revenue intelligence and founder release controls | `solopreneursid/yorpHives-2.0` |
| `website/` | Public website and released products | `solopreneursid/YorpHives` |

The Headquarters development branch is `fix/founder-approval-at-production-only`. The public website checkout uses its default branch. Directory names identify the projects even though the historical repository names differ.

To create this layout in an empty workspace, run:

```sh
git clone --branch fix/founder-approval-at-production-only https://github.com/solopreneursid/yorpHives-2.0.git headquarters
git clone https://github.com/solopreneursid/YorpHives.git website
```

Check identity before work:

```sh
git -C headquarters remote get-url origin
git -C headquarters branch --show-current
git -C website remote get-url origin
git -C website branch --show-current
```

Headquarters source starts at `headquarters/admin/`, its private APIs at `headquarters/functions/api/admin/`, and its self-hosted runtime at `headquarters/self-host/`. Public product source starts at `website/`.

The Headquarters repository retains legacy website preview files and shared build inputs. This directory separation establishes independent working checkouts, not a completed extraction of those historical files. Follow `AGENTS.md` for ownership boundaries until their callers and deployment tooling are migrated together.
