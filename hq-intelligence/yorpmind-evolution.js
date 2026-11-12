import { detectYorpMindPatterns } from "../functions/_lib/yorpmind-patterns.js";

/**
 * Once-daily, zero-inference evolution scan piggybacks on the existing
 * Cloudflare intelligence cron. No external network requests and no skill
 * revisions, capability changes, spending, or deployment permissions.
 */
export async function scanYorpMindEvolution(db, clock = () => new Date()) {
  if (!db) return { status: "unavailable", proposals_created: 0 };
  const ready = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN " +
    "('yorpmind_evolution_runs','yorpmind_evolution_proposals','yorpmind_experiences','yorpmind_skills')"
  ).all();
  if (new Set((ready.results || []).map(x => x.name)).size !== 4) {
    return { status: "migration_required", proposals_created: 0 };
  }

  const date = clock().toISOString().slice(0, 10);
  const runId = crypto.randomUUID();
  const started = await db.prepare(
    "INSERT OR IGNORE INTO yorpmind_evolution_runs " +
    "(run_date,run_id,trigger_source,status,created_at) " +
    "VALUES(?,?,'daily_schedule','running',?) RETURNING run_id"
  ).bind(date, runId, clock().toISOString()).first();
  if (!started?.run_id) return { status: "already_scanned_today", proposals_created: 0 };

  let experienceCount = 0;
  let topics = 0;
  let created = 0;
  try {
    const [experiences, skills] = await Promise.all([
      db.prepare(
        "SELECT experience_id,scope,source_type,source_id,title,lesson,evidence_level,status,created_at " +
        "FROM yorpmind_experiences WHERE scope='headquarters' AND status='recorded' " +
        "ORDER BY created_at DESC LIMIT 100"
      ).all(),
      db.prepare(
        "SELECT skill_id,title,purpose,status,current_revision,approved_revision " +
        "FROM yorpmind_skills WHERE status='approved' ORDER BY updated_at DESC LIMIT 100"
      ).all()
    ]);
    experienceCount = (experiences.results || []).length;
    const candidates = detectYorpMindPatterns(experiences.results || [], skills.results || [], 3);
    topics = candidates.length;

    for (const candidate of candidates) {
      const inserted = await db.prepare(
        "INSERT OR IGNORE INTO yorpmind_evolution_proposals " +
        "(proposal_id,topic_key,candidate_type,related_skill_id,status,evidence_json,evidence_count," +
        "rationale,analysis_method,run_id,proposed_at) " +
        "VALUES(?,?,?,?,'proposed',?,?,?,?,?,?) RETURNING proposal_id"
      ).bind(
        crypto.randomUUID(), candidate.topic_key, candidate.candidate_type,
        candidate.related_skill_id, JSON.stringify(candidate.evidence_ids),
        candidate.evidence_count, candidate.rationale,
        candidate.analysis_method, runId, clock().toISOString()
      ).first();
      if (inserted?.proposal_id) created++;
    }
    await db.prepare(
      "UPDATE yorpmind_evolution_runs SET status='completed',experiences_scanned=?," +
      "topics_observed=?,proposals_created=?,completed_at=? WHERE run_id=? AND status='running'"
    ).bind(experienceCount, topics, created, clock().toISOString(), runId).run();
    return {
      status: "completed", run_id: runId, experiences_scanned: experienceCount,
      topics_observed: topics, proposals_created: created,
      model_calls: 0, skills_modified: 0, releases_made: 0
    };
  } catch (error) {
    await db.prepare(
      "UPDATE yorpmind_evolution_runs SET status='failed',experiences_scanned=?," +
      "topics_observed=?,proposals_created=?,error_summary=?,completed_at=? " +
      "WHERE run_id=? AND status='running'"
    ).bind(experienceCount, topics, created,
      String(error instanceof Error ? error.message : error).slice(0, 280),
      clock().toISOString(), runId).run();
    return { status: "failed", run_id: runId, proposals_created: created };
  }
}
