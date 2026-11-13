/**
 * Public-site truth check. GitHub Actions only; no credentials, mutations,
 * production deploys, AI inference, internal service binding, or D1 writes.
 */
import {mkdir,writeFile} from "node:fs/promises";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {checkPublicWebsite} from "../functions/_lib/website-proof.js";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const folder=resolve(root,"artifacts/website-public-proof");
await mkdir(folder,{recursive:true});
const report=await checkPublicWebsite();
if(report.source!=="real_public_http_get"||
   report.origin!=="https://yorphives.com"||
   report.total!==7||report.checks.length!==7||
   report.new_ai_model_calls!==0||report.database_writes!==0||
   report.production_changes!==0){
  throw new Error("The public website evidence report failed contract validation.");
}
const evidence={
  ...report,
  observer:"github_actions_uncredentialed_runner",
  verification_scope:"basic_read_only_public_http_only",
  recorded_at:new Date().toISOString(),
  live_HTTP_performed:true,
  deployment_sha_verified:false,
  release_authorized:false,
  not_a_verified_repair_qa_record:true
};
await writeFile(resolve(folder,"report.json"),JSON.stringify(evidence,null,2)+"\n");
const status=report.checks.map(x=>[
  x.status==="verified_basic"?"PASS":x.status==="needs_attention"?"CHECK":"UNKNOWN",
  x.path,"HTTP",x.http_status??"n/a","expected",x.expected_format
].join(" ")).join("\n");
console.log("Public website HTTP evidence (read only):\n"+status);
console.log(JSON.stringify({
  passes:report.basic_passed,needs_attention:report.needs_attention,
  unverified:report.unverified,overall:report.overall,
  reported:"artifacts/website-public-proof/report.json",
  production_mutations:0,model_calls:0
}));
if(report.needs_attention||report.unverified){
  console.log("OBSERVATIONS ONLY: Any issue requires diagnosis and revision-matched QA. This job does not claim production readiness.");
}
