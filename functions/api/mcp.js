import { analyzeText } from "../_lib/text-analyze.js";
import { errorResponse, json, preflight, readJson, requestId } from "../_lib/http.js";

const PROTOCOL_VERSION = "2025-03-26";
const tool = {
  name: "text_analyze",
  title: "Analyze text",
  description: "Analyze text structure and frequent terms. Deterministic, free, and does not persist input.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["text"],
    properties: { text: { type: "string", minLength: 1, maxLength: 20000, description: "Text to analyze. Do not include secrets or sensitive personal data." } }
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
};

function rpcResult(id, result) { return json({ jsonrpc: "2.0", id, result }); }
function rpcError(id, code, message, data) { return json({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } }); }

export async function onRequestOptions() { return preflight(); }
export async function onRequestGet() {
  return json({ name: "YorpHives MCP", protocolVersion: PROTOCOL_VERSION, transport: "streamable-http", endpoint: "/api/mcp", tools: [tool.name] });
}
export async function onRequestPost({ request }) {
  const id = requestId(request);
  if (!(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) {
    return errorResponse("UNSUPPORTED_MEDIA_TYPE", "MCP requests must use application/json.", 415, id);
  }
  const parsed = await readJson(request);
  if (!parsed.ok) return errorResponse(parsed.reason === "too_large" ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON", "MCP request must be valid JSON within 96 KB.", parsed.reason === "too_large" ? 413 : 400, id);
  const rpc = parsed.value;
  if (!rpc || rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") return rpcError(rpc?.id ?? null, -32600, "Invalid JSON-RPC request.");

  if (rpc.method === "notifications/initialized" || rpc.method.startsWith("notifications/")) return new Response(null, { status: 202 });
  if (rpc.method === "initialize") {
    return rpcResult(rpc.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "yorphives", title: "YorpHives Capability Network", version: "0.1.0" },
      instructions: "Discover public capabilities before invocation. Capability pricing, limits, and data handling are declared in the catalog."
    });
  }
  if (rpc.method === "ping") return rpcResult(rpc.id, {});
  if (rpc.method === "tools/list") return rpcResult(rpc.id, { tools: [tool] });
  if (rpc.method === "tools/call") {
    const name = rpc.params?.name;
    if (name !== tool.name) return rpcError(rpc.id, -32602, "Unknown tool.", { available_tools: [tool.name] });
    const result = analyzeText(rpc.params?.arguments || {});
    if (!result.ok) {
      return rpcResult(rpc.id, { isError: true, content: [{ type: "text", text: result.message }], structuredContent: { code: result.code, details: result.details } });
    }
    return rpcResult(rpc.id, {
      isError: false,
      content: [{ type: "text", text: JSON.stringify(result.data) }],
      structuredContent: result.data
    });
  }
  return rpcError(rpc.id ?? null, -32601, "Method not found.");
}
