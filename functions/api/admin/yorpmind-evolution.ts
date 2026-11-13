import {
  adminJson, isAdminResponse, requireAdmin, type AdminRequestContext
} from "../../_lib/admin-auth";

interface EvolutionProposal {
  proposal_id: string;
  topic_key: string;
  candidate_type: "new_reference_skill" | "review_reference_skill";
  related_skill_id: string | null;
  status: "proposed" | "acknowledged" | "dismissed";
  evidence_json: string;
  evidence_count: number;
  rationale: string;
  analysis_method: string;
  run_id: string;
  proposed_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
}
interface EvolutionRun {
  run_id: string;
  run_date: string;
  status: "running" | "completed" | "failed";
  experiences_scanned: number;
  topics_observed: number;
  proposals_created: number;
  created_at: string;
  completed_at: string | null;
}
interface EvolutionReviewRequest {
  proposal_id: string;
  decision: "acknowledge" | "dismiss";
  review_note: string;
}
interface EvolutionResponse {
  name: "YorpMind";
  scope: "headquarters";
  generated_at: string;
  engine: "deterministic_title_overlap_v1";
  autonomous_proposal_detection: true;
  deployment_enabled: false;
  autonomous_skill_mutation: false;
  model_calls_per_scan: 0;
  maximum_proposals_per_day: 3;
  reviewed_proposals: number;
  pending_proposals: number;
  last_runs: EvolutionRun[];
  proposals: Array<Omit<EvolutionProposal, "evidence_json"> & { evidence_ids: string[] }>;
  limitations: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const denied = (code: string, message: string, status: number) =>
  adminJson({ error: { code, message }, production_approved: false }, status);

async function ready(context: AdminRequestContext): Promise<boolean> {
  const result = await context.env.DB!.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN " +
    "('yorpmind_evolution_runs','yorpmind_evolution_proposals')"
  ).all<{ name: string }>();
  return new Set((result.results || []).map(row => row.name)).size === 2;
}

