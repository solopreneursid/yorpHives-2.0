import {
  adminJson, isAdminResponse, requireAdmin,
  type AdminRequestContext
} from "../../_lib/admin-auth";
import {
  parseYorpMindQuery, yorpmindRetrievalResponse,
  yorpmindRetrievalMarkdown, YORPMIND_RETRIEVAL_LIMITS
} from "../../_lib/yorpmind-retrieval.js";

interface ExperienceCandidate {
  experience_id: string;
  scope: "headquarters";
  source_type: "repair_qa";
  source_id: string;
  source_commit_sha: string;
  title: string;
  lesson: string;
  evidence_level: "founder_reported_qa";
  status: "recorded" | "archived";
  created_at: string;
}
interface SkillCandidate {
  skill_id: string;
  title: string;
  purpose: string;
  source_experience_id: string;
  procedure_json: string;
  status: "approved";
  current_revision: number;
  approved_revision: number;
  updated_at: string;
}
interface SkillRecord {
  skill_id: string;
  title: string;
  purpose: string;
  source_experience_id: string;
  steps: string[];
  status: "approved";
  current_revision: number;
  approved_revision: number;
  updated_at: string;
}
interface RetrievedReference {
  record_type: "experience" | "reference_skill";
  record_id: string;
  title: string;
  summary: string;
  evidence_level: "founder_reported_qa" | "founder_approved_reference_text";
  source_type: "repair_qa" | "founder_approved_skill";
  source_id: string;
  source_commit_sha?: string;
  revision?: number;
  steps?: string[];
  recorded_at: string;
  status: "recorded" | "approved_reference_only";
  score: number;
  matched_terms: string[];
  safe_to_execute: false;
  live_verified: false;
}
interface RetrievalResponse {
  schema_version: 1;
  name: "YorpMind";
  scope: "headquarters";
  generated_at: string;
  query_terms: string[];
  search_mode: "bounded_recent_lexical";
  source_window: {
    experiences_scanned: number;
    skills_scanned: number;
    maximum_per_type: number;
    exhaustive: false;
  };
  execution: {
    inference_calls: 0;
    agent_actions: 0;
    skills_executable: false;
    public_access: false;
    production_approved: false;
  };
  evidence_warning: string;
  results: RetrievedReference[];
}
interface RetrievalErrorResponse {
  error: { code: string; message: string };
  production_approved: false;
}

const error = (code: string, message: string, status: number): Response =>
  adminJson({ error: { code, message }, production_approved: false } satisfies RetrievalErrorResponse, status);

export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;

  const url = new URL(context.request.url);
  const query = parseYorpMindQuery(url.searchParams.get("q"));
  if (!query) {
    return error("INVALID_QUERY",
      "Use 3–160 characters with 1–6 distinct meaningful search terms, without control characters.", 400);
  }

  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 5 : Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > YORPMIND_RETRIEVAL_LIMITS.max_results) {
    return error("INVALID_LIMIT", "Result limit must be an integer from 1 to 8.", 400);
  }

  const db = context.env.DB!;
  const schema = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN " +
    "('yorpmind_experiences','yorpmind_skills','yorpmind_skill_revisions')"
  ).all<{ name: string }>();
  const names = new Set((schema.results || []).map(row => row.name));
  if (!["yorpmind_experiences","yorpmind_skills","yorpmind_skill_revisions"].every(name => names.has(name))) {
    return error("YORPMIND_MIGRATION_REQUIRED",
      "Private YorpMind evidence retrieval requires D1 migration 0024.", 503);
  }

  // Bounded and indexed candidate reads: no full-table search, external model,
  // vector database, unbounded loop or public-user memory access.
  const [experienceRows, skillRows] = await Promise.all([
    db.prepare(
      "SELECT experience_id,scope,source_type,source_id,source_commit_sha,title,lesson," +
      "evidence_level,status,created_at FROM yorpmind_experiences " +
      "WHERE scope='headquarters' AND status='recorded' " +
      "ORDER BY created_at DESC LIMIT 120"
    ).all<ExperienceCandidate>(),
    db.prepare(
      "SELECT s.skill_id,s.title,s.purpose,s.status,s.current_revision,s.approved_revision," +
      "s.updated_at,r.source_experience_id,r.procedure_json FROM yorpmind_skills s " +
      "JOIN yorpmind_skill_revisions r ON r.skill_id=s.skill_id AND r.revision=s.current_revision " +
      "WHERE s.status='approved' AND s.approved_revision=s.current_revision " +
      "ORDER BY s.updated_at DESC LIMIT 120"
    ).all<SkillCandidate>()
  ]);

  const skills: SkillRecord[] = [];
  for (const row of skillRows.results || []) {
    // Corrupt/unexpected revision payloads must never turn into agent tools.
    try {
      const steps = JSON.parse(row.procedure_json) as unknown;
      if (!Array.isArray(steps) || steps.length < 2 || steps.length > 8 ||
          !steps.every(step => typeof step === "string" && step.length <= 400)) continue;
      skills.push({
        skill_id: row.skill_id, title: row.title, purpose: row.purpose,
        source_experience_id: row.source_experience_id, steps,
        status: row.status, current_revision: row.current_revision,
        approved_revision: row.approved_revision, updated_at: row.updated_at
      });
    } catch {
      // Fail closed for this record; other valid reference records remain searchable.
    }
  }

  const result = yorpmindRetrievalResponse(query, experienceRows.results || [], skills, limit) as RetrievalResponse;
  if (context.request.headers.get("accept")?.includes("text/markdown")) {
    return new Response(yorpmindRetrievalMarkdown(result), {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
        "vary": "Accept"
      }
    });
  }
  const response = adminJson(result);
  response.headers.set("vary", "Accept");
  return response;
}
