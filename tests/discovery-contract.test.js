import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));

test("machine discovery manifest is valid and advertises supported protocols", async () => {
  const manifest = await readJson("../public/.well-known/yorphives-capabilities.json");
  assert.equal(manifest.name, "YorpHives");
  assert.ok(manifest.protocols.some(item => item.name === "http-json"));
  const mcp = manifest.protocols.find(item => item.name === "mcp");
  assert.deepEqual(mcp.protocol_versions, ["2026-07-28", "2025-11-25"]);
});

test("OpenAPI contract is valid and exposes discovery, execution, and MCP", async () => {
  const openapi = await readJson("../public/openapi.json");
  assert.equal(openapi.openapi, "3.1.0");
  assert.ok(openapi.paths["/api/v1/capabilities"]);
  assert.ok(openapi.paths["/api/v1/execute"]);
  assert.ok(openapi.paths["/api/mcp"]);
});
