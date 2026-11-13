import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { stripTypeScriptTypes } from "node:module";
import { readFile } from "node:fs/promises";

const load = async path => readFile(new URL(path, import.meta.url), "utf8");
const moduleUrl = content => "data:text/javascript;base64," + Buffer.from(content).toString("base64");
const auth = moduleUrl(`
  export const adminJson = (value, status = 200) => Response.json(value, { status, headers: { "cache-control": "no-store" } });
  export const isAdminResponse = value => value instanceof Response;
  export const requireAdmin = async context => context.request.headers.has("x-ci-read-only")
    ? (["GET","HEAD"].includes(context.request.method)
      ? { email: "github-actions@yorphives.internal", serviceToken: true }
      : new Response("CI is read-only", { status: 403 }))
    : (context.request.headers.has("x-deny")
      ? new Response("Cloudflare Access denied", { status: 401 })
      : { email: "founder@example.com", serviceToken: false });
`);
const evidence = moduleUrl(await load("../functions/_lib/release-evidence.js"));
const kernel = moduleUrl(await load("../functions/_lib/yorpmind.js"));
const routeText = (await load("../functions/api/admin/yorpmind.ts"))
  .replace('"../../_lib/admin-auth"', JSON.stringify(auth))
  .replace('"../../_lib/release-evidence.js"', JSON.stringify(evidence))
  .replace('"../../_lib/yorpmind.js"', JSON.stringify(kernel));
const { onRequestGet, onRequestPost } = await import(moduleUrl(stripTypeScriptTypes(routeText)));
const { normalizeYorpMindRequest, yorpmindIsRecordedQa, validProcedureSteps } = await import(kernel);

const jobId = "123e4567-e89b-42d3-a456-426614174000";
const commitSha = "a".repeat(40);
const jobChecks = [
  "contract-tests", "staging-deployment", "browser-and-seo", "code-review", "lighthouse"
].map((key,index) => ({
  key, workflow_run_id: 100+index, job_id: 200+index,
  conclusion: "success", commit_sha: commitSha
}));
const recording = () => ({
  action: "capture_repair_experience",
  repair_job_id: jobId,
  title: "Repair QR download output failure",
  lesson: "Original issue reproduced on the prior version, followed by successful preview testing and matching regression checks."
});
const proposal = experienceId => ({
  action: "propose_skill",
  slug: "diagnose-qr-download",
  title: "Diagnose QR download failures",
  purpose: "Identify reproducible QR download regressions safely before preparing a human-reviewed fix.",
  source_experience_id: experienceId,
  steps: [
    "Reproduce the output failure using the previous preview build.",
    "Compare the generated output against the expected QR image.",
    "Run the complete preview regression checks and request independent review."
  ]
});

