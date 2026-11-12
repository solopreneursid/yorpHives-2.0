import { adminJson, isAdminResponse, requireAdmin, type AdminRequestContext } from "../../_lib/admin-auth";
import { mutationGuard, readBoundedJson } from "../../_lib/headquarters";
import { radarSnapshot, syncRadarFromObservations, type OpportunitySignal, type RadarSnapshot } from "../../_lib/opportunity-radar";

interface RadarSyncRequest { action: "sync"; }
interface RadarTransitionRequest {
  action: "investigate" | "dismiss" | "reopen";
  signal_id: string;
  expected_updated_at: string;
}
interface RadarMissionRequest {
  action: "create_mission";
  signal_id: string;
  expected_updated_at: string;
}
type RadarMutation = RadarSyncRequest | RadarTransitionRequest | RadarMissionRequest;
interface RadarActionResult {
  success: true;
  action: RadarMutation["action"];
  signal_id?: string;
  status?: OpportunitySignal["triage_status"];
  job_id?: string;
  observed_count?: number;
  inserted_count?: number;
  inference_requests?: 0;
}
function validMutation(data: unknown): data is RadarMutation {
  if (!data || typeof data !== "object") return false;
  const value = data as Record<string, unknown>;
  if (value.action === "sync") return Object.keys(value).length === 1;
  if (!["investigate","dismiss","reopen","create_mission"].includes(String(value.action))) return false;
  return typeof value.signal_id === "string" &&
    /^(?:monitor|asset):[a-zA-Z0-9_-]{1,150}$/.test(value.signal_id) &&
    typeof value.expected_updated_at === "string" &&
    value.expected_updated_at.length > 0 && value.expected_updated_at.length <= 64;
}
function escapeMarkdown(value: string): string {
  return String(value).replace(/[\r\n]+/g," ").replace(/[\\`*_{}\[\]<>#|]/g, "\\$&");
}
export function radarResponse(request: Request, snapshot: RadarSnapshot): Response {
  const format = new URL(request.url).searchParams.get("format");
  const accept = request.headers.get("accept") || "";
  const wantsMarkdown = format === "markdown" || (!format && accept.includes("text/markdown"));
  if (!wantsMarkdown) {
    const response = adminJson(snapshot);
    response.headers.set("vary","Accept");
    return response;
  }
  const lines = [
    "# YorpHives Headquarters — Opportunity Radar", "",
    "Provenance: " + escapeMarkdown(snapshot.provenance), "",
    "Active signals: " + snapshot.counts.active,
    "Needs triage: " + snapshot.counts.needs_review,
    "Promoted to planned missions: " + snapshot.counts.promoted, "",
    "## First-party observations", ""
  ];
  for (const signal of snapshot.signals) {
    lines.push(
      "- **" + escapeMarkdown(signal.title) + "** — " + signal.severity + ", " + signal.category +
        ", triage " + signal.triage_status + ", observed " + escapeMarkdown(signal.last_observed),
      "  Source: " + escapeMarkdown(signal.source_kind) + " / " + escapeMarkdown(signal.source_id) +
        (signal.source_url ? " / " + escapeMarkdown(signal.source_url) : ""),
      "  Observed: " + escapeMarkdown(signal.details),
      "  Suggested review: " + escapeMarkdown(signal.recommendation)
    );
  }
  lines.push("", "Generated: " + snapshot.generated_at);
  return new Response(lines.join("\n"), { headers: {
    "content-type":"text/markdown; charset=utf-8",
    "cache-control":"no-store","x-content-type-options":"nosniff","vary":"Accept"
  }});
}
export async function onRequestGet(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  return radarResponse(context.request, await radarSnapshot(context.env.DB!));
}
export async function onRequestPost(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const blocked = mutationGuard(context.request);
  if (blocked) return blocked;
  let body: unknown;
  try { body = await readBoundedJson(context.request); }
  catch { return adminJson({ error: {message:"Provide valid JSON no larger than 24 KB."} },400); }
  if (!validMutation(body)) return adminJson({ error: {message:"Unsupported or incomplete Opportunity Radar action."} },400);
  const db = context.env.DB!;
  if (body.action === "sync") {
    try {
      const receipt = await syncRadarFromObservations(db,"owner");
      const response: RadarActionResult = {
        success:true,action:"sync",observed_count:receipt.observed_count,
        inserted_count:receipt.inserted_count,inference_requests:0
      };
      return adminJson(response);
    } catch {
      return adminJson({error:{message:"The monitoring ledger could not be synchronized. Existing observations were retained."}},503);
    }
  }
  if (body.action === "create_mission") {
    // One atomic INSERT promotes a signal via an SQLite trigger, preventing a
    // transient state in which a signal says "promoted" without a real mission.
    const jobId = crypto.randomUUID();
    const created = await db.prepare(`
      INSERT INTO agent_jobs
        (job_id,agent_id,job_type,title,request_summary,status,priority,created_by,
         origin_type,origin_ref,requires_owner_approval,evidence_json)
      SELECT ?,suggested_agent_id,'owner_mission',substr('Investigate: '||title,1,160),
        substr('First-party monitoring observation: '||details||char(10)||
          'Observed: '||last_observed||char(10)||
          'Source: '||source_kind||' / '||source_id||char(10)||
          'Suggested validation: '||recommendation||char(10)||
          'Verify this finding independently before treating it as current evidence.',1,4000),
        'planned',CASE severity WHEN 'critical' THEN 'urgent' WHEN 'high' THEN 'high' ELSE 'normal' END,
        ?,'opportunity_signal',signal_id,1,
        json_array(json_object('kind','first_party_monitoring','source',source_kind,
          'source_id',source_id,'observed_at',last_observed,'verified',0,'source_url',source_url))
      FROM hq_opportunity_signals
      WHERE signal_id=? AND updated_at=?
        AND triage_status IN ('new','investigating')
        AND source_status IN ('open','investigating','awaiting_approval')
      ON CONFLICT DO NOTHING RETURNING job_id
    `).bind(jobId,identity.email,body.signal_id,body.expected_updated_at).first<{job_id:string}>();
    if (!created?.job_id) return adminJson({error:{message:"The signal has changed, is resolved, or was already promoted. Refresh Radar."}},409);
    const response: RadarActionResult = {success:true,action:"create_mission",signal_id:body.signal_id,status:"promoted",job_id:created.job_id};
    return adminJson(response,201);
  }
  const target = body.action === "investigate" ? "investigating" : body.action === "dismiss" ? "dismissed" : "new";
  const from = body.action === "investigate" ? "new" : body.action === "dismiss" ? "new','investigating" : "dismissed";
  // SQL clause is a fixed program string, never derived from untrusted input.
  const statusClause = body.action === "dismiss" ? "('new','investigating')" :
                       body.action === "reopen" ? "('dismissed')" : "('new')";
  const updated = await db.prepare(
    "UPDATE hq_opportunity_signals SET triage_status=?,modified_by=?,"+
    "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE signal_id=? AND updated_at=? "+
    "AND triage_status IN "+statusClause+" RETURNING signal_id,triage_status"
  ).bind(target,identity.email,body.signal_id,body.expected_updated_at)
    .first<{signal_id:string;triage_status:OpportunitySignal["triage_status"]}>();
  if (!updated) return adminJson({error:{message:"Signal is stale or cannot transition from its current state."}},409);
  const response: RadarActionResult = {success:true,action:body.action,signal_id:updated.signal_id,status:updated.triage_status};
  return adminJson(response);
}
