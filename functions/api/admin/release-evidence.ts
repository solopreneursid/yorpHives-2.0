import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";
import { summarizeReleaseBoard } from "../../_lib/release-evidence.js";

interface ReleaseEvidenceRow {
  id: string;
  status: string;
  requested_by: string;
  request_text: string;
  branch_name: string | null;
  pull_request_url: string | null;
  created_at: string;
  updated_at: string;
  commit_sha: string | null;
  checks_json: string | null;
  qa_commit_sha: string | null;
  reproduction_status: string | null;
  fix_status: string | null;
  regression_status: string | null;
  reviewed_by: string | null;
  qa_updated_at: string | null;
}
interface ReleaseCounts {
  repairs: number;
  ci_attested: number;
  qa_recorded: number;
  production_authorized: number;
}
interface ReleaseBoardResponse {
  schema_version: number;
  generated_at: string;
  scope: string;
  environment: string;
  production_deployment_enabled: false;
  production_approved: false;
  source_note: string;
  counts: ReleaseCounts;
  repairs: Array<{
    job_id: string;
    job_status: string;
    title: string;
    branch_name: string | null;
    pull_request_url: string | null;
    created_at: string;
    updated_at: string;
    ci_verified: boolean;
    ci_commit_sha: string | null;
    ci_checks_completed: string[];
    qa_recorded_for_ci_revision: boolean;
    qa_reviewed_by: string | null;
    qa_updated_at: string | null;
    live_revision_verified: false;
    production_approved: false;
    blockers: string[];
  }>;
}

function markdown(board: ReleaseBoardResponse): Response {
  const lines = [
    "# YorpHives Headquarters — release evidence",
    "",
    "Generated: " + board.generated_at,
    "Scope: " + board.scope,
    "Production deployment enabled: NO",
    "Production approval: NOT GRANTED",
    "",
    "## Evidence counts",
    "- Recent repair jobs: " + board.counts.repairs,
    "- CI-attested jobs: " + board.counts.ci_attested,
    "- Issue-specific QA records matching attested commit: " + board.counts.qa_recorded,
    "- Production-authorized: 0",
    "",
    board.source_note,
    ""
  ];
  for (const repair of board.repairs) {
    lines.push(
      "## Repair " + repair.job_id,
      "",
      "Status: " + repair.job_status,
      "CI attestation: " + (repair.ci_verified ? "present" : "not verified"),
      "QA for attested commit: " + (repair.qa_recorded_for_ci_revision ? "recorded" : "not recorded"),
      "Live GitHub HEAD: NOT CHECKED",
      "Production approval: NOT GRANTED",
      "Blocking requirements:",
      ...repair.blockers.map(item => "- " + item),
      ""
    );
  }
  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer"
    }
  });
}

export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;

  const schema = await context.env.DB!.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('admin_repair_ci_verifications','admin_repair_qa_reports')"
  ).all<{ name: string }>();
  const names = new Set((schema.results || []).map(record => record.name));
  if (!names.has("admin_repair_ci_verifications") || !names.has("admin_repair_qa_reports")) {
    return adminJson({
      error: {
        code: "RELEASE_EVIDENCE_MIGRATION_REQUIRED",
        message: "Private Headquarters release evidence requires D1 migration 0023."
      }
    }, 503);
  }

  const rows = await context.env.DB!.prepare(
    "SELECT j.id,j.status,j.requested_by,j.request_text,j.branch_name,j.pull_request_url,j.created_at,j.updated_at," +
    "c.commit_sha,c.checks_json,q.commit_sha AS qa_commit_sha,q.reproduction_status,q.fix_status,q.regression_status," +
    "q.reviewed_by,q.updated_at AS qa_updated_at " +
    "FROM admin_repair_jobs j LEFT JOIN admin_repair_ci_verifications c ON c.job_id=j.id " +
    "LEFT JOIN admin_repair_qa_reports q ON q.job_id=j.id AND q.commit_sha=c.commit_sha " +
    "WHERE j.id!='github-permission-probe-singleton' ORDER BY j.created_at DESC LIMIT 25"
  ).all<ReleaseEvidenceRow>();

  const board = summarizeReleaseBoard(rows.results || []) as ReleaseBoardResponse;
  return context.request.headers.get("accept")?.includes("text/markdown")
    ? markdown(board)
    : adminJson(board);
}
