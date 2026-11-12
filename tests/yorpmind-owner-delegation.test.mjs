import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { stripTypeScriptTypes } from "node:module";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const dataURL = source => "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const evidenceModule = dataURL(await read("../functions/_lib/release-evidence.js"));
const helper = dataURL((await read("../functions/_lib/owner-delegation.js"))
  .replace('"./release-evidence.js"', JSON.stringify(evidenceModule)));
const { validatePreviewUrl, validateOwnerDelegationInput,
  releaseEvidenceReady, OWNER_DELEGATION_EXECUTOR_ENABLED } = await import(helper);

const auth = dataURL(`
  export const adminJson = (v, status=200) => Response.json(v,{status});
  export const isAdminResponse = v => v instanceof Response;
  export const requireAdmin = async ctx =>
    ctx.request.headers.has("x-deny") ? new Response("Denied",{status:401}) :
    ctx.request.headers.has("x-ci-token") && ctx.request.method !== "GET" ?
    new Response("CI read-only",{status:403}) :
    { email: "founder@example.com", serviceToken: false };
  export const requireOwnerStepUp = async ctx =>
    ctx.request.headers.has("x-step-up") ? { email:"founder@example.com",serviceToken:false,authenticatedAt:Math.floor(Date.now()/1000) } :
    new Response("Fresh MFA required",{status:403});
`);
const unbundled = await read("../functions/api/admin/owner-delegations.ts");
const securePage = await read("../functions/api/admin/step-up/owner-delegations.ts");
const loadRoute = async source => import(dataURL(stripTypeScriptTypes(source
  .replace(/"\.\.\/\.\.\/\.\.\/_lib\/admin-auth"|"\.\.\/\.\.\/_lib\/admin-auth"/g, JSON.stringify(auth))
  .replace(/"\.\.\/\.\.\/\.\.\/_lib\/owner-delegation.js"|"\.\.\/\.\.\/_lib\/owner-delegation.js"/g, JSON.stringify(helper))
))));
const owner = await loadRoute(unbundled);
const stepup = await loadRoute(securePage);
const actualAuth = await import(dataURL(stripTypeScriptTypes(await read("../functions/_lib/admin-auth.ts"))));

const jobId = "123e4567-e89b-42d3-a456-426614174000";
const sha = "a".repeat(40);
const wrongSha = "b".repeat(40);
const checks = ["contract-tests","staging-deployment","browser-and-seo","code-review","lighthouse"]
  .map((key,index) => ({
    key, workflow_run_id: 400+index, job_id: 700+index,
    conclusion: "success", commit_sha: sha
  }));
