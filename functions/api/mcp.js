import { analyzeText } from "../_lib/text-analyze.js";
import { errorResponse, json, preflight, readJson, requestId } from "../_lib/http.js";
import { authorizeCapability, recordUsage } from "../_lib/platform.js";

const MODERN_VERSION = "2026-07-28";
const LEGACY_VERSION = "2025-11-25";
const SUPPORTED_VERSIONS = [MODERN_VERSION, LEGACY_VERSION];
const SERVER_INFO = { name: "yorphives", title: "YorpHives Capability Network", version: "0.1.0" };

const tool = {
  name: "text_analyze",
  title: "Analyze text",
  description: "Analyze text structure and frequent terms. Deterministic, free, and does not persist input. Do not submit secrets or sensitive personal data.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["text"],
    properties: {
      text: {
        type: "string",
        minLength: 1,
        maxLength: 20000,
        description: "Text to analyze. Input is processed in memory and is not stored."
      }
    }
  },
  outputSchema: {
    type: "object",
    required: ["word_count", "character_count", "sentence_count", "estimated_reading_minutes", "top_terms"],
    properties: {
      word_count: { type: "integer" },
      character_count: { type: "integer" },
      character_count_without_spaces: { type: "integer" },
      sentence_count: { type: "integer" },
      paragraph_count: { type: "integer" },
      estimated_reading_minutes: { type: "integer" },
      top_terms: { type: "array", items: { type: "object", properties: { term: { type: "string" }, count: { type: "integer" } } } }
    }
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

function rpcResult(id, result) {
  return json({ jsonrpc: "2.0", id, result });
}

function rpcError(id, code, message, data, status = 200) {
  return json({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data ? { data } : {}) } }, status);
}

function originAllowed(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return false;
    const host = url.hostname.toLowerCase();
    return host === "yorphives.com" ||
      host === "www.yorphives.com" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "yorphives-2-preview.pages.dev" ||
      host.endsWith(".yorphives-2-preview.pages.dev");
  } catch {
    return false;
  }
}

function protocolError(id, requested) {
  return rpcError(id, -32022, "Unsupported protocol version.", {
    supported: SUPPORTED_VERSIONS,
    requested: requested || null
  }, 400);
}

function validateModernHeaders(request, rpc) {
  const methodHeader = request.headers.get("Mcp-Method");
  if (methodHeader !== rpc.method) return { ok: false, message: "Mcp-Method header must match the JSON-RPC method." };

  if (rpc.method === "tools/call") {
    const nameHeader = request.headers.get("Mcp-Name");
    if (nameHeader !== rpc.params?.name) return { ok: false, message: "Mcp-Name header must match params.name." };
  }
  return { ok: true };
}

function discoverResult() {
  return {
    resultType: "complete",
    supportedVersions: SUPPORTED_VERSIONS,
    capabilities: { tools: {}, resources: {} },
    _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO },
    instructions: "Discover capabilities before invocation. The text_analyze tool is free, deterministic, read-only, has no external side effects, and does not persist input. Inspect the YorpHives capability catalog for pricing, limits, and data handling.",
    ttlMs: 300000,
    cacheScope: "public"
  };
}

function listTools(modern) {
  const result = { tools: [tool] };
  if (modern) {
    result.resultType = "complete";
    result.ttlMs = 60000;
    result.cacheScope = "public";
  }
  return result;
}

