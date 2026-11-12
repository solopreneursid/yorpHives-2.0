/**
 * Source-only YorpMind citations for the Headquarters mission composer.
 * Imported by the browser and Node regression tests. No model or network calls.
 * A citation is NEVER an instruction, a proof of current correctness, or a
 * grant of permission to execute an approved reference procedure.
 */
export const MISSION_MEMORY_MAX_REFERENCES = 3;
export const MISSION_MEMORY_NOTE_HEADER = "YorpMind historical references (owner-selected, not live-verified; NOT execution or production authorization):";
export const MISSION_MEMORY_CHECKLIST = "Reproduce the problem independently; verify source revisions and current behavior before relying on this history.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{40}$/i;
const NOISE = new Set([
  "about", "after", "again", "also", "and", "are", "been", "before", "can",
  "could", "does", "for", "from", "have", "how", "into", "issue", "issues",
  "our", "please", "show", "some", "that", "the", "their", "them", "there",
  "these", "this", "those", "tools", "what", "when", "where", "which",
  "with", "would", "your"
]);

export function prepareMissionMemoryQuery(title) {
  if (typeof title !== "string" || title.length < 3 || title.length > 160 ||
      /[\u0000-\u001f\u007f]/u.test(title)) return null;
  const terms = [...new Set(
    (title.normalize("NFKC").toLocaleLowerCase("en").match(/[\p{L}\p{N}]+/gu) || [])
      .filter(term => term.length >= 3 && term.length <= 32 && !NOISE.has(term))
  )].slice(0, 6);
  if (!terms.length) return null;
  return terms.join(" ");
}

export function validMissionMemoryReference(record) {
  if (!record || record.safe_to_execute !== false || record.live_verified !== false ||
      !UUID.test(record.record_id || "") || !UUID.test(record.source_id || "")) return false;
  if (record.record_type === "experience") {
    return record.evidence_level === "founder_reported_qa" &&
      record.source_type === "repair_qa" && SHA.test(record.source_commit_sha || "");
  }
  if (record.record_type === "reference_skill") {
    return record.evidence_level === "founder_approved_reference_text" &&
      record.source_type === "founder_approved_skill" &&
      record.status === "approved_reference_only" &&
      Number.isSafeInteger(record.revision) && record.revision >= 1 && record.revision <= 100;
  }
  return false;
}

export function formatMissionMemoryCitations(records) {
  if (!Array.isArray(records) || !records.length ||
      records.length > MISSION_MEMORY_MAX_REFERENCES ||
      records.some(record => !validMissionMemoryReference(record))) return null;
  const ids = records.map(record => record.record_type + ":" + record.record_id.toLowerCase());
  if (new Set(ids).size !== ids.length) return null;
  const references = records.map(record => record.record_type === "experience"
    ? "- historical repair QA " + record.source_id.toLowerCase() +
      "; memory " + record.record_id.toLowerCase() +
      "; attested historical commit " + record.source_commit_sha.toLowerCase()
    : "- approved REFERENCE-ONLY skill " + record.record_id.toLowerCase() +
      "; revision " + record.revision +
      "; originating experience " + record.source_id.toLowerCase()
  );
  return [MISSION_MEMORY_NOTE_HEADER, ...references, MISSION_MEMORY_CHECKLIST].join("\n");
}

export function appendMissionMemoryCitations(existing, records, maximum = 4000) {
  if (typeof existing !== "string" || !Number.isSafeInteger(maximum) || maximum < 500) return null;
  const citation = formatMissionMemoryCitations(records);
  if (!citation) return null;
  // Do not rewrite mission content or remove user-authored text. Repeated clicks
  // cannot smuggle multiple identical blocks into the AI's stored mission brief.
  if (existing.includes(MISSION_MEMORY_NOTE_HEADER)) return null;
  const merged = existing.trimEnd() + "\n\n" + citation;
  return merged.length <= maximum ? merged : null;
}

export function validateMissionMemorySearchResult(payload) {
  return Boolean(payload?.name === "YorpMind" && payload.scope === "headquarters" &&
    payload.search_mode === "bounded_recent_lexical" &&
    payload.source_window?.exhaustive === false &&
    payload.execution?.inference_calls === 0 &&
    payload.execution?.agent_actions === 0 &&
    payload.execution?.public_access === false &&
    payload.execution?.skills_executable === false &&
    payload.execution?.production_approved === false &&
    Array.isArray(payload.results) && payload.results.length <= 8 &&
    payload.results.every(record => validMissionMemoryReference(record)));
}
