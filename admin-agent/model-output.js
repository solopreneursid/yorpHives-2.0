/**
 * Workers AI output normalization. Responses may be plain text, wrapped by
 * the AI binding, OpenAI-style choices, or typed content blocks.
 * Reasoning / chain-of-thought content is NEVER treated as a repair patch.
 *
 * No retries, network calls, paid inference or code execution here.
 */
const MAX_TEXT = 64000;
const MODEL_CODE = Object.freeze({
  empty: "MODEL_OUTPUT_EMPTY",
  invalid: "MODEL_JSON_INVALID",
  truncated: "MODEL_OUTPUT_TRUNCATED"
});

function textValue(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(part => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" &&
        ["text", "output_text"].includes(String(part.type || ""))) {
        return textValue(part.text ?? part.content, depth + 1);
      }
      return "";
    }).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
    for (const candidate of [
      value.response, value.result?.response, value.choices?.[0]?.message?.content,
      value.output_text, value.content, value.output
    ]) {
      const result = textValue(candidate, depth + 1);
      if (result.trim()) return result;
    }
    if (value.type === "text" || value.type === "output_text") {
      return textValue(value.text, depth + 1);
    }
  }
  return "";
}

export function readWorkersAiText(result) {
  const output = textValue(result).trim();
  if (!output) throw new Error(
    MODEL_CODE.empty + ": The AI model returned no usable text. No patch was applied.");
  if (output.length > MAX_TEXT) throw new Error(
    MODEL_CODE.truncated + ": The AI response exceeded the safe output limit. No patch was applied.");
  if (result?.choices?.[0]?.finish_reason === "length" ||
      result?.result?.choices?.[0]?.finish_reason === "length") {
    throw new Error(
      MODEL_CODE.truncated + ": The AI model stopped before completing its response. No patch was applied.");
  }
  // Strip reasoning tags only if the model includes them in final content.
  // Never promote a separate reasoning_content field to final output.
  const cleaned = output.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (!cleaned) throw new Error(
    MODEL_CODE.empty + ": The AI model produced only reasoning, not a final patch.");
  return cleaned;
}

export function parseWorkersAiJson(text, what = "proposal") {
  if (typeof text !== "string" || text.length > MAX_TEXT) {
    throw new Error(MODEL_CODE.invalid + ": No bounded JSON was returned for " + what + ".");
  }
  // Identify one complete object, preserving braces inside JSON strings.
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let end = start; end < text.length; end++) {
      const char = text[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "{") depth++;
      else if (char === "}") {
        depth--;
        if (depth === 0) {
          try {
            const value = JSON.parse(text.slice(start, end + 1));
            if (value && typeof value === "object" && !Array.isArray(value)) {
              return value;
            }
          } catch {}
          break;
        }
      }
    }
  }
  throw new Error(MODEL_CODE.invalid + ": The AI " + what +
    " did not contain a complete JSON object. No patch was applied.");
}