async function callTool(id, params, modern, context) {
  if (params?.name !== tool.name) {
    return rpcError(id, -32602, "Unknown tool.", { available_tools: [tool.name] });
  }
  const policy = await authorizeCapability(context.request, context.env, "text.analyze");
  if (!policy.ok) {
    const body = await policy.response.json();
    return rpcError(id, -32001, body.error?.message || "Execution is not authorized.", { code: body.error?.code || "EXECUTION_REJECTED", details: body.error?.details }, policy.response.status);
  }
  const result = analyzeText(params.arguments || {});
  if (!result.ok) {
    const toolResult = {
      isError: true,
      content: [{ type: "text", text: result.message }],
      structuredContent: { code: result.code, details: result.details }
    };
    if (modern) toolResult.resultType = "complete";
    return rpcResult(id, toolResult);
  }
  await recordUsage(context.env, { principalId: policy.principal?.id || null, capabilityId: "text.analyze", version: "1.0.0", id: requestId(context.request) });
  const toolResult = {
    isError: false,
    content: [{ type: "text", text: JSON.stringify(result.data) }],
    structuredContent: result.data
  };
  if (modern) toolResult.resultType = "complete";
  return rpcResult(id, toolResult);
}

export async function onRequestOptions() {
  return preflight();
}

export async function onRequestGet() {
  return new Response("MCP Streamable HTTP endpoint accepts POST requests only.", {
    status: 405,
    headers: { "Allow": "POST", "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" }
  });
}

export async function onRequestPost({ request, env }) {
  const id = requestId(request);
  if (!originAllowed(request.headers.get("Origin"))) {
    return rpcError(null, -32000, "Origin is not allowed.", undefined, 403);
  }
  if (!(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) {
    return errorResponse("UNSUPPORTED_MEDIA_TYPE", "MCP requests must use application/json.", 415, id);
  }

  const parsed = await readJson(request);
  if (!parsed.ok) {
    const tooLarge = parsed.reason === "too_large";
    return errorResponse(tooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON", tooLarge ? "MCP request exceeds 96 KB." : "MCP request must contain valid JSON.", tooLarge ? 413 : 400, id);
  }

  const rpc = parsed.value;
  if (!rpc || rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") {
    return rpcError(rpc?.id ?? null, -32600, "Invalid JSON-RPC request.", undefined, 400);
  }

  const hasId = Object.prototype.hasOwnProperty.call(rpc, "id");
  const modernHeader = request.headers.get("MCP-Protocol-Version");
  const metaVersion = rpc.params?._meta?.["io.modelcontextprotocol/protocolVersion"];
  const modern = metaVersion === MODERN_VERSION || modernHeader === MODERN_VERSION;

  if (modern) {
    if (modernHeader !== MODERN_VERSION || metaVersion !== MODERN_VERSION) {
      return protocolError(rpc.id, metaVersion || modernHeader);
    }
    const headers = validateModernHeaders(request, rpc);
    if (!headers.ok) return rpcError(rpc.id, -32020, "HeaderMismatch", { reason: headers.message }, 400);

    if (rpc.method === "server/discover") return rpcResult(rpc.id, discoverResult());
    if (!hasId) return new Response(null, { status: 202 });
    if (rpc.method === "tools/list") return rpcResult(rpc.id, listTools(true));
    if (rpc.method === "tools/call") return await callTool(rpc.id, rpc.params, true, { request, env });
    return rpcError(rpc.id, -32601, "Method not found.", undefined, 404);
  }

  // Legacy 2025-era compatibility: handshake clients continue to work without
  // a server-side session because the published tool set is stateless.
  if (rpc.method === "initialize") {
    const requested = rpc.params?.protocolVersion;
    if (requested && !SUPPORTED_VERSIONS.includes(requested)) return protocolError(rpc.id, requested);
    return rpcResult(rpc.id, {
      protocolVersion: LEGACY_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions: "Discover the public capability catalog before invocation. The text_analyze tool is free and does not persist input."
    });
  }
  if (rpc.method === "notifications/initialized" || rpc.method.startsWith("notifications/")) {
    return new Response(null, { status: 202 });
  }
  if (modernHeader && modernHeader !== LEGACY_VERSION) return protocolError(rpc.id, modernHeader);
  if (rpc.method === "ping") return rpcResult(rpc.id, {});
  if (rpc.method === "tools/list") return rpcResult(rpc.id, listTools(false));
  if (rpc.method === "tools/call") return await callTool(rpc.id, rpc.params, false, { request, env });
  return rpcError(rpc.id, -32601, "Method not found.");
}