async function fixture(migrate = true) {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys=ON;");
  database.exec("CREATE TABLE admin_findings(id TEXT PRIMARY KEY);CREATE TABLE admin_asset_findings(id TEXT PRIMARY KEY);");
  database.exec(await load("../migrations/0008_admin_control_center.sql"));
  database.exec(await load("../migrations/0023_admin_repair_qa_evidence.sql"));
  if (migrate) database.exec(await load("../migrations/0024_yorpmind_foundation.sql"));

  database.prepare(
    "INSERT INTO admin_repair_jobs(id,requested_by,request_text,status,branch_name,pull_request_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)"
  ).run(jobId, "founder@example.com", "Investigate QR download defect", "needs_review",
    "build/agent/repair-" + jobId, "https://github.com/solopreneursid/yorpHives-2.0/pull/45",
    "2026-11-12T09:00:00Z", "2026-11-12T09:00:00Z");

  database.prepare(
    "INSERT INTO admin_repair_ci_verifications(job_id,commit_sha,checks_json,verified_at) VALUES(?,?,?,?)"
  ).run(jobId, commitSha, JSON.stringify(jobChecks), "2026-11-12T09:01:00Z");
  database.prepare(
    "INSERT INTO admin_repair_qa_reports(job_id,commit_sha,pr_number,reproduction_status,fix_status,regression_status,evidence,reviewed_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)"
  ).run(jobId, commitSha, 45, "reproduced", "passed", "passed",
    "Founder reproduced the earlier QR failure and recorded successful preview regression evidence.",
    "founder@example.com", "2026-11-12T09:02:00Z", "2026-11-12T09:02:00Z");

  const prepare = sql => {
    let values = [];
    const statement = {
      bind(...args) { values = args; return statement; },
      async first() { return database.prepare(sql).get(...values) || null; },
      async all() { return { success: true, results: database.prepare(sql).all(...values) }; },
      async run() {
        const result = database.prepare(sql).run(...values);
        return { success: true, meta: { changes: Number(result.changes) } };
      }
    };
    return statement;
  };
  const adapter = {
    prepare,
    async batch(statements) {
      const results = [];
      database.exec("BEGIN");
      try {
        for (const statement of statements) results.push(await statement.run());
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    }
  };
  const call = (method, data, options = {}) => {
    const origin = "https://admin-staging.yorphives.com";
    const headers = {
      "content-type": "application/json",
      "origin": options.origin === undefined ? origin : options.origin,
      ...(options.headers || {})
    };
    if (options.origin === null) delete headers.origin;
    const request = new Request(origin + "/api/admin/yorpmind", {
      method, headers, ...(method === "POST" ? { body: options.raw ?? JSON.stringify(data) } : {})
    });
    return (method === "POST" ? onRequestPost : onRequestGet)({ request, env: { DB: adapter } });
  };
  return { database, call };
}

test("YorpMind is a strictly private, read-only-by-default engine with no executable skill powers", async () => {
  const { database, call } = await fixture();
  try {
    const response = await call("GET");
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.name, "YorpMind");
    assert.equal(data.scope, "headquarters");
    assert.deepEqual(data.experiences, []);
    assert.deepEqual(data.skills, []);
    assert.equal(data.policy.public_access_enabled, false);
    assert.equal(data.policy.autonomous_learning_enabled, true);
    assert.equal(data.policy.learning_mode, "automatic_revision_matched_founder_reported_qa");
    assert.equal(data.policy.automatic_model_calls_per_learning, 0);
    assert.equal(data.policy.autonomous_skill_execution_enabled, false);
    assert.equal(data.policy.production_changes_enabled, false);
    assert.equal((await call("GET", null, { headers: { "x-deny": "1" } })).status, 401);
    assert.equal((await call("POST", recording(), { headers: { "x-ci-read-only": "1" } })).status, 403);
  } finally { database.close(); }
});

test("founder can only capture memory backed by the same CI and owner QA revision", async () => {
  const { database, call } = await fixture();
  try {
    database.prepare("UPDATE admin_repair_ci_verifications SET checks_json=? WHERE job_id=?")
      .run("[]", jobId);
    const rejected = await call("POST", recording());
    assert.equal(rejected.status, 409);
    assert.equal((await rejected.json()).error.code, "SOURCE_NOT_READY");
    database.prepare("UPDATE admin_repair_ci_verifications SET checks_json=? WHERE job_id=?")
      .run(JSON.stringify(jobChecks), jobId);
    const saved = await call("POST", recording());
    assert.equal(saved.status, 201);
    const record = await saved.json();
    assert.equal(record.autonomous_execution_enabled, false);
    assert.equal(record.production_approved, false);
    const again = await call("POST", recording());
    assert.equal(again.status, 409);
    const current = await (await call("GET")).json();
    assert.equal(current.counts.experiences, 1);
    assert.equal(current.experiences[0].evidence_level, "founder_reported_qa");
    assert.equal(current.experiences[0].source_commit_sha, commitSha);
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM admin_audit_events WHERE action='yorpmind_capture_experience'").get().n, 1);
  } finally { database.close(); }
});