const preview = "https://sha123.yorphives-admin-staging.pages.dev/";
const input = () => ({
  action: "deploy_verified_release", repair_job_id: jobId, commit_sha: sha, preview_url: preview,
  owner_note: "I inspected the isolated preview, reviewed the security report and confirmed the recovery procedure.",
  checklist: {
    preview_inspected: true, functional_tested: true, mobile_tested: true,
    qa_reviewed: true, security_reviewed: true, rollback_reviewed: true
  }
});
const originalFetch = globalThis.fetch;
function stubGithub(revision = sha) {
  return async (url, options) => {
    assert.match(String(url), /api\.github\.com\/repos\/solopreneursid\/yorpHives-2\.0\/pulls\/45$/);
    assert.equal(options.method, undefined);
    return Response.json({
      number: 45, state: "open",
      head: { sha: revision, ref: "build/agent/repair-"+jobId, repo: { full_name: "solopreneursid/yorpHives-2.0" } },
      base: { ref: "build/headquarters-yorpmind-evolution-loop",
        repo: { full_name: "solopreneursid/yorpHives-2.0" } }
    });
  };
}
async function fixture({ migration = true } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE admin_findings(id TEXT PRIMARY KEY); CREATE TABLE admin_asset_findings(id TEXT PRIMARY KEY);");
  db.exec(await read("../migrations/0008_admin_control_center.sql"));
  db.exec(await read("../migrations/0023_admin_repair_qa_evidence.sql"));
  if (migration) db.exec(await read("../migrations/0026_yorpmind_owner_delegation.sql"));
  db.prepare(
    "INSERT INTO admin_repair_jobs(id,requested_by,request_text,status,branch_name,pull_request_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)"
  ).run(jobId, "founder@example.com", "Fix QR download", "needs_review",
    "build/agent/repair-"+jobId, "https://github.com/solopreneursid/yorpHives-2.0/pull/45",
    "2026-11-12T00:00:00Z","2026-11-12T00:00:00Z");
  db.prepare(
    "INSERT INTO admin_repair_ci_verifications(job_id,commit_sha,checks_json,verified_at) VALUES(?,?,?,?)"
  ).run(jobId,sha,JSON.stringify(checks),"2026-11-12T00:00:00Z");
  db.prepare(
    "INSERT INTO admin_repair_qa_reports(job_id,commit_sha,pr_number,reproduction_status,fix_status,regression_status,evidence,reviewed_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)"
  ).run(jobId,sha,45,"reproduced","passed","passed",
    "Original issue reproduced, fix preview tested, all relevant regressions passed.",
    "founder@example.com","2026-11-12T00:00:00Z","2026-11-12T00:00:00Z");

  const prepare = sql => {
    let args = [];
    const statement = {
      bind(...values) { args=values; return statement; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async all() { return { success: true, results: db.prepare(sql).all(...args) }; },
      async run() { const r=db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
    };
    return statement;
  };
  const adapter = {
    prepare,
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const output = [];
        for (const statement of statements) output.push(await statement.run());
        db.exec("COMMIT");
        return output;
      } catch(e) { db.exec("ROLLBACK"); throw e; }
    }
  };
  const callOwner = (method, payload = input(), headers = {}) => {
    const path = "https://hq.yorphives.com/api/admin/owner-delegations";
    return (method === "GET" ? owner.onRequestGet : owner.onRequestPost)({
      env:{ DB: adapter },
      request:new Request(path,{method,
        headers:{ "content-type":"application/json", origin:"https://hq.yorphives.com",...headers},
        ...(method==="POST"?{body:JSON.stringify(payload)}:{})})
    });
  };
  const callStepup = (method, id, { authenticated=true, note="The review evidence and isolated preview meet the approved scope for this exact audited revision.", headers={} }={}) => {
    const url = "https://hq.yorphives.com/api/admin/step-up/owner-delegations?id="+encodeURIComponent(id);
    return (method==="GET"?stepup.onRequestGet:stepup.onRequestPost)({
      env:{DB:adapter},request:new Request(url,{
        method,headers:{ ...(authenticated?{"x-step-up":"1"}:{}),
          accept:"application/json", origin:"https://hq.yorphives.com",
          "content-type":"application/x-www-form-urlencoded",...headers },
        ...(method==="POST"?{body:new URLSearchParams({delegation_id:id,confirm:"yes",reason:note}).toString()}: {})
      })
    });
  };
  return {db,callOwner,callStepup};
}

test("only safe Cloudflare previews and exact release review are accepted", () => {
  assert.equal(validatePreviewUrl(preview), "https://sha123.yorphives-admin-staging.pages.dev");
  for(const bad of [
    "http://sha123.yorphives-admin-staging.pages.dev/",
    "https://sha123.yorphives-admin-staging.pages.dev.evil.example/",
    "https://other.pages.dev/",
    "https://user:pass@sha123.yorphives-admin-staging.pages.dev/",
    "https://sha123.yorphives-admin-staging.pages.dev/?token=secret",
    "https://sha123.yorphives-admin-staging.pages.dev/evil"
  ]) assert.equal(validatePreviewUrl(bad), null);
  assert.equal(validateOwnerDelegationInput(input())?.commit_sha,sha);
  assert.equal(validateOwnerDelegationInput({...input(),commit_sha:wrongSha})?.commit_sha,wrongSha);
  assert.equal(validateOwnerDelegationInput({...input(), checklist:{...input().checklist,qa_reviewed:false}}),null);
  assert.equal(validateOwnerDelegationInput({...input(),owner_note:"short"}),null);
  assert.equal(validateOwnerDelegationInput({...input(),action:"execute_all_admin_actions"}),null);
  assert.equal(OWNER_DELEGATION_EXECUTOR_ENABLED,false);
});

test("preparing release requires exact five-check CI, founder QA, live PR and owner preview checklist",async()=>{
  const {db,callOwner}=await fixture();
  globalThis.fetch=stubGithub();
  try{
    assert.equal((await callOwner("POST",{...input(),commit_sha:wrongSha})).status,409);
    db.prepare("UPDATE admin_repair_ci_verifications SET checks_json=? WHERE job_id=?").run("[]",jobId);
    assert.equal((await callOwner("POST")).status,409);
    db.prepare("UPDATE admin_repair_ci_verifications SET checks_json=? WHERE job_id=?").run(JSON.stringify(checks),jobId);
    globalThis.fetch=stubGithub(wrongSha);
    assert.equal((await callOwner("POST")).status,409);
    globalThis.fetch=stubGithub();
    assert.equal((await callOwner("POST",input(),{origin:"https://evil.example"})).status,403);
    const response=await callOwner("POST");
    assert.equal(response.status,201);
    const data=await response.json();
    assert.equal(data.status,"awaiting_mfa");
    assert.equal(data.execution_enabled,false);
    assert.equal(data.production_deployed,false);
    assert.ok(data.step_up_url.startsWith("/api/admin/step-up/"));
    assert.equal((await callOwner("POST")).status,409);
    const saved=db.prepare("SELECT * FROM yorpmind_owner_delegations").get();
    assert.equal(saved.commit_sha,sha);
    assert.equal(saved.reviewed_preview_by,"founder@example.com");
    assert.equal(saved.state,"awaiting_mfa");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_audit_events").get().n,1);
  }finally{globalThis.fetch=originalFetch;db.close();}
});

