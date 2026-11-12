/**
 * Workers AI mission brief contract.
 * Recover only complete JSON objects, never invent missing fields or retry inference.
 */
export class MissionBriefContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MissionBriefContractError";
    this.code = code;
  }
}

const MAX_RESPONSE_CHARS = 20000;
const MAX_ITEMS = 8;

function cleanText(value, max = 1600) {
  return typeof value === "string"
    ? value.replace(/\u0000/g, "").trim().slice(0, max)
    : "";
}
function cleanItems(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(x => typeof x === "string" && x.trim())
    .slice(0, MAX_ITEMS).map(x => cleanText(x, 600));
}

export function readModelAnswer(result) {
  const data = result?.result ?? result;
  const candidate = data?.response ?? data?.choices?.[0]?.message?.content ??
    data?.output?.[0]?.content ?? data?.output ?? data;
  if (typeof candidate === "string") return candidate;
  if (Array.isArray(candidate)) {
    const parts = candidate.filter(x => x && x.type === "text" && typeof x.text === "string")
      .map(x => x.text).slice(0, 5);
    return parts.join("\n");
  }
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate) &&
    typeof candidate.summary === "string") return candidate;
  throw new MissionBriefContractError("BRIEF_RESPONSE_MISSING",
    "The AI provider returned no readable answer. This mission was not completed.");
}

/** Extract complete top-level objects, respecting braces inside JSON strings. */
function jsonCandidates(text) {
  const candidates = [text];
  let depth = 0, start = -1, quoted = false, escaped = false, count = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') { quoted = true; continue; }
    if (character === "{") {
      if (depth === 0) start = index;
      depth++;
    } else if (character === "}" && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        candidates.push(text.slice(start, index + 1));
        if (++count === 6) break;
      }
    }
  }
  return candidates;
}

export function parseMissionBrief(value) {
  const answer = readModelAnswer(value);
  let candidate = null;
  if (typeof answer === "string") {
    if (answer.length > 20000)
      throw new MissionBriefContractError("BRIEF_RESPONSE_TOO_LARGE",
        "AI response exceeded the safe size limit. Inspect the model settings.");
    const text = answer.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "").trim();
    const cleaned = text.replace(/^\x60{3}(?:json)?\s*/i, "").replace(/\s*\x60{3}$/i, "").trim();
    for (const proposed of jsonCandidates(cleaned)) {
      try {
        let parsed = JSON.parse(proposed);
        if (typeof parsed === "string" && parsed.length <= 20000)
          parsed = JSON.parse(parsed);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed) &&
            (typeof parsed.summary === "string" || typeof parsed.recommended_approach === "string")) {
          candidate = parsed;
          break;
        }
      } catch { /* Try other complete JSON objects, never repair broken JSON. */ }
    }
    if (!candidate)
      throw new MissionBriefContractError("BRIEF_JSON_INVALID",
        "The AI result was not a complete structured decision brief. Review model format before another owner-approved mission.");
  } else {
    candidate = answer;
  }
  const brief = {
    summary: cleanText(candidate.summary, 900),
    recommended_approach: cleanText(candidate.recommended_approach, 1600),
    actions: cleanItems(candidate.actions),
    risks: cleanItems(candidate.risks),
    assumptions: cleanItems(candidate.assumptions),
    verification_needed: cleanItems(candidate.verification_needed)
  };
  if (!brief.summary || !brief.recommended_approach ||
      !brief.actions.length || !brief.verification_needed.length)
    throw new MissionBriefContractError("BRIEF_REQUIRED_FIELDS_MISSING",
      "AI output lacked required recommendations or verification steps. No work was approved.");
  return brief;
}
