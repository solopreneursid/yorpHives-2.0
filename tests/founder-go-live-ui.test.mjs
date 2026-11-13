import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("founder home shows one production release decision without granting admin access", async () => {
  const html = await read("../admin/index.html");
  assert.match(html, /id="founder-open-preview"/);
  assert.match(html, /id="founder-open-release"/);
  assert.match(html, /id="release-go-live"[^>]*disabled/);
  assert.match(html, /id="release-launch-preview"[^>]*aria-disabled="true"[^>]*>Preview<\/a>/);
  assert.match(html, /id="release-go-live"[^>]*>Go Live<\/button>/);
  assert.match(html, /id="view-security"/);
  assert.match(html, /class="founder-permission-panel"/);
  assert.match(html, /class="owner-delegation-panel"/);
  assert.equal((html.match(/id="founder-stop-all"/g)||[]).length,1);
  assert.doesNotMatch(html, /id="founder-open-permissions"/);
});

test("legacy D1 receipts never unlock production in the browser", async () => {
  const js = await read("../admin/release-evidence.js");
  const css = await read("../admin/release-evidence.css");
  assert.match(js, /goLive\.disabled = true/);
  assert.match(js, /preview\.setAttribute\("aria-disabled", "true"\)/);
  assert.match(js, /\/api\/admin\/go-live\?target=/);
  assert.match(js, /data\.production_deployment_enabled !== false/);
  assert.match(js, /data\.production_deployment_enabled !== false/);
  assert.match(css, /#release-go-live:disabled/);
});

test("unfinished development work is not framed as founder production approval", async () => {
  const js = await read("../functions/_lib/owner-action-center.js");
  assert.match(js, /not production approval requests/);
  assert.match(js, /No founder production approval is needed/);
});