test("separate MFA checkpoint validates current revision, grants only this scoped operation and cannot replay",async()=>{
  const {db,callOwner,callStepup}=await fixture();
  globalThis.fetch=stubGithub();
  try{
    const prepared=await (await callOwner("POST")).json();
    const id=prepared.delegation_id;
    assert.equal((await callStepup("GET",id,{authenticated:false})).status,403);
    const page=await callStepup("GET",id);
    assert.equal(page.status,200);
    assert.match(page.headers.get("content-security-policy"),/form-action 'self'/);
    assert.match(await page.text(),/Authorize this reviewed release/);
    const denied=await callStepup("POST",id,{authenticated:false});
    assert.equal(denied.status,403);
    globalThis.fetch=stubGithub(wrongSha);
    assert.equal((await callStepup("POST",id)).status,409);
    globalThis.fetch=stubGithub();
    const approved=await callStepup("POST",id);
    assert.equal(approved.status,200);
    const grant=await approved.json();
    assert.equal(grant.success,true);
    assert.equal(grant.scope,"exact_reviewed_release_only");
    assert.equal(grant.authorized_revision,sha);
    assert.equal(grant.execution_enabled,false);
    assert.equal(grant.production_deployed,false);
    assert.equal((await callStepup("POST",id)).status,409);
    const row=db.prepare("SELECT state,authorized_by,authorized_at,authorization_expires_at FROM yorpmind_owner_delegations").get();
    assert.equal(row.state,"authorized");
    assert.equal(row.authorized_by,"founder@example.com");
    assert.ok(new Date(row.authorization_expires_at).getTime()-new Date(row.authorized_at).getTime()<=600001);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_audit_events").get().n,2);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_repair_jobs").get().n,1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM yorpmind_owner_delegations").get().n,1);
  }finally{globalThis.fetch=originalFetch;db.close();}
});

test("owner step-up denies absent separately configured MFA app and never accepts general admin Access JWT",async()=>{
  const base={DB:{prepare(){throw Error("not needed");}}};
  const req=new Request("https://hq.yorphives.com/api/admin/step-up/owner-delegations");
  const noConfig=await actualAuth.requireOwnerStepUp({request:req,env:base});
  assert.equal(noConfig.status,503);
  const sameAud=await actualAuth.requireOwnerStepUp({
    request:req,
    env:{...base,CF_ACCESS_AUD:"abc",CF_ACCESS_STEP_UP_AUD:"abc",CF_ACCESS_STEP_UP_MFA_POLICY_CONFIRMED:"yes"}
  });
  assert.equal(sameAud.status,503);
  const uniqueAud=await actualAuth.requireOwnerStepUp({
    request:req,
    env:{...base,CF_ACCESS_AUD:"abc",CF_ACCESS_STEP_UP_AUD:"def",CF_ACCESS_STEP_UP_MFA_POLICY_CONFIRMED:"yes"}
  });
  assert.equal(uniqueAud.status,403);
});

test("missing migration, service identity and invalid approval form are all blocked",async()=>{
  const {db,callOwner,callStepup}=await fixture();
  globalThis.fetch=stubGithub();
  try {
    assert.equal((await callOwner("POST",input(),{"x-ci-token":"1"})).status,403);
    const saved=await (await callOwner("POST")).json();
    assert.equal((await callStepup("POST",saved.delegation_id,{note:"too short"})).status,400);
    assert.equal((await callStepup("POST",saved.delegation_id,{headers:{origin:"https://attacker.example"}})).status,403);
    db.prepare("UPDATE yorpmind_owner_delegations SET request_expires_at=?").run("2000-01-01T00:00:00Z");
    assert.equal((await callStepup("POST",saved.delegation_id)).status,409);
    assert.equal(db.prepare("SELECT state FROM yorpmind_owner_delegations").get().state,"awaiting_mfa");
  }finally{globalThis.fetch=originalFetch;db.close();}
  const legacy=await fixture({migration:false});
  try{ assert.equal((await legacy.callOwner("GET")).status,503); }
  finally{legacy.db.close();}
});
