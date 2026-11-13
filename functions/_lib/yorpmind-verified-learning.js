import { parseCiEvidence } from "./release-evidence.js";
import { yorpmindIsRecordedQa } from "./yorpmind.js";

/**
 * Cross-channel learning: every repair is evaluated by its D1 evidence, never
 * by whether ChatGPT or the Headquarters browser proposed the patch.
 * No AI inference, independent QA claims, skill approval or code execution.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[a-f0-9]{40}$/i;
const MAX_BATCH = 12;
const safe = (value, max) => String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

export function learningEligibility(row) {
  if (!row || !UUID.test(String(row.id || "")) || !SHA.test(String(row.commit_sha || "")) ||
      typeof row.evidence !== "string" || row.evidence.trim().length < 30 ||
      typeof row.checks_json !== "string") return false;
  const attestation = parseCiEvidence(row.checks_json, row.commit_sha);
  return yorpmindIsRecordedQa(row, attestation);
}

export function learningText(row) {
  const request = safe(row.request_text, 260);
  const evidence = safe(row.evidence, 950);
  return {
    title: safe("Repair lesson: " + (request || "Verified issue-specific repair"), 180),
    lesson: safe(
      "Historical founder-reported QA, not proof of current production state. " +
      "Issue: " + (request || "Repair described in recorded job.") + " " +
      "QA observation: " + evidence + " " +
      "Reproduce and regression-test against the current revision before applying this lesson.",
      1800
    )
  };
}

/** Read one revision-matched, passed repair and record idempotent reference memory. */
export async function learnFromRepair(db, repairJobId, actor = "yorpmind-auto-learning") {
  if (!db || !UUID.test(String(repairJobId || "")))
    return { status: "invalid_source", learned: false, model_calls: 0 };
  const row = await db.prepare(
    "SELECT j.id,j.status,j.request_text,c.commit_sha,c.checks_json," +
    "q.reproduction_status,q.fix_status,q.regression_status,q.evidence " +
    "FROM admin_repair_jobs j " +
    "JOIN admin_repair_ci_verifications c ON c.job_id=j.id " +
    "JOIN admin_repair_qa_reports q ON q.job_id=j.id AND q.commit_sha=c.commit_sha " +
    "WHERE j.id=? LIMIT 1"
  ).bind(repairJobId).first();
  if (!learningEligibility(row))
    return { status: "not_eligible", learned: false, model_calls: 0 };
  const { title, lesson } = learningText(row);
  const id = crypto.randomUUID();
  const created = await db.prepare(
    "INSERT OR IGNORE INTO yorpmind_experiences " +
    "(experience_id,scope,source_type,source_id,source_commit_sha,title,lesson," +
    "evidence_level,status,recorded_by,created_at) VALUES " +
    "(?,'headquarters','repair_qa',?,?,?,?,'founder_reported_qa','recorded',?,?) " +
    "RETURNING experience_id"
  ).bind(id,repairJobId,row.commit_sha.toLowerCase(),title,lesson,
    safe(actor,160),new Date().toISOString()).first();
  if (!created?.experience_id)
    return { status: "already_recorded", learned: false, model_calls: 0 };
  await db.prepare(
    "INSERT INTO admin_audit_events (id,actor,action,resource_type,resource_id,details_json,created_at) " +
    "VALUES (?,?,?,?,?,?,?)"
  ).bind(crypto.randomUUID(),safe(actor,160),"yorpmind_auto_captured_repair",
    "yorpmind_experience",created.experience_id,
    JSON.stringify({repair_job_id:repairJobId,commit_sha:row.commit_sha,
      source:"revision_matched_owner_reported_qa",independent_qa_verified:false,
      production_approved:false,model_calls:0}),new Date().toISOString()).run();
  return { status: "recorded", learned: true,
    experience_id:created.experience_id, model_calls:0,
    evidence_level:"founder_reported_qa",production_approved:false };
}

/** Daily reconciliation: recover from transient API failures, never invent QA. */
export async function reconcileRepairLearning(db) {
  if (!db) return { status:"unavailable",scanned:0,learned:0,model_calls:0 };
  const tables = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN " +
    "('yorpmind_experiences','admin_repair_jobs','admin_repair_ci_verifications','admin_repair_qa_reports','admin_audit_events')"
  ).all();
  if (new Set((tables.results || []).map(x=>x.name)).size !== 5)
    return { status:"schema_unavailable",scanned:0,learned:0,model_calls:0 };
  const rows = await db.prepare(
    "SELECT j.id FROM admin_repair_jobs j " +
    "JOIN admin_repair_ci_verifications c ON c.job_id=j.id " +
    "JOIN admin_repair_qa_reports q ON q.job_id=j.id AND q.commit_sha=c.commit_sha " +
    "LEFT JOIN yorpmind_experiences e ON e.source_type='repair_qa' " +
    "AND e.source_id=j.id AND e.source_commit_sha=c.commit_sha " +
    "WHERE j.status='needs_review' AND q.reproduction_status='reproduced' " +
    "AND q.fix_status='passed' AND q.regression_status='passed' " +
    "AND e.experience_id IS NULL ORDER BY q.updated_at DESC LIMIT ?"
  ).bind(MAX_BATCH).all();
  let learned = 0, rejected = 0;
  for (const row of rows.results || []) {
    try {
      const result = await learnFromRepair(db,row.id,"yorpmind-daily-reconciliation");
      if (result.learned) learned++;
      else rejected++;
    } catch { rejected++; }
  }
  return { status: "completed", scanned: (rows.results || []).length,
    learned, rejected, max_per_run:MAX_BATCH,model_calls:0,production_approved:false };
}
