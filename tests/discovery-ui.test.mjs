import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Free Tools page provides functional browser-local utilities", async () => {
  const html = await read("../free-tools/index.html");
  const manifest = JSON.parse(await read("../free-tools/manifest.json"));
  const runtime = await read("../free-tools/tool-runtime.js");
  const advanced = await read("../free-tools/advanced-runtime.js");
  assert.match(html, /Word & character counter/i);
  assert.match(html, /tool-search/);
  assert.match(html, /data-filter/);
  assert.ok(manifest.length >= 55);
  assert.match(runtime, /JSON\.parse/);
  assert.match(runtime, /encodeURIComponent/);
  assert.match(advanced, /qr-code-generator/);
  assert.match(advanced, /pdf-merger/);
});

test("Explore is a dedicated YorpHives application marketplace", async () => {
  const html = await read("../explore/index.html");
  const script = await read("../explore/explore.js");
  assert.match(html, /YORPHIVES APP MARKETPLACE/);
  assert.match(html, /YORPHIVES-BUILT ONLY/);
  assert.match(script, /api\/v1\/catalogue\?type=application/);
  assert.match(script, /encodeURIComponent\(item\.slug\)/);
});

test("Builder is positioned as paid opportunity discovery without claiming checkout is live", async () => {
  const html = await read("../builder/index.html");
  assert.match(html, /paid membership/i);
  assert.match(html, /developers/i);
  assert.match(html, /creators/i);
  assert.match(html, /bloggers/i);
  assert.match(html, /checkout and protected member access are not active yet/i);
  assert.doesNotMatch(html, /Pay now|Subscribe now/);
});

test("Connect page sends project enquiries to the YorpHives contact address", async () => {
  const html = await read("../connect/index.html");
  assert.match(html, /connect@yorphives\.com/);
  assert.match(html, /id="build-request-form"/);
  assert.match(html, /mailto:connect@yorphives\.com/);
});

test("legacy discovery page routes visitors to the dedicated product surfaces", async () => {
  const html = await read("../discover/index.html");
  assert.match(html, /url=\/free-tools\//);
  assert.match(html, /href="\/explore\//);
  assert.match(html, /href="\/builder\//);
});

test("listing detail page loads by slug and validates external destinations", async () => {
  const html = await read("../listing/index.html");
  const script = await read("../listing/app.js");
  assert.match(html, /id="listing-content"/);
  assert.match(html, /aria-controls="mobile-nav"/);
  assert.match(html, /<nav id="mobile-nav"/);
  assert.match(script, /\/api\/v1\/catalogue\//);
  assert.match(script, /url\.protocol === "https:" \|\| url\.protocol === "http:"/);
  assert.match(html, /rel="noopener noreferrer"/);
});
