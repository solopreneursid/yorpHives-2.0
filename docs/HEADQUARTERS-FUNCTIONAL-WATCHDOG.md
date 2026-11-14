# Browser-functional monitoring — first verified-journey slice

**Scope:** YorpHives Headquarters development branch only. The public website repository and production deployment have not been modified.

## What it proves (and what it does not)

This optional, independent, self-hosted browser watcher drives **real user-facing interactions** against the canonical public File Studio at `https://yorphives.com/free-tools/file-studio/`. It compares visible output to deterministic expectations for:

- JSON Formatter (pretty-print a JSON document)
- JSON Minifier (remove formatting without changing data)
- Base64 Encoder (encode a known UTF-8 phrase)
- URL Decoder (decode a known encoded phrase)

A successful HTTP 200 is **not** a passing product check. An exact expected output gives `functionally_verified` evidence **for that operation only**. It does not establish that other tools, PDFs, uploads, downloads, mobile gestures, payments, analytics, SEO or the whole website work.

Each result records observation time, source URL, result, duration, a reason code and SHA-256 digests for expected/observed outputs. It never records a real user's input or personal document. Four fixed test phrases are built into the watcher; no visitor data is sent. All browser network requests other than `https://yorphives.com` are blocked. A redirect or missing UI is not assumed to be a successful check.

## Optional browser engine setup

The owner can install open-source Playwright and its Chromium browser **on their own machine/server** after the usual Headquarters setup. This is a separate monitoring process, not a cloud integration.

```sh
cd yorphives-headquarters
npm install --no-save --no-package-lock playwright
npx playwright install chromium
node self-host/functional-watchdog.mjs
```

Playwright is optional and deliberately not a required Headquarters dependency. Running `npm ci` may remove this separately installed package; reinstall the optional browser engine after upgrading your local checkout.

The watcher starts immediately, then checks every ten minutes. Set `HQ_FUNCTIONAL_INTERVAL_MS` to a whole number between 60000 and 3600000 to adjust the period. Browser launches and actions have bounded timeouts. Playwright or Chromium not installed is **unavailable coverage**, never "site working" or "site broken." A functional mismatch or failed interaction is a candidate incident to investigate, not an automatic fix.

## Founder Pulse and evidence storage

Use the same private `YORPHIVES_DATA_DIR` for the Headquarters server and the browser watchdog. The watchdog atomically writes one owner-only (`0600`) `functional-checks.json` file. It contains only bounded evidence metadata, not page contents, credentials or a screenshot. A missing or invalid snapshot is explicitly `not_connected` or `invalid`, and results older than 25 minutes are `stale`.

The self-hosted server exposes `GET /api/admin/functional-checks` **only after its ordinary owner login**. No POST, repair, public webhook, publishing, model call or credential grant exists. A separate read-only card is displayed above the Founder Pulse feed, showing passes, failures, unavailable coverage and the time of recorded evidence. Existing Founder Pulse data and Cloudflare-hosted interface behavior remain unchanged.

Events and heartbeat JSON also appear in the browser watchdog's process logs. State transitions produce `initial`, `regression` or `recovery` events; every poll prints a heartbeat. These are **local log records, not remotely delivered notifications**.

## Running it reliably

The process must be supervised independently of Headquarters. On a Linux machine whose checkout is at `~/yorphives-headquarters`, you can optionally register a user service:

```sh
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/yorphives-functional-watchdog.service <<'UNIT'
[Unit]
Description=YorpHives independent browser-functional monitoring

[Service]
Type=simple
WorkingDirectory=%h/yorphives-headquarters
ExecStart=/usr/bin/env node self-host/functional-watchdog.mjs
Restart=always
RestartSec=30
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now yorphives-functional-watchdog.service
journalctl --user -u yorphives-functional-watchdog.service -n 30 --no-pager
```

Do not enable this unit on an unprepared server. Check the actual checkout location, executable Node version, directory permissions and Chromium dependencies first. If your actual checkout path differs, update the unit file's `WorkingDirectory` before enabling it. The existing `self-host/watchdog.mjs` remains a separate lightweight uptime/readiness supervisor and should continue running in its own independent process.

**Production truth:** this branch contains code and tests only. No browser watcher has been installed on the founder's live server, no true production browser journey has been run by this PR, and no remote email/SMS/push alert channel has been connected. Browser-monitor logs and the Founder Pulse card are not a substitute for off-server monitoring when the entire machine is offline.

## Test locally

```sh
node --test tests/functional-watchdog.test.mjs
npm run check
```

The unit tests use a fake browser to verify exact output checks, domain blocking, failed inputs, missing browser coverage, snapshot freshness, and event transitions. **Mock tests are not evidence of a live website pass.** Before any external development deployment, review full CI, isolate staging storage and separately verify authenticated desktop/mobile behavior.

**Policy:** Headquarters observes, analyzes and recommends. The founder codes and deploys separately.
