import {
  adminJson, isAdminResponse, requireAdmin,
  type AdminRequestContext, type AdminD1Database
} from "../../_lib/admin-auth";
import { parseCiEvidence } from "../../_lib/release-evidence.js";
import {
  normalizeYorpMindRequest, yorpmindSnapshot, yorpmindMarkdown,
  yorpmindIsRecordedQa
} from "../../_lib/yorpmind.js";

type YorpMindAction = "capture_repair_experience" | "propose_skill" | "revise_skill" | "review_skill";
type YorpMindReviewDecision = "approve" | "reject";

interface CaptureExperienceInput {
  action: "capture_repair_experience";
  repair_job_id: string;
  title: string;
  lesson: string;
}
interface ProposeSkillInput {
  action: "propose_skill";
  source_experience_id: string;
  slug: string;
  title: string;
  purpose: string;
  steps: string[];
}
interface ReviseSkillInput {
  action: "revise_skill";
  skill_id: string;
  source_experience_id: string;
  expected_revision: number;
  steps: string[];
}
interface ReviewSkillInput {
  action: "review_skill";
  skill_id: string;
  expected_revision: number;
  decision: YorpMindReviewDecision;
  review_note: string;
}
type YorpMindMutation = CaptureExperienceInput | ProposeSkillInput | ReviseSkillInput | ReviewSkillInput;

interface YorpMindExperience {
  experience_id: string;
  scope: "headquarters";
  source_type: "repair_qa";
  source_id: string;
  source_commit_sha: string;
  title: string;
  lesson: string;
  evidence_level: "founder_reported_qa";
  status: "recorded" | "archived";
  recorded_by: string;
  created_at: string;
}
interface YorpMindSkillRow {
  skill_id: string;
  slug: string;
  title: string;
  purpose: string;
  status: "draft" | "approved" | "retired";
  current_revision: number;
  approved_revision: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  source_experience_id: string;
  procedure_json: string;
}
interface YorpMindSkill {
  skill_id: string;
  slug: string;
  title: string;
  purpose: string;
  status: "draft" | "approved" | "retired";
  current_revision: number;
  approved_revision: number | null;
  source_experience_id: string;
  steps: string[];
  created_at: string;
  updated_at: string;
}
interface QaSource {
  id: string;
  status: string;
  commit_sha: string;
  checks_json: string;
  reproduction_status: string;
  fix_status: string;
  regression_status: string;
}
interface SkillState {
  skill_id: string;
  current_revision: number;
  status: "draft" | "approved" | "retired";
}
interface YorpMindMutationResponse {
  success: true;
  action: YorpMindAction;
  id: string;
  status: string;
  revision?: number;
  autonomous_execution_enabled: false;
  production_approved: false;
}

const SCHEMA_NAMES = [
  "yorpmind_experiences", "yorpmind_skills",
  "yorpmind_skill_revisions", "yorpmind_skill_reviews"
];
const MAX_BODY_BYTES = 8192;
const error = (code: string, message: string, status: number) =>
  adminJson({ error: { code, message }, production_approved: false }, status);

async function schemaReady(db: AdminD1Database): Promise<boolean> {
  const result = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' " +
    "AND name IN ('yorpmind_experiences','yorpmind_skills','yorpmind_skill_revisions','yorpmind_skill_reviews')"
  ).all<{ name: string }>();
  const found = new Set(result.results.map(item => item.name));
  return SCHEMA_NAMES.every(name => found.has(name));
}

async function readBoundedPayload(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) throw new Error("TOO_LARGE");
  if (!request.body) throw new Error("BAD_JSON");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error("TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const payload = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload));
  } catch {
    throw new Error("BAD_JSON");
  }
}

function mutationResponse(action: YorpMindAction, id: string, status: string, revision?: number): YorpMindMutationResponse {
  return {
    success: true,
    action,
    id,
    status,
    ...(revision ? { revision } : {}),
    autonomous_execution_enabled: false,
    production_approved: false
  };
}

function audit(db: AdminD1Database, actor: string, action: string, resourceId: string, details: object, time: string) {
  return db.prepare(
    "INSERT INTO admin_audit_events(id,actor,action,resource_type,resource_id,details_json,created_at) VALUES(?,?,?,?,?,?,?)"
  ).bind(crypto.randomUUID(), actor, "yorpmind_" + action, "yorpmind", resourceId,
    JSON.stringify(details), time);
}

