import { mockD1 } from "./helpers/mock-d1.js";
import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/mcp.js";

function request(payload, headers = {}) {
  return new Request("https://yorphives.com/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload)
  });
}

test("modern MCP discovery advertises stateless current protocol", async () => {
  const response = await onRequestPost({ request: request({
    jsonrpc: "2.0",
    id: "discover-1",
    method: "server/discover",
    params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {} } }
  }, { "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "server/discover" }) });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.result.resultType, "complete");
  assert.deepEqual(body.result.supportedVersions, ["2026-07-28", "2025-11-25"]);
});

test("modern MCP tool call enforces required routing headers and returns structured output", async () => {
  const response = await onRequestPost({ request: request({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "text_analyze",
      arguments: { text: "Hello agent. Hello internet!" },
      _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {} }
    }
  }, { "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "tools/call", "Mcp-Name": "text_analyze" }), env: { DB: mockD1() } });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.result.resultType, "complete");
  assert.equal(body.result.structuredContent.word_count, 4);
  assert.equal(body.result.isError, false);
});

test("modern MCP rejects mismatched routing headers", async () => {
  const response = await onRequestPost({ request: request({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/list",
    params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } }
  }, { "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "tools/call" }) });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.error.code, -32020);
});

test("MCP blocks untrusted browser origins", async () => {
  const response = await onRequestPost({ request: request({
    jsonrpc: "2.0",
    id: 4,
    method: "server/discover",
    params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } }
  }, { "Origin": "https://attacker.example", "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "server/discover" }) });
  assert.equal(response.status, 403);
});

test("legacy MCP clients can initialize and invoke tools", async () => {
  const init = await onRequestPost({ request: request({
    jsonrpc: "2.0", id: 5, method: "initialize",
    params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test-client", version: "1.0.0" } }
  }) });
  const initBody = await init.json();
  assert.equal(initBody.result.protocolVersion, "2025-11-25");

  const call = await onRequestPost({ request: request({
    jsonrpc: "2.0", id: 6, method: "tools/call",
    params: { name: "text_analyze", arguments: { text: "Legacy client works." } }
  }, { "MCP-Protocol-Version": "2025-11-25" }), env: { DB: mockD1() } });
  const callBody = await call.json();
  assert.equal(callBody.result.structuredContent.word_count, 3);
});
