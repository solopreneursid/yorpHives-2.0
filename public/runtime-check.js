(async () => {
  const results = {};
  const record = async (name, work) => {
    try { results[name] = await work(); }
    catch (error) { results[name] = { error: error.message || String(error) }; }
  };
  await record("catalog", async () => {
    const response = await fetch("/api/v1/capabilities");
    const body = await response.json();
    return { status: response.status, capability: body.data?.capabilities?.[0]?.id, version: body.data?.capabilities?.[0]?.version };
  });
  await record("http_execute", async () => {
    const response = await fetch("/api/v1/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capability: "text.analyze", version: "1.0.0", input: { text: "Agentic internet. Discover, call, compose." } })
    });
    const body = await response.json();
    return { status: response.status, state: body.status, word_count: body.data?.word_count, persisted: body.data_handling?.persisted };
  });
  const modern = async (method, params, name) => {
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": method
    };
    if (name) headers["Mcp-Name"] = name;
    const response = await fetch("/api/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params: {
          ...params,
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {},
            "io.modelcontextprotocol/clientInfo": { name: "YorpHives Preview Probe", version: "1.0.0" }
          }
        }
      })
    });
    return { status: response.status, body: await response.json() };
  };
  await record("mcp_discover", async () => {
    const result = await modern("server/discover", {});
    return { status: result.status, versions: result.body.result?.supportedVersions, resultType: result.body.result?.resultType };
  });
  await record("mcp_tools_list", async () => {
    const result = await modern("tools/list", {});
    return { status: result.status, tools: result.body.result?.tools?.map(tool => tool.name), resultType: result.body.result?.resultType };
  });
  await record("mcp_tools_call", async () => {
    const result = await modern("tools/call", { name: "text_analyze", arguments: { text: "YorpHives agents work." } }, "text_analyze");
    return { status: result.status, resultType: result.body.result?.resultType, word_count: result.body.result?.structuredContent?.word_count };
  });
  const output = document.createElement("pre");
  output.id = "yorphives-runtime-check";
  output.textContent = JSON.stringify(results, null, 2);
  document.body.append(output);
})();