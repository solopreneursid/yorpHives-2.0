import {
  adminJson, isAdminResponse, requireAdmin, type AdminRequestContext
} from "../../_lib/admin-auth";
import { inspectMissionReceipt, MAX_PROOF_EVENTS } from "../../_lib/mission-proof.js";

interface SourceMission {
  job_id: string;
  job_type: string;
  status: string;
  agent_id: string | null;
  title: string;
  updated_at: string;
  input_json: string;
  result_json: string | null;
}
interface SourceEvent {
  job_id: string;
  event_type: string;
  created_at: string;
}
interface MissionProofRequest {
  job_id: string;
  format: "json" | "markdown";
}
interface MissionProofResponse {
  system: "headquarters_mission_proof";
  generated_at: string;
  evidence_scope: "private_database_observations_only";
  sampled_event_limit: number;
  proof: ReturnType<typeof inspectMissionReceipt>;
  independent_qa_passed: false;
  production_release_permitted: false;
  new_inference_calls: 0;
  limitations: string;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const failure = (code: string, message: string, status: number): Response =>
  adminJson({ error: { code, message }, release_authorized: false }, status);
const cleanMarkdown = (value: unknown): string =>
  String(value ?? "").replace(/[\r\n]+/g, " ")
    .replace(/[\\*\x60_{}\[\]<>#|]/g, "\\$&");

function markdown(response: MissionProofResponse): Response {
  const p = response.proof;
  const lines = [
    "# Headquarters — Mission evidence", "",
    "Evidence: " + cleanMarkdown(p.evidence_status),
    "Mission status: " + cleanMarkdown(p.status),
    "Saved records sufficient for brief review: " +
      (p.records_sufficient_for_owner_review ? "YES" : "NO"),
    "Independent QA: NOT VERIFIED",
    "Provider execution: NOT INDEPENDENTLY ATTESTED",
    "Production deployment: NOT AUTHORIZED",
    "New inference calls from this report: 0", "",
    "## Recorded checks", "",
    ...p.checks.map(c=>"- " + cleanMarkdown(c.label) + ": " + c.result +
      " — " + cleanMarkdown(c.detail)),
    "", "## Founder next action", "",
    cleanMarkdown(p.suggested_admin_action),
    "", "## Limitations", "",
    cleanMarkdown(response.limitations)
  ];
  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "no-store", "vary": "Accept",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer"
    }
  });
}
export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const url = new URL(context.request.url);
  const req: MissionProofRequest = {
    job_id: url.searchParams.get("job_id") || "",
    format: url.searchParams.get("format") === "markdown" ||
      context.request.headers.get("accept")?.includes("text/markdown") ?
      "markdown" : "json"
  };
  if (!UUID.test(req.job_id))
    return failure("INVALID_MISSION_ID","Provide a valid owner mission ID.",400);
  try {
    const db=context.env.DB!;
    const mission=await db.prepare(
      "SELECT job_id,job_type,status,agent_id,title,updated_at,input_json,result_json " +
      "FROM agent_jobs WHERE job_id=? AND job_type='owner_mission'"
    ).bind(req.job_id).first<SourceMission>();
    if (!mission)
      return failure("MISSION_NOT_FOUND","The requested owner mission was not found.",404);
    const events=await db.prepare(
      "SELECT job_id,event_type,created_at FROM agent_job_events " +
      "WHERE job_id=? ORDER BY created_at DESC LIMIT ?"
    ).bind(req.job_id,MAX_PROOF_EVENTS).all<SourceEvent>();
    const proof=inspectMissionReceipt(mission,events.results || []);
    const data:MissionProofResponse={
      system:"headquarters_mission_proof",
      generated_at:new Date().toISOString(),
      evidence_scope:"private_database_observations_only",
      sampled_event_limit:MAX_PROOF_EVENTS,
      proof,
      independent_qa_passed:false,
      production_release_permitted:false,
      new_inference_calls:0,
      limitations:"Database events and recorded model-attempt claims are not independently signed provider receipts. This report does not test a live website, confirm billing, attest to the current Git commit, perform independent QA, or grant MFA/release authorization."
    };
    if(req.format==="markdown")return markdown(data);
    const response=adminJson(data);
    response.headers.set("vary","Accept");
    return response;
  }catch{
    return failure("MISSION_PROOF_UNAVAILABLE",
      "Private mission evidence could not be inspected. No completion or production approval can be inferred.",503);
  }
}
