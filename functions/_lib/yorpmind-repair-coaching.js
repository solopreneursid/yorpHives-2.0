/**
 * Deterministic operational coaching for YorpMind's Engineering and Quality
 * employees. All recommendations are observations, not verified repair
 * lessons, approved skills, self-deployment authority, or model training.
 *
 * Cases derive only from persisted failed repair jobs with source links.
 * The existing verified learning pipeline remains the sole path for
 * promoting a repair outcome into yorpmind_experiences.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MACHINE = /(?:\/api\/|\.(?:json|ya?ml|xml|txt)(?:$|[?#]))/i;
const MAX_INPUT = 6;
const MAX_CASES = 4;

export function suggestRepairCoaching(repairs, staff, day) {
  if (!Array.isArray(repairs) || !Array.isArray(staff) ||
      typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  const ids = new Set(staff.filter(s => s.enabled === 1).map(s => s.staff_id));
  const cases = [];
  for (const repair of repairs.slice(0, MAX_INPUT)) {
    if (cases.length >= MAX_CASES) break;
    if (repair.status !== "failed" || !UUID.test(String(repair.source_job_id || ""))) continue;
    const failure = String(repair.failure_summary || "").slice(0, 350);
    const source = String(repair.asset_url || "").slice(0, 300);
    const modelFailed = /(?:Workers AI returned no text response|MODEL_OUTPUT_EMPTY|MODEL_OUTPUT_TRUNCATED)/i.test(failure);
    const machineSeo = repair.finding_source === "asset" &&
      repair.finding_key === "missing-canonical" && MACHINE.test(source);

    if (modelFailed && ids.has("yorpmind1") && cases.length < MAX_CASES) {
      cases.push({
        report_key: "coaching:model-text:" + repair.source_job_id,
        manager_id: "yorpmind1",
        subject_agent_id: "engineering-lead",
        source_job_id: repair.source_job_id,
        recommendation: "investigate_failed_mission",
        severity: "medium",
        summary: "Repair AI returned no usable patch. Check response shape, finish reason and output budget; do not re-run paid inference automatically. This is an observed failure, not a verified solution.",
        evidence: {
          source: "admin_repair_jobs", job_id: repair.source_job_id,
          observed_failure: "missing_model_output", tested_fix: false,
          approved_skill: false, original_failure: failure.slice(0, 170)
        }
      });
    }
    if (machineSeo && ids.has("yorpmind5") && cases.length < MAX_CASES) {
      cases.push({
        report_key: "coaching:machine-seo:" + repair.source_job_id,
        manager_id: "yorpmind5",
        subject_agent_id: "quality-engineer",
        source_job_id: repair.source_job_id,
        recommendation: "investigate_failed_mission",
        severity: "medium",
        summary: "A machine-readable discovery file was treated like HTML and sent for a canonical-tag repair. Check response type and classification first. Do not certify a fix without a matching live check.",
        evidence: {
          source: "admin_repair_finding_links", job_id: repair.source_job_id,
          finding_key: repair.finding_key,
          expected_format: /\.json(?:$|[?#])|\/api\//i.test(source) ? "json" :
            /\.ya?ml(?:$|[?#])/i.test(source) ? "yaml" : "text",
          verified_response: false, tested_fix: false, approved_skill: false
        }
      });
    }
  }
  return cases;
}