async function captureExperience(db: AdminD1Database, actor: string, input: CaptureExperienceInput): Promise<Response> {
  const source = await db.prepare(
    "SELECT j.id,j.status,c.commit_sha,c.checks_json,q.reproduction_status,q.fix_status,q.regression_status " +
    "FROM admin_repair_jobs j " +
    "JOIN admin_repair_ci_verifications c ON c.job_id=j.id " +
    "JOIN admin_repair_qa_reports q ON q.job_id=j.id AND q.commit_sha=c.commit_sha " +
    "WHERE j.id=?"
  ).bind(input.repair_job_id).first<QaSource>();
  const ci = source ? parseCiEvidence(source.checks_json, source.commit_sha) : null;
  if (!yorpmindIsRecordedQa(source, ci)) {
    return error("SOURCE_NOT_READY",
      "YorpMind only captures owner-reported lessons from a repair with five attested CI checks and matching passed issue-specific QA.", 409);
  }
  const id = crypto.randomUUID();
  const time = new Date().toISOString();
  try {
    await db.batch([
      db.prepare(
        "INSERT INTO yorpmind_experiences " +
        "(experience_id,scope,source_type,source_id,source_commit_sha,title,lesson,evidence_level,status,recorded_by,created_at) " +
        "VALUES (?,'headquarters','repair_qa',?,?,?,?,'founder_reported_qa','recorded',?,?)"
      ).bind(id, input.repair_job_id, source!.commit_sha, input.title, input.lesson, actor, time),
      audit(db, actor, "capture_experience", id,
        { source_type: "repair_qa", source_id: input.repair_job_id, source_commit_sha: source!.commit_sha }, time)
    ]);
  } catch {
    return error("EXPERIENCE_CONFLICT", "This repair revision may already be in memory, or the database rejected its provenance.", 409);
  }
  return adminJson(mutationResponse(input.action, id, "recorded"), 201);
}

async function sourceExperience(db: AdminD1Database, id: string): Promise<boolean> {
  const found = await db.prepare(
    "SELECT experience_id FROM yorpmind_experiences WHERE experience_id=? AND status='recorded' AND scope='headquarters'"
  ).bind(id).first<{ experience_id: string }>();
  return Boolean(found);
}

async function proposeSkill(db: AdminD1Database, actor: string, input: ProposeSkillInput): Promise<Response> {
  if (!await sourceExperience(db, input.source_experience_id)) {
    return error("EXPERIENCE_NOT_FOUND", "An existing recorded Headquarters experience is required.", 404);
  }
  const id = crypto.randomUUID(), time = new Date().toISOString();
  try {
    await db.batch([
      db.prepare(
        "INSERT INTO yorpmind_skills(skill_id,slug,title,purpose,status,current_revision,approved_revision,created_by,created_at,updated_at) " +
        "VALUES(?,?,?,?,'draft',1,NULL,?,?,?)"
      ).bind(id, input.slug, input.title, input.purpose, actor, time, time),
      db.prepare(
        "INSERT INTO yorpmind_skill_revisions(skill_id,revision,source_experience_id,procedure_json,created_by,created_at) " +
        "VALUES(?,1,?,?,?,?)"
      ).bind(id, input.source_experience_id, JSON.stringify(input.steps), actor, time),
      audit(db, actor, "propose_skill", id, { slug: input.slug, revision: 1 }, time)
    ]);
  } catch {
    return error("SKILL_CONFLICT", "Skill slug is already used or the database rejected the source association.", 409);
  }
  return adminJson(mutationResponse(input.action, id, "draft", 1), 201);
}

async function getSkill(db: AdminD1Database, id: string): Promise<SkillState | null> {
  return db.prepare(
    "SELECT skill_id,current_revision,status FROM yorpmind_skills WHERE skill_id=?"
  ).bind(id).first<SkillState>();
}

async function reviseSkill(db: AdminD1Database, actor: string, input: ReviseSkillInput): Promise<Response> {
  const skill = await getSkill(db, input.skill_id);
  if (!skill || skill.status === "retired" || skill.current_revision !== input.expected_revision ||
      skill.current_revision >= 100) {
    return error("STALE_SKILL", "The skill is missing, retired or its revision has changed.", 409);
  }
  if (!await sourceExperience(db, input.source_experience_id)) {
    return error("EXPERIENCE_NOT_FOUND", "An existing recorded Headquarters experience is required.", 404);
  }
  const revision = skill.current_revision + 1, time = new Date().toISOString();
  try {
    await db.batch([
      db.prepare(
        "INSERT INTO yorpmind_skill_revisions(skill_id,revision,source_experience_id,procedure_json,created_by,created_at) " +
        "VALUES(?,?,?,?,?,?)"
      ).bind(skill.skill_id, revision, input.source_experience_id, JSON.stringify(input.steps), actor, time),
      db.prepare(
        "UPDATE yorpmind_skills SET current_revision=?,status='draft',approved_revision=NULL,updated_at=? " +
        "WHERE skill_id=? AND current_revision=? AND status IN ('draft','approved')"
      ).bind(revision, time, skill.skill_id, input.expected_revision),
      audit(db, actor, "revise_skill", skill.skill_id,
        { from_revision: input.expected_revision, to_revision: revision }, time)
    ]);
  } catch {
    return error("STALE_SKILL", "A concurrent revision changed this skill. Reload before submitting another revision.", 409);
  }
  return adminJson(mutationResponse(input.action, skill.skill_id, "draft", revision), 201);
}

