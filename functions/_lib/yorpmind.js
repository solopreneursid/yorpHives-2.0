/**
 * YorpMind v1 — deterministic first-party knowledge contracts.
 * Designed to run in Cloudflare V8 isolates without Node.js packages.
 * All mutation authorization and D1 provenance checks occur in the private API.
 */

export const YORPMIND_VERSION = 1;
export const YORPMIND_SCOPE = "headquarters";
export const YORPMIND_SKILL_EXECUTION_ENABLED = false;
export const YORPMIND_PUBLIC_ACCESS_ENABLED = false;

export const YORPMIND_ACTIONS = Object.freeze([
  "capture_repair_experience",
  "propose_skill",
  "revise_skill",
  "review_skill"
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SHA = /^[0-9a-f]{40}$/i;

export function validYorpMindUuid(value) {
  return typeof value === "string" && UUID.test(value);
}

export function validSha(value) {
  return typeof value === "string" && SHA.test(value);
}

export function cleanText(value, minimum, maximum) {
  if (typeof value !== "string" || value.length > maximum || value.includes("\0")) return null;
  const clean = value.trim();
  if (clean.length < minimum || clean.length > maximum) return null;
  // Keep untrusted prose as data, never agent instructions or HTML.
  return clean;
}

export function validProcedureSteps(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 8) return null;
  const steps = value.map(item => cleanText(item, 15, 400));
  if (steps.some(item => item === null) || new Set(steps).size !== steps.length) return null;
  if (JSON.stringify(steps).length > 4500) return null;
  return steps;
}

export function normalizeYorpMindRequest(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (!YORPMIND_ACTIONS.includes(payload.action)) return null;

  if (payload.action === "capture_repair_experience") {
    const title = cleanText(payload.title, 8, 180);
    const lesson = cleanText(payload.lesson, 30, 1800);
    if (!validYorpMindUuid(payload.repair_job_id) || !title || !lesson) return null;
    return {
      action: payload.action,
      repair_job_id: payload.repair_job_id.toLowerCase(),
      title,
      lesson
    };
  }
  if (payload.action === "propose_skill") {
    const title = cleanText(payload.title, 5, 120);
    const purpose = cleanText(payload.purpose, 20, 600);
    const steps = validProcedureSteps(payload.steps);
    if (!validYorpMindUuid(payload.source_experience_id) || !title || !purpose ||
        typeof payload.slug !== "string" || payload.slug.length > 64 ||
        !SLUG.test(payload.slug) || !steps) return null;
    return {
      action: payload.action,
      source_experience_id: payload.source_experience_id.toLowerCase(),
      slug: payload.slug,
      title,
      purpose,
      steps
    };
  }
  if (payload.action === "revise_skill") {
    const steps = validProcedureSteps(payload.steps);
    if (!validYorpMindUuid(payload.skill_id) || !Number.isSafeInteger(payload.expected_revision) ||
        payload.expected_revision < 1 || payload.expected_revision > 100 ||
        !validYorpMindUuid(payload.source_experience_id) || !steps) return null;
    return {
      action: payload.action,
      skill_id: payload.skill_id.toLowerCase(),
      source_experience_id: payload.source_experience_id.toLowerCase(),
      expected_revision: payload.expected_revision,
      steps
    };
  }
  const note = cleanText(payload.review_note, 40, 1200);
  if (!validYorpMindUuid(payload.skill_id) || !Number.isSafeInteger(payload.expected_revision) ||
      payload.expected_revision < 1 || payload.expected_revision > 100 ||
      !["approve", "reject"].includes(payload.decision) || !note) return null;
  return {
    action: payload.action,
    skill_id: payload.skill_id.toLowerCase(),
    expected_revision: payload.expected_revision,
    decision: payload.decision,
    review_note: note
  };
}

export function yorpmindIsRecordedQa(row, evidence) {
  if (!row || row.status !== "needs_review" || !validSha(row.commit_sha) ||
      !row.checks_json || !evidence?.verified ||
      row.reproduction_status !== "reproduced" ||
      row.fix_status !== "passed" ||
      row.regression_status !== "passed") return false;
  return true;
}

export function yorpmindSnapshot(experiences, skills) {
  const records = Array.isArray(experiences) ? experiences : [];
  const procedures = Array.isArray(skills) ? skills : [];
  return {
    schema_version: YORPMIND_VERSION,
    name: "YorpMind",
    scope: YORPMIND_SCOPE,
    generated_at: new Date().toISOString(),
    policy: {
      approved_services: ["Cloudflare", "ChatGPT/OpenAI", "GitHub free capabilities"],
      public_access_enabled: YORPMIND_PUBLIC_ACCESS_ENABLED,
      autonomous_learning_enabled: false,
      autonomous_skill_execution_enabled: YORPMIND_SKILL_EXECUTION_ENABLED,
      production_changes_enabled: false,
      evidence_note: "Founder-reported QA is stored as provenance, not independent proof or current GitHub HEAD verification."
    },
    counts: {
      experiences: records.length,
      draft_skills: procedures.filter(skill => skill.status === "draft").length,
      approved_reference_skills: procedures.filter(skill => skill.status === "approved").length,
      retired_skills: procedures.filter(skill => skill.status === "retired").length
    },
    experiences: records,
    skills: procedures
  };
}

export function yorpmindMarkdown(snapshot) {
  const escape = value => String(value ?? "").replace(/[\r\n]+/g, " ")
    .replace(/[\\`*_{}\[\]<>#|]/g, "\\$&");
  const lines = [
    "# YorpMind — private Headquarters intelligence",
    "",
    "This is private evidence-backed reference knowledge. No autonomous skills or public AI access are enabled.",
    "Production changes: DISABLED",
    "",
    "## Experiences (founder QA evidence, not live GitHub verification)",
    ...snapshot.experiences.map(item =>
      "- " + escape(item.title) + " [" + escape(item.source_commit_sha?.slice(0, 12)) + "]: " + escape(item.lesson)),
    "",
    "## Versioned skills (reference text only)",
    ...snapshot.skills.map(skill =>
      "- " + escape(skill.title) + " — " + escape(skill.status) + " (revision " +
      escape(skill.current_revision) + "): " + escape(skill.purpose)),
    "",
    "Generated: " + snapshot.generated_at,
    ""
  ];
  return lines.join("\n");
}
