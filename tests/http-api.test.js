import { mockD1 } from "./helpers/mock-d1.js";
import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet as listCapabilities } from "../functions/api/v1/capabilities.js";
import { onRequestPost as execute } from "../functions/api/v1/execute.js";

function post(body, headers = {}) {
  return new Request("https://yorphives.com/api/v1/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body
  });
}

test("catalog publishes a complete available capability contract", async () => {
  const response = await listCapabilities();
  const body = await response.json();
  const capability = body.data.capabilities.find(item => item.id === "text.analyze");
  assert.equal(response.status, 200);
  assert.equal(capability.status, "available");
  assert.equal(capability.pricing.model, "free");
  assert.equal(capability.data_handling.retention, "none");
  assert.deepEqual(capability.interfaces.mcp.protocol_versions, ["2026-07-28", "2025-11-25"]);
});

test("HTTP execution returns structured success and usage", async () => {
  const response = await execute({ request: post(JSON.stringify({
    capability: "text.analyze",
    version: "1.0.0",
    input: { text: "Build useful capabilities." }
  })) , env: { DB: mockD1() } });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "succeeded");
  assert.equal(body.data.word_count, 3);
  assert.equal(body.usage.billable, false);
  assert.equal(body.data_handling.persisted, false);
  assert.ok(body.request_id);
});

test("unknown capability versions return a machine-readable discovery hint", async () => {
  const response = await execute({ request: post(JSON.stringify({
    capability: "unknown.capability",
    version: "9.9.9",
    input: {}
  })) , env: { DB: mockD1() } });
  const body = await response.json();
  assert.equal(response.status, 404);
  assert.equal(body.error.code, "CAPABILITY_NOT_FOUND");
  assert.equal(body.error.details.discover, "/api/v1/capabilities");
});

test("invalid capability input returns a non-retryable structured error", async () => {
  const response = await execute({ request: post(JSON.stringify({
    capability: "text.analyze",
    version: "1.0.0",
    input: { text: "ok", extra: true }
  })) });
  const body = await response.json();
  assert.equal(response.status, 422);
  assert.equal(body.error.code, "INVALID_INPUT");
  assert.equal(body.error.retryable, false);
});

test("execution rejects non-JSON and malformed requests", async () => {
  const unsupported = await execute({ request: post("hello", { "Content-Type": "text/plain" }) });
  assert.equal(unsupported.status, 415);
  const malformed = await execute({ request: post("{") });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, "INVALID_JSON");
});
