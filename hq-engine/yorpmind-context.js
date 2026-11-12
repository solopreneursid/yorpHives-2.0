import { parseYorpMindQuery, rankYorpMindEvidence } from "../functions/_lib/yorpmind-retrieval.js";

/**
 * An optional, read-only memory consultation inside the EXISTING paid mission
 * dispatch. Never introduces a new AI call or hands untrusted lesson text to
 * the model. Retrieval can fail without granting the AI more authority.
 */
export async function missionMemoryContext(db, title) {
  const unavailable = { status: "unavailable", references: [], inference_calls: 0 };
  if (!db || typeof title !== "string") return unavailable;
  const searchText = (title.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
    .filter(term => term.length >= 3).slice(0, 6).join(" ");
  const query = parseYorpMindQuery(searchText);
  if (!query) return { status: "no_query", references: [], inference_calls: 0 };

  try {
    const tables = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN " +
      "('yorpmind_experiences','yorpmind_skills','yorpmind_skill_revisions')"
    ).all();
    if (new Set((tables.results || []).map(row => row.name)).size !== 3) return unavailable;

    const [experienceRows, skillRows] = await Promise.all([
      db.prepare(
        "SELECT experience_id,scope,source_type,source_id,source_commit_sha,title,lesson," +
        "evidence_level,status,created_at FROM yorpmind_experiences " +
        "WHERE scope='headquarters' AND status='recorded' ORDER BY created_at DESC LIMIT 60"
      ).all(),
      db.prepare(
        "SELECT s.skill_id,s.title,s.purpose,s.status,s.current_revision,s.approved_revision," +
        "s.updated_at,r.source_experience_id,r.procedure_json " +
        "FROM yorpmind_skills s JOIN yorpmind_skill_revisions r " +
        "ON r.skill_id=s.skill_id AND r.revision=s.current_revision " +
        "WHERE s.status='approved' AND s.approved_revision=s.current_revision " +
        "ORDER BY s.updated_at DESC LIMIT 40"
      ).all()
    ]);
    const skills = [];
    for (const row of skillRows.results || []) {
      try {
        const steps = JSON.parse(row.procedure_json);
        if (!Array.isArray(steps) || steps.length < 2 || steps.length > 8 ||
            steps.some(step => typeof step !== "string" || step.length > 400)) continue;
        skills.push({ ...row, steps });
      } catch { /* corrupt skills are never exposed to the model */ }
    }

    const found = rankYorpMindEvidence(query, experienceRows.results || [], skills, 3);
    const references = found.map(row => row.record_type === "experience"
      ? {
          kind: "historical_repair_qa",
          memory_id: row.record_id,
          historical_repair_id: row.source_id,
          historical_sha: row.source_commit_sha,
          verified_current: false
        }
      : {
          kind: "approved_reference_only",
          skill_id: row.record_id,
          revision: row.revision,
          source_experience_id: row.source_id,
          verified_current: false
        });
    return { status: references.length ? "historical_matches" : "no_matches",
      references, inference_calls: 0 };
  } catch {
    return unavailable;
  }
}
