/**
 * Model-free, bounded Engineering -> independent QA work planning.
 * Converts verified *existence* of failed repair records into task proposals,
 * never a patch, executable instruction, approved lesson or release.
 * AI employees receive no administrator grants or production credentials.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CASES=2;
const MAX_SCANNED=6;
const MEMBERS=Object.freeze({engineering:"yorpmind1",quality:"yorpmind5"});
export function proposeEngineeringQaWork(repairs,staff,day){
 if(!Array.isArray(repairs)||!Array.isArray(staff)||
    typeof day!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(day)||
    !Number.isFinite(Date.parse(day+"T00:00:00Z")))return [];
 const managers=new Set(staff.filter(s=>s?.enabled===1).map(s=>s.staff_id));
 // Never generate half a handoff: Engineering and independent QA must both exist.
 if(!managers.has(MEMBERS.engineering)||!managers.has(MEMBERS.quality))return [];
 const seen=new Set(),out=[];
 for(const row of repairs.slice(0,MAX_SCANNED)){
  const id=String(row?.source_job_id||"");
  if(row?.status!=="failed"||!UUID.test(id)||seen.has(id))continue;
  seen.add(id);
  const evidence=Object.freeze({
   source:"admin_repair_jobs",source_job_id:id,
   execution_started:false,model_calls:0,
   code_changed:false,independent_qa_verified:false,
   learning_approved:false,release_authorized:false,
   production_deployed:false,requires_isolated_environment:true
  });
  // The source's failure_summary is untrusted and is deliberately not placed
  // into a future model prompt, terminal command, work-order title or summary.
  out.push({
   report_key:"work-order:engineering:"+id,manager_id:MEMBERS.engineering,
   subject_agent_id:"engineering-lead",source_job_id:id,
   recommendation:"investigate_failed_mission",severity:"high",
   summary:"Investigate the referenced failed repair in an isolated development environment. Document a reproducible failing check before preparing any patch. No automatic retry or paid inference is authorized.",
   evidence:{...evidence,phase:"engineering",next_phase:"independent_qa"}
  });
  out.push({
   report_key:"work-order:quality:"+id,manager_id:MEMBERS.quality,
   subject_agent_id:"quality-engineer",source_job_id:id,
   recommendation:"investigate_failed_mission",severity:"high",
   summary:"Independently reproduce the original defect and verify any proposed patch against the exact source revision. Never attest tests that were not actually run.",
   evidence:{...evidence,phase:"independent_qa",prerequisite:"verified_engineering_patch"}
  });
  if(seen.size>=MAX_CASES)break;
 }
 return out;
}