async function reviewSkill(db: AdminD1Database, actor: string, input: ReviewSkillInput): Promise<Response> {
  const skill = await getSkill(db, input.skill_id);
  if (!skill || skill.status !== "draft" || skill.current_revision !== input.expected_revision) {
    return error("REVIEW_CONFLICT", "This skill is not at the draft revision being reviewed.", 409);
  }
  const decision = input.decision === "approve" ? "approved" : "rejected";
  const nextStatus = decision === "approved" ? "approved" : "retired";
  const time = new Date().toISOString();
  try {
    await db.batch([
      db.prepare(
        "INSERT INTO yorpmind_skill_reviews(skill_id,revision,decision,review_note,reviewed_by,reviewed_at) " +
        "VALUES(?,?,?,?,?,?)"
      ).bind(skill.skill_id, input.expected_revision, decision, input.review_note, actor, time),
      db.prepare(
        "UPDATE yorpmind_skills SET status=?,approved_revision=?,updated_at=? " +
        "WHERE skill_id=? AND current_revision=? AND status='draft'"
      ).bind(nextStatus, decision === "approved" ? input.expected_revision : null,
        time, skill.skill_id, input.expected_revision),
      audit(db, actor, "review_skill", skill.skill_id,
        { decision, revision: input.expected_revision, reference_only: true }, time)
    ]);
  } catch {
    return error("REVIEW_CONFLICT", "The skill revision changed or this review has already been recorded.", 409);
  }
  return adminJson(mutationResponse(input.action, skill.skill_id, nextStatus, input.expected_revision), 201);
}

export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const db = context.env.DB!;
  if (!await schemaReady(db)) return error("YORPMIND_MIGRATION_REQUIRED", "YorpMind requires private D1 migration 0024.", 503);
  const [experiences, rows] = await Promise.all([
    db.prepare(
      "SELECT experience_id,scope,source_type,source_id,source_commit_sha,title,lesson,evidence_level,status,recorded_by,created_at " +
      "FROM yorpmind_experiences WHERE scope='headquarters' ORDER BY created_at DESC LIMIT 30"
    ).all<YorpMindExperience>(),
    db.prepare(
      "SELECT s.skill_id,s.slug,s.title,s.purpose,s.status,s.current_revision,s.approved_revision," +
      "s.created_by,s.created_at,s.updated_at,r.source_experience_id,r.procedure_json " +
      "FROM yorpmind_skills s JOIN yorpmind_skill_revisions r " +
      "ON r.skill_id=s.skill_id AND r.revision=s.current_revision " +
      "ORDER BY s.updated_at DESC LIMIT 30"
    ).all<YorpMindSkillRow>()
  ]);
  const skills: YorpMindSkill[] = (rows.results || []).map(row => ({
    skill_id: row.skill_id,
    slug: row.slug,
    title: row.title,
    purpose: row.purpose,
    status: row.status,
    current_revision: row.current_revision,
    approved_revision: row.approved_revision,
    source_experience_id: row.source_experience_id,
    steps: JSON.parse(row.procedure_json) as string[],
    created_at: row.created_at,
    updated_at: row.updated_at
  }));
  const snapshot = yorpmindSnapshot(experiences.results || [], skills);
  if (context.request.headers.get("accept")?.includes("text/markdown")) {
    return new Response(yorpmindMarkdown(snapshot), {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "vary": "Accept"
      }
    });
  }
  const response = adminJson(snapshot);
  response.headers.set("vary", "Accept");
  return response;
}

export async function onRequestPost(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const request = context.request, db = context.env.DB!;
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return error("INVALID_ORIGIN", "YorpMind mutations require a same-origin owner session.", 403);
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return error("INVALID_CONTENT_TYPE", "YorpMind accepts application/json.", 415);
  }
  if (!await schemaReady(db)) return error("YORPMIND_MIGRATION_REQUIRED", "YorpMind requires private D1 migration 0024.", 503);
  let payload: unknown;
  try { payload = await readBoundedPayload(request); }
  catch (cause) {
    return error(cause instanceof Error && cause.message === "TOO_LARGE" ? "TOO_LARGE" : "BAD_JSON",
      "Invalid or oversized YorpMind request. Maximum 8 KB.", 400);
  }
  const input = normalizeYorpMindRequest(payload) as YorpMindMutation | null;
  if (!input) return error("INVALID_YORPMIND_REQUEST", "Unsupported operation or invalid text, identifiers, revision, or procedure steps.", 400);

  switch (input.action) {
    case "capture_repair_experience": return captureExperience(db, identity.email, input);
    case "propose_skill": return proposeSkill(db, identity.email, input);
    case "revise_skill": return reviseSkill(db, identity.email, input);
    case "review_skill": return reviewSkill(db, identity.email, input);
  }
  return error("INVALID_ACTION", "Unsupported YorpMind operation.", 400);
}