function asMarkdown(data: EvolutionResponse): Response {
  const safe = (value: unknown) => String(value ?? "").replace(/[\r\n]+/g, " ")
    .replace(/[\\`*_{}\[\]<>#|]/g, "\\$&");
  const lines = [
    "# YorpMind — governed self-evolution",
    "",
    "Autonomous observation: enabled after scheduled Worker deployment.",
    "Autonomous skill mutation: DISABLED",
    "Production publishing: DISABLED",
    "Model calls per scan: 0",
    "Pending proposals: " + data.pending_proposals,
    "",
    ...data.proposals.map(p =>
      "## " + safe(p.topic_key) + "\nStatus: " + safe(p.status) +
      "\nCandidate: " + safe(p.candidate_type) +
      "\nSource observations: " + p.evidence_count +
      "\nEvidence IDs: " + p.evidence_ids.map(safe).join(", ") +
      "\nIndependent verification: NOT COMPLETED\n"),
    "",
    data.limitations
  ];
  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/markdown; charset=utf-8",
      "cache-control": "no-store", vary: "Accept", "x-content-type-options": "nosniff" }
  });
}

export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  if (!await ready(context)) return denied("EVOLUTION_MIGRATION_REQUIRED", "Private D1 migration 0025 is required.", 503);
  const db = context.env.DB!;
  const [rows, runs] = await Promise.all([
    db.prepare(
      "SELECT proposal_id,topic_key,candidate_type,related_skill_id,status,evidence_json,evidence_count," +
      "rationale,analysis_method,run_id,proposed_at,reviewed_by,reviewed_at,review_note " +
      "FROM yorpmind_evolution_proposals ORDER BY proposed_at DESC LIMIT 30"
    ).all<EvolutionProposal>(),
    db.prepare(
      "SELECT run_id,run_date,status,experiences_scanned,topics_observed,proposals_created,created_at,completed_at " +
      "FROM yorpmind_evolution_runs ORDER BY run_date DESC LIMIT 7"
    ).all<EvolutionRun>()
  ]);

  const proposals = (rows.results || []).map(row => {
    let evidenceIds: string[] = [];
    try {
      const value = JSON.parse(row.evidence_json) as unknown;
      if (Array.isArray(value)) {
        evidenceIds = value.filter((v): v is string => typeof v === "string" && UUID.test(v)).slice(0, 5);
      }
    } catch { /* Invalid provenance does not become instructions. */ }
    const { evidence_json, ...rest } = row;
    return { ...rest, evidence_ids: evidenceIds };
  });
  const data: EvolutionResponse = {
    name: "YorpMind", scope: "headquarters", generated_at: new Date().toISOString(),
    engine: "deterministic_title_overlap_v1", autonomous_proposal_detection: true,
    deployment_enabled: false, autonomous_skill_mutation: false,
    model_calls_per_scan: 0, maximum_proposals_per_day: 3,
    reviewed_proposals: proposals.filter(p => p.status !== "proposed").length,
    pending_proposals: proposals.filter(p => p.status === "proposed").length,
    last_runs: runs.results || [], proposals,
    limitations: "Evidence is founder-reported historical QA. Lexical overlap is only a suggestion, not a proven root cause. Review and re-test source cases manually. The latest 30 proposals and 7 runs are shown."
  };
  return context.request.headers.get("accept")?.includes("text/markdown") ? asMarkdown(data) : adminJson(data);
}

export async function onRequestPatch(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const request = context.request;
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return denied("INVALID_ORIGIN", "Owner review requires an authenticated same-origin session.", 403);
  }
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return denied("INVALID_CONTENT_TYPE", "Review must be application/json.", 415);
  }
  if (Number(request.headers.get("content-length") || 0) > 1800) {
    return denied("TOO_LARGE", "Review exceeds 1,800 bytes.", 413);
  }
  const bodyText = await request.text();
  if (new TextEncoder().encode(bodyText).length > 1800) {
    return denied("TOO_LARGE", "Review exceeds 1,800 bytes.", 413);
  }
  let body: EvolutionReviewRequest | null = null;
  try { body = JSON.parse(bodyText) as EvolutionReviewRequest; } catch { /* handled */ }
  const note = typeof body?.review_note === "string" ? body.review_note.trim() : "";
  if (!body || !UUID.test(body.proposal_id) ||
    !["acknowledge","dismiss"].includes(body.decision) ||
    note.length < 40 || note.length > 1000 || note.includes("\0")) {
    return denied("INVALID_REVIEW", "Provide a valid proposal, decision and 40–1000 characters of review evidence.", 400);
  }
  if (!await ready(context)) return denied("EVOLUTION_MIGRATION_REQUIRED", "Private D1 migration 0025 is required.", 503);
  const status = body.decision === "acknowledge" ? "acknowledged" : "dismissed";
  const timestamp = new Date().toISOString();
  const db = context.env.DB!;
  const [updated] = await db.batch([
    db.prepare(
      "UPDATE yorpmind_evolution_proposals SET status=?,reviewed_by=?,reviewed_at=?,review_note=? " +
      "WHERE proposal_id=? AND status='proposed'"
    ).bind(status, identity.email, timestamp, note, body.proposal_id),
    db.prepare(
      "INSERT INTO admin_audit_events(id,actor,action,resource_type,resource_id,details_json,created_at) " +
      "SELECT ?,?,'yorpmind_evolution_review','yorpmind_proposal',?, ?,? " +
      "WHERE EXISTS(SELECT 1 FROM yorpmind_evolution_proposals " +
      "WHERE proposal_id=? AND status=? AND reviewed_by=? AND reviewed_at=?) " +
      "AND NOT EXISTS(SELECT 1 FROM admin_audit_events WHERE " +
      "action='yorpmind_evolution_review' AND resource_type='yorpmind_proposal' AND resource_id=?)"
    ).bind(crypto.randomUUID(), identity.email, body.proposal_id,
      JSON.stringify({ decision: body.decision, reference_only: true }),
      timestamp, body.proposal_id, status, identity.email, timestamp, body.proposal_id)
  ]);
  if (Number(updated?.meta?.changes || 0) !== 1) {
    return denied("REVIEW_ALREADY_RECORDED", "This proposal was already reviewed or does not exist.", 409);
  }
  return adminJson({
    success: true, proposal_id: body.proposal_id, status,
    creates_skill: false, executes_skill: false, grants_permissions: false,
    production_approved: false
  });
}
