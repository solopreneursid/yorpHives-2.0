import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("machine-readable discovery documents declare stable canonical URLs", async () => {
  const headers = await read("../_headers");
  const expected = [
    ["/free-tools/manifest.json", "https://yorphives.com/free-tools/manifest.json"],
    ["/.well-known/yorphives.json", "https://yorphives.com/.well-known/yorphives.json"],
    ["/openapi.yaml", "https://yorphives.com/openapi.yaml"],
  ];

  for (const [route, canonical] of expected) {
    const escapedRoute = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const block = headers.match(new RegExp(`^${escapedRoute}\\r?\\n([\\s\\S]*?)(?=^\\S|$)`, "m"));
    assert.ok(block, `Missing Cloudflare Pages header block for ${route}`);
    assert.match(block[1], new RegExp(`Link: <${canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}>; rel="canonical"`));
  }
});

test("llms.txt and discovery API are not given unnecessary canonical headers", async () => {
  const headers = await read("../_headers");
  assert.doesNotMatch(headers, /^\/llms\.txt\s*$/m);
  assert.doesNotMatch(headers, /^\/api\/v1\/free-tools\s*$/m);
});

test("canonical discovery resources remain the documented machine endpoints", async () => {
  const manifest = JSON.parse(await read("../free-tools/manifest.json"));
  const discovery = JSON.parse(await read("../.well-known/yorphives.json"));
  const openapi = await read("../openapi.yaml");

  assert.ok(manifest.length > 0);
  assert.equal(discovery.machine_interfaces.free_tools_manifest, "/free-tools/manifest.json");
  assert.equal(discovery.machine_interfaces.openapi, "/openapi.yaml");
  assert.match(openapi, /servers:\n  - url: https:\/\/yorphives\.com/);
});
