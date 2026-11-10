const base = (process.env.YH_BASE_URL || "").replace(/\/+$/, "");
if (!base) throw new Error("Set YH_BASE_URL to the deployed preview or production URL.");

const checks = [];
async function check(name, work) {
  const result = await work();
  checks.push({ name, ...result });
  if (!result.ok) throw new Error(name + " failed: " + JSON.stringify(result));
}
async function request(path, init = {}) {
  const response = await fetch(base + path, { ...init, signal: AbortSignal.timeout(15000) });
  let body = null;
  try { body = await response.json(); } catch { body = await response.text(); }
  return { response, body };
}

await check("health and D1 binding", async () => {
  const { response, body } = await request("/api/v1/health");
  return { ok: response.status === 200 && body.checks?.database === "ok", status: response.status, database: body.checks?.database };
});

await check("canonical capability catalog", async () => {
  const { response, body } = await request("/api/v1/capabilities");
  const capability = body.data?.capabilities?.find(item => item.id === "text.analyze");
  return { ok: response.status === 200 && capability?.status === "available", status: response.status, capability: capability?.id };
});

await check("machine manifest and OpenAPI", async () => {
  const [manifest, openapi] = await Promise.all([request("/.well-known/yorphives-capabilities.json"), request("/openapi.json")]);
  return { ok: manifest.response.status === 200 && openapi.response.status === 200 && openapi.body.openapi === "3.1.0", manifest: manifest.response.status, openapi: openapi.response.status };
});

await check("unauthenticated identity is denied", async () => {
  const { response, body } = await request("/api/v1/identity/me");
  return { ok: response.status === 401 && body.error?.code === "AUTHENTICATION_REQUIRED", status: response.status, code: body.error?.code };
});

await check("HTTP execution and usage ledger write", async () => {
  const { response, body } = await request("/api/v1/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ capability: "text.analyze", version: "1.0.0", input: { text: "YorpHives makes capabilities discoverable and callable." } })
  });
  return { ok: response.status === 200 && body.status === "succeeded" && body.data?.word_count === 6, status: response.status, request_id: body.request_id };
});

const protocolVersion = "2026-07-28";
const metadata = { "io.modelcontextprotocol/protocolVersion": protocolVersion, "io.modelcontextprotocol/clientCapabilities": {} };
await check("modern MCP discovery", async () => {
  const { response, body } = await request("/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", "MCP-Protocol-Version": protocolVersion, "Mcp-Method": "server/discover" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: metadata } })
  });
  return { ok: response.status === 200 && body.result?.supportedVersions?.includes(protocolVersion), status: response.status };
});

await check("modern MCP tools/list", async () => {
  const { response, body } = await request("/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", "MCP-Protocol-Version": protocolVersion, "Mcp-Method": "tools/list" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: metadata } })
  });
  return { ok: response.status === 200 && body.result?.tools?.some(tool => tool.name === "text_analyze"), status: response.status };
});

await check("modern MCP tools/call and shared ledger", async () => {
  const { response, body } = await request("/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", "MCP-Protocol-Version": protocolVersion, "Mcp-Method": "tools/call", "Mcp-Name": "text_analyze" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "text_analyze", arguments: { text: "One capability serves humans and agents." }, _meta: metadata } })
  });
  return { ok: response.status === 200 && body.result?.isError === false && body.result?.structuredContent?.word_count === 7, status: response.status };
});

await check("CORS permits Bearer credentials", async () => {
  const { response } = await request("/api/v1/execute", {
    method: "OPTIONS",
    headers: { Origin: "https://agent.example", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" }
  });
  const allowed = response.headers.get("Access-Control-Allow-Headers") || "";
  return { ok: response.status === 204 && allowed.toLowerCase().includes("authorization"), status: response.status, authorization_allowed: allowed.toLowerCase().includes("authorization") };
});

console.log(JSON.stringify({ status: "passed", base, checks }, null, 2));
