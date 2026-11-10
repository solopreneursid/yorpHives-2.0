import { json, preflight } from "../../_lib/http.js";

const catalog = {
  schema_version: "1.0.0",
  generated_at: new Date().toISOString(),
  capabilities: [{
    id: "text.analyze",
    version: "1.0.0",
    name: "Text intelligence",
    summary: "Analyze text structure and surface basic writing signals.",
    description: "Deterministically counts words, characters, sentences and paragraphs, estimates reading time, and extracts frequent terms. Input is processed in memory and is not persisted.",
    category: "understand",
    status: "available",
    tags: ["text", "analysis", "writing", "utility"],
    interfaces: {
      http: { method: "POST", path: "/api/v1/execute" },
      mcp: { tool: "text_analyze", endpoint: "/api/mcp" },
      human: { path: "/#live-demo" }
    },
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: { text: { type: "string", minLength: 1, maxLength: 20000, description: "Text to analyze. Not stored." } }
    },
    output_schema: {
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
    access: { authentication: "none", authorization: "public", rate_limit: "not-configured" },
    pricing: { model: "free", currency: null, amount: 0, unit: "execution" },
    execution: { idempotent: true, synchronous: true, timeout_ms: 3000, max_input_bytes: 98304 },
    data_handling: { retention: "none", training_use: false, sensitive_data_recommended: false },
    safety: { human_approval: false, external_side_effects: false }
  }]
};

export async function onRequestOptions() { return preflight(); }
export async function onRequestGet() {
  return json({ status: "ok", data: catalog }, 200, { "Cache-Control": "public, max-age=60, s-maxage=300" });
}
