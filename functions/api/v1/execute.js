import { analyzeText } from "../../_lib/text-analyze.js";
import { errorResponse, json, preflight, readJson, requestId } from "../../_lib/http.js";
import { authorizeCapability, recordUsage } from "../../_lib/platform.js";

const handlers = new Map([["text.analyze@1.0.0", analyzeText]]);

export async function onRequestOptions() { return preflight(); }

export async function onRequestPost({ request, env }) {
  const id = requestId(request);
  const contentType = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return errorResponse("UNSUPPORTED_MEDIA_TYPE", "Send a JSON request body.", 415, id, false, { expected: "application/json" });
  }

  const parsed = await readJson(request);
  if (!parsed.ok) {
    const tooLarge = parsed.reason === "too_large";
    return errorResponse(tooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON", tooLarge ? "Request body exceeds 96 KB." : "Request body must contain valid JSON.", tooLarge ? 413 : 400, id, false);
  }

  const body = parsed.value;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("INVALID_REQUEST", "Request body must be a JSON object.", 400, id, false);
  }
  if (typeof body.capability !== "string" || typeof body.version !== "string" || !body.input || typeof body.input !== "object" || Array.isArray(body.input)) {
    return errorResponse("INVALID_REQUEST", "Provide capability, version, and input object.", 400, id, false, { required: ["capability", "version", "input"] });
  }

  const policy = await authorizeCapability(request, env, body.capability);
  if (!policy.ok) return policy.response;

  const handler = handlers.get(`${body.capability}@${body.version}`);
  if (!handler) {
    return errorResponse("CAPABILITY_NOT_FOUND", "The requested capability version is not available.", 404, id, false, { capability: body.capability, version: body.version, discover: "/api/v1/capabilities" });
  }

  const result = handler(body.input);
  if (!result.ok) {
    return errorResponse(result.code, result.message, result.code === "INPUT_TOO_LARGE" ? 413 : 422, id, false, result.details);
  }

  await recordUsage(env, { principalId: policy.principal?.id || null, capabilityId: body.capability, version: body.version, id });

  return json({
    status: "succeeded",
    request_id: id,
    capability: { id: body.capability, version: body.version },
    data: result.data,
    usage: { billable: false, units: 1, pricing_model: "free" },
    data_handling: { persisted: false, retention: "none" }
  }, 200, { "X-Request-ID": id });
}