test("founder can propose, explicitly approve, and then revise a non-executable skill", async () => {
  const { database, call } = await fixture();
  try {
    const created = await (await call("POST", recording())).json();
    const missing = await call("POST", proposal(crypto.randomUUID()));
    assert.equal(missing.status, 404);
    const first = await call("POST", proposal(created.id));
    assert.equal(first.status, 201);
    const skill = await first.json();
    assert.equal(skill.status, "draft");
    assert.equal(skill.revision, 1);
    assert.equal((await call("POST", proposal(created.id))).status, 409);
    const badReview = await call("POST", {
      action: "review_skill", skill_id: skill.id, expected_revision: 1,
      decision: "approve", review_note: "not enough"
    });
    assert.equal(badReview.status, 400);

    const review = await call("POST", {
      action: "review_skill", skill_id: skill.id, expected_revision: 1, decision: "approve",
      review_note: "Founder reviewed the reference procedure and confirmed it should be retained as documentation only."
    });
    assert.equal(review.status, 201);
    assert.equal((await review.json()).status, "approved");
    assert.equal((await call("POST", {
      action: "review_skill", skill_id: skill.id, expected_revision: 1, decision: "approve",
      review_note: "Attempting to duplicate an already recorded founder skill approval."
    })).status, 409);
    let view = await (await call("GET")).json();
    assert.equal(view.counts.approved_reference_skills, 1);
    assert.equal(view.skills[0].approved_revision, 1);
    assert.equal(view.skills[0].steps.length, 3);
    assert.equal(view.policy.autonomous_skill_execution_enabled, false);

    const revised = await call("POST", {
      action: "revise_skill", skill_id: skill.id, expected_revision: 1,
      source_experience_id: created.id,
      steps: [
        "Reproduce the original QR issue on the preserved preview.",
        "Verify the output in a separate test environment and document exact expectations."
      ]
    });
    assert.equal(revised.status, 201);
    view = await (await call("GET")).json();
    assert.equal(view.skills[0].status, "draft");
    assert.equal(view.skills[0].current_revision, 2);
    assert.equal(view.skills[0].approved_revision, null);
    assert.equal((await call("POST", {
      action: "revise_skill", skill_id: skill.id, expected_revision: 1,
      source_experience_id: created.id,
      steps: proposal(created.id).steps
    })).status, 409);
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM yorpmind_skill_revisions WHERE skill_id=?").get(skill.id).n, 2);
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM yorpmind_skill_reviews WHERE skill_id=?").get(skill.id).n, 1);
  } finally { database.close(); }
});

test("founder rejection retires a skill, leaving its evidence history intact", async () => {
  const { database, call } = await fixture();
  try {
    const memory = await (await call("POST", recording())).json();
    const skill = await (await call("POST", proposal(memory.id))).json();
    const declined = await call("POST", {
      action: "review_skill", skill_id: skill.id, expected_revision: 1,
      decision: "reject",
      review_note: "The procedure has insufficient independent evidence to be maintained as an approved skill."
    });
    assert.equal(declined.status, 201);
    const view = await (await call("GET")).json();
    assert.equal(view.skills[0].status, "retired");
    assert.equal(view.skills[0].approved_revision, null);
    assert.equal((await call("POST", {
      action: "revise_skill", skill_id: skill.id, expected_revision: 1,
      source_experience_id: memory.id, steps: proposal(memory.id).steps
    })).status, 409);
  } finally { database.close(); }
});

test("invalid inputs, CSRF, oversized JSON and missing staging migration fail closed", async () => {
  const { database, call } = await fixture();
  try {
    assert.equal((await call("POST", recording(), { origin: "https://attacker.example" })).status, 403);
    assert.equal((await call("POST", recording(), { origin: null })).status, 403);
    assert.equal((await call("POST", { action: "unknown_action" })).status, 400);
    assert.equal((await call("POST", { ...recording(), title: "short" })).status, 400);
    assert.equal((await call("POST", { ...recording(), repair_job_id: "not-a-uuid" })).status, 400);
    assert.equal((await call("POST", recording(), { raw: "x".repeat(9000) })).status, 400);
    assert.equal((await call("POST", recording(), { raw: "{invalid" })).status, 400);
    assert.equal(validProcedureSteps(["one", "two"]), null);
    assert.equal(normalizeYorpMindRequest({ action: "propose_skill", ...proposal(crypto.randomUUID()),
      steps: ["malicious", "another"] }), null);
    assert.equal(yorpmindIsRecordedQa({ status: "needs_review", commit_sha: commitSha }, { verified: false }), false);
  } finally { database.close(); }
  const old = await fixture(false);
  try {
    assert.equal((await old.call("GET")).status, 503);
    assert.equal((await old.call("POST", recording())).status, 503);
  } finally { old.database.close(); }
});

test("authenticated Markdown mirrors the same private evidence while avoiding HTML execution", async () => {
  const { database, call } = await fixture();
  try {
    assert.equal((await call("POST", recording())).status, 201);
    const response = await call("GET", null, { headers: { accept: "text/markdown" } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/markdown/);
    const text = await response.text();
    assert.match(text, /YorpMind — private Headquarters intelligence/);
    assert.match(text, /Repair QR download output failure/);
    assert.match(text, /Production changes: DISABLED/);
  } finally { database.close(); }
});
