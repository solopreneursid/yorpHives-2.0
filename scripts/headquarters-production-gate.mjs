/**
 * Headquarters PRODUCTION evidence gate. The public site and Headquarters
 * are distinct deployments. This code only reads evidence; it NEVER creates
 * databases, changes Access policy, deploys code or sends approvals.
 *
 * A green CI run is not a production attestation; the gate requires actual
 * provider bindings, authenticated staging, independent backup/restore,
 * owner Access coverage and an external watchdog.
 */
import { verifyHeadquartersD1Isolation } from "../functions/_lib/hq-resource-isolation.js";

const SHA=/^[a-f0-9]{40}$/i;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[89ab][a-f0-9]{12}$/i;
const SOURCE="YorpHives Headquarters";
export const TECHNICAL_GATE_VERSION=1;
export const MAX_EVIDENCE_AGE_HOURS=24;

function recent(value,now,maxHours=MAX_EVIDENCE_AGE_HOURS){
  if(typeof value!=="string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value))return false;
  const ms=Date.parse(value);
  return Number.isFinite(ms)&&ms<=now&&now-ms<=maxHours*3600*1000;
}
const pass=(id,ok,issue,passed)=>Object.freeze({
  id,passed:ok===true,detail:ok===true?passed:issue
});

export function evaluateHeadquartersProductionEvidence({
  project=null,access=null,staging=null,recovery=null,watchdog=null,ci=null,
  expectedSha=null, now=new Date(), ownerPermission=false
}={}){
  const timestamp=now instanceof Date?now.getTime():NaN;
  if(!Number.isFinite(timestamp))throw Error("Invalid readiness review clock");
  const isolation=verifyHeadquartersD1Isolation(project);
  const revision=typeof expectedSha==="string"&&SHA.test(expectedSha);
  const checks=[
    pass("provider-project-identity",
      project?.name==="yorphives-admin-staging" &&
      project?.source?.type==="github" &&
      project?.source?.config?.owner==="solopreneursid" &&
      project?.source?.config?.repo_name==="yorpHives-2.0" &&
      project?.production_branch==="build/yorphives-admin-reliability",
      "Canonical Headquarters Pages project/branch identity has not been independently verified.",
      "Provider project and GitHub source are identified."),
    pass("d1-environment-isolation",isolation.isolated,
      isolation.reason,
      "Preview and canonical D1 bindings refer to distinct physical databases."),
    pass("canonical-no-privileged-execution-services",
      project?.deployment_configs?.production != null &&
      Object.keys(project.deployment_configs.production.services||{}).length===0,
      "Canonical Headquarters still exposes a legacy Worker service binding, potentially capable of code changes or autonomous action. Only remove after safe migration to a tested monitoring-only deployment.",
      "Canonical runtime no longer exposes privileged service bindings."),
    pass("preview-no-repair-or-otp-authority",
      project?.deployment_configs?.preview != null &&
      Object.keys(project.deployment_configs.preview.services||{}).length===0 &&
      !Object.keys(project.deployment_configs.preview.env_vars||{}).some(name=>
       ["FOUNDER_EMAIL_API_TOKEN","FOUNDER_OTP_HMAC_KEY",
        "FOUNDER_OTP_ENABLED","FOUNDER_OTP_FROM"].includes(name)),
      "HQ preview still has deprecated repair/AI service bindings or OTP approval configuration.",
      "HQ preview has no deprecated execution services or internal OTP approval secrets."),
    pass("auth-access-boundaries",
      access?.source==="provider_access_policies" &&
      access?.owner_email_only===true &&
      access?.primary_domain_protected===true &&
      access?.pages_origin_protected===true &&
      access?.deployment_aliases_protected===true &&
      access?.anonymous_denial_verified===true &&
      recent(access?.checked_at,timestamp),
      "Owner-only Access policies and anonymous HTTP boundary on all public Admin origins have not been verified.",
      "Owner-only Access policies and HTTP-denial boundaries were checked recently."),
    pass("exact-revision-identity",
      revision && ci?.source==="independent_ci" &&
      ci?.sha===expectedSha && ci?.platform_checks==="success" &&
      ci?.browser_qa==="success" && ci?.codeql==="success" &&
      recent(ci?.completed_at,timestamp),
      "Exact reviewed commit lacks fresh independent platform, desktop/mobile and CodeQL verification.",
      "Exact reviewed SHA passed platform, browser and security checks."),
    pass("isolated-authenticated-staging",
      revision && staging?.source==="isolated_authenticated_staging" &&
      staging?.sha===expectedSha &&
      staging?.preview_d1_isolated===true &&
      staging?.authenticated_browser_passed===true &&
      staging?.anonymous_access_denied===true &&
      staging?.monitor_only_verified===true &&
      staging?.read_only_test===true &&
      recent(staging?.verified_at,timestamp),
      "Exact commit has not passed authenticated browser/monitor-only tests against isolated preview D1.",
      "Authenticated isolated staging QA verified the exact reviewed commit."),
    pass("verified-recovery",
      recovery?.source==="independent_restore_rehearsal" &&
      recovery?.schema_equal===true && recovery?.all_rows_equal===true &&
      recovery?.foreign_key_violations===0 &&
      recovery?.disposable_restore_destroyed===true &&
      recovery?.source_database_isolated===true &&
      recent(recovery?.verified_at,timestamp),
      "An independently reviewed, recent backup-to-disposable-restore and row/schema comparison is missing.",
      "Isolated, independent backup/restore and full equality were verified."),
    pass("outside-in-monitoring",
      watchdog?.source==="independent_local_watchdog" &&
      watchdog?.connected===true && watchdog?.status==="ready" &&
      watchdog?.repair_dispatch_enabled===false &&
      watchdog?.alerts_tested===true &&
      watchdog?.separate_os_supervisor_verified===true &&
      recent(watchdog?.observed_at,timestamp,1),
      "No fresh independently supervised Headquarters runtime and failure/recovery alert proof exists.",
      "Independent watchdog and alert delivery were verified."),
    pass("monitor-only-contract",
      ci?.monitor_only_contract_passed===true &&
      ci?.production_execution_enabled===false &&
      ci?.automatic_repairs_enabled===false,
      "Monitoring-only restrictions and disabled legacy release/repair endpoints are not attested.",
      "Monitoring-only contract is covered by verified tests.")
  ];
  const blockers=checks.filter(c=>!c.passed);
  // Neither a submitted evidence object nor this report grants deployment
  // rights. Owner still reviews an independent release workflow.
  return Object.freeze({
    schema_version:TECHNICAL_GATE_VERSION,
    subject:SOURCE,source:"read_only_production_gate",
    generated_at:new Date(timestamp).toISOString(),
    expected_sha:revision?expectedSha:null,
    technical_ready:blockers.length===0,
    production_deployment_authorized:false,
    automatic_production_deploy_allowed:false,
    owner_review_required:true,
    self_hosted_mode_not_evaluated:true,
    owner_permission_declared:ownerPermission===true,
    checks,blockers
  });
}

export function formatHeadquartersGateMarkdown(report){
  return [
    "# Headquarters production evidence review",
    "",
    "Generated: "+report.generated_at,
    "Reviewed commit: "+(report.expected_sha??"NOT VERIFIED"),
    "Technical evidence: "+(report.technical_ready?"ALL GATES PASS":"BLOCKED"),
    "Production deployment: NOT AUTHORIZED (separate founder action)",
    "",
    "## Checks",
    ...report.checks.map(c=>"- "+(c.passed?"PASS":"BLOCK")+" — "+c.id+": "+c.detail),
    "",
    "No cloud resources, databases, secrets, accounts, deployments or public website code were modified by this assessment.",
    "The self-hosted launch path requires a separate deployment and on-server recovery assessment.",
    ""
  ].join("\n");
}
