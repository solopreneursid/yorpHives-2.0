/**
 * Read-only mission evidence. Recorded D1 events are not independent QA,
 * provider billing receipts, verified model claims or permission to deploy.
 */
export const MAX_PROOF_EVENTS = 40;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATES = new Set(["planned","queued","running","awaiting_owner_approval","completed","failed","cancelled"]);
function object(value, max) {
  if (typeof value !== "string" || value.length > max) return {};
  try { const x=JSON.parse(value);return x && typeof x==="object" && !Array.isArray(x) ? x : {}; }
  catch { return {}; }
}
const clean = (x, n) => typeof x==="string" ? x.trim().slice(0,n) : "";
const date = x => typeof x==="string" && x.length<=40 &&
  /^\d{4}-\d{2}-\d{2}T/.test(x) && Number.isFinite(Date.parse(x));
const list = x => Array.isArray(x) ? x.filter(v=>typeof v==="string" && v.trim())
  .slice(0,8).map(v=>clean(v,350)) : [];
const check = (id,label,ok,yes,no) => ({
  id,label,result:ok?"recorded":"needs_review",detail:ok?yes:no
});
export function inspectMissionReceipt(job, events=[]) {
  if (!job || typeof job!=="object" || !UUID.test(String(job.job_id||"")) ||
      job.job_type!=="owner_mission" || !STATES.has(job.status)) {
    return { evidence_status:"unavailable", status:"unknown", checks:[],
      issue:"This is not a recognized owner mission.",records_sufficient_for_owner_review:false,
      provider_execution_attested:false,claims_independently_verified:false,
      release_authorized:false,production_deployed:false,
      suggested_admin_action:"Return to Headquarters and investigate this record." };
  }
  const history=Array.isArray(events)?events.slice(0,MAX_PROOF_EVENTS):[];
  const count=kind=>history.filter(e=>e?.job_id===job.job_id && e.event_type===kind).length;
  const input=object(job.input_json,8000);
  const output=object(job.result_json,24000);
  const attempted=date(input.model_attempt_started_at);
  const goodBrief=output.kind==="recommendation_brief" && output.verified===false &&
    clean(output.summary,900).length>=3 && clean(output.recommended_approach,1600).length>=3 &&
    list(output.actions).length>0 && list(output.verification_needed).length>0;
  const waiting=job.status==="awaiting_owner_approval";
  const acknowledged=job.status==="completed" && count("brief_review_acknowledged")===1;
  const queue=count("mission_queued"),start=count("mission_running"),review=count("mission_awaiting_owner_approval");
  const checks=[
    check("dispatch","Founder mission dispatch event",queue===1,
      "One queued event exists in D1.","Queue evidence is missing or duplicated."),
    check("running","Durable mission running event",start===1,
      "One running event exists in D1.","Running evidence is missing or duplicated."),
    check("inference_claim","At-most-one AI attempt claimed",attempted,
      "The job records a durable inference attempt claim.","A model attempt is not recorded."),
    check("result","Complete structured brief saved",goodBrief,
      "The unverified decision brief contains required fields.","No valid completed brief is stored."),
    check("review_gate","Founder review gate recorded",(waiting || acknowledged) && review===1,
      acknowledged?"The owner acknowledged the planning brief; facts remain unverified.":"The mission awaits founder review.",
      "A founder review state or acknowledgement was not confirmed.")
  ];
  const sufficient=checks.every(x=>x.result==="recorded");
  const code=clean(output.code,64),message=clean(output.error,240);
  const classification=/^[A-Z_]{3,64}$/.test(code) ? code :
    /AI response did not contain valid JSON|not a complete structured decision brief/i.test(message) ?
    "BRIEF_JSON_INVALID" : "UNCLASSIFIED_FAILURE";
  return {
    job_id:job.job_id,status:job.status,agent_id:clean(job.agent_id,90),
    job_title:clean(job.title,160),last_updated_at:date(job.updated_at)?job.updated_at:null,
    evidence_status:job.status==="failed"?"recorded_failure":sufficient ?
      acknowledged?"recorded_review_acknowledged":"recorded_review_ready":"incomplete_record",
    checks,records_sufficient_for_owner_review:sufficient,
    provider_execution_attested:false,claims_independently_verified:false,
    release_authorized:false,production_deployed:false,
    provider_billing_verified:false,provider_usage:"unknown",
    failure:job.status==="failed"?{
      code:classification,
      message:message||"A mission failure was recorded."
    }:null,
    model_metadata:goodBrief?{
      model:clean(output.model,120)||"unspecified",
      generated_at:date(output.generated_at)?output.generated_at:null
    }:null,
    verification_checklist:goodBrief?list(output.verification_needed):[],
    event_window:{inspected:history.length,truncated:history.length===MAX_PROOF_EVENTS,
      expected_events_present:queue===1&&start===1&&review===1},
    suggested_admin_action:job.status==="failed"?
      "Inspect the recorded failure and private Worker diagnostics; verify any fix in staging. A new paid mission needs a separate founder dispatch.":
      acknowledged?
        "This planning brief was acknowledged but never independently verified. Proceed to separate factual and regression QA; no release approval exists.":
      sufficient?
        "Read the AI brief, independently verify its checks, then acknowledge or discard it. Neither action approves a release.":
        "Investigate missing evidence before acknowledging work. Never deploy based on this record."
  };
}
