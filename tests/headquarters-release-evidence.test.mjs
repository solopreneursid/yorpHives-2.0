import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { stripTypeScriptTypes } from "node:module";
import {
  parseCiEvidence,
  summarizeReleaseBoard,
  EXPECTED_CI_CHECKS
} from "../functions/_lib/release-evidence.js";

const toModule = value => "data:text/javascript;base64," + Buffer.from(value).toString("base64");
const auth = toModule(`
  export const adminJson = (value, status = 200) => Response.json(value, { status });
  export const requireAdmin = async context => context.request.headers.has("x-deny")
    ? new Response("Unauthorized", { status: 403 })
    : { email: "founder@example.com", serviceToken: false };
  export const isAdminResponse = identity => identity instanceof Response;
`);
const helper = toModule(await readFile(new URL("../functions/_lib/release-evidence.js", import.meta.url), "utf8"));
const source = (await readFile(new URL("../functions/api/admin/release-evidence.ts", import.meta.url), "utf8"))
  .replace('"../../_lib/admin-auth"', JSON.stringify(auth))
  .replace('"../../_lib/release-evidence.js"', JSON.stringify(helper));
const { onRequestGet } = await import(toModule(stripTypeScriptTypes(source)));
const commit = "a".repeat(40);
const repairId = "123e4567-e89b-42d3-a456-426614174000";
function verifiedChecks(sha = commit) {
  return EXPECTED_CI_CHECKS.map((key, index) => ({
    key,
    name: "Job " + key,
    workflow_run_id: 200 + index,
    job_id: 300 + index,
    commit_sha: sha,
    conclusion: "success"
  }));
}
async function fixture({ migrate = true, addRepair = true, qa = true, receipt = true } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE admin_findings(id TEXT PRIMARY KEY); CREATE TABLE admin_asset_findings(id TEXT PRIMARY KEY);");
  db.exec(await readFile(new URL("../migrations/0008_admin_control_center.sql", import.meta.url), "utf8"));
  if (migrate) db.exec(await readFile(new URL("../migrations/0023_admin_repair_qa_evidence.sql", import.meta.url), "utf8"));
  if (addRepair) {
    db.prepare("INSERT INTO admin_repair_jobs(id,requested_by,request_text,status,branch_name,pull_request_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").run(
      repairId, "owner@example.com", "Reproduce and fix the QR download bug", "needs_review",
      "build/agent/repair-" + repairId,
      "https://github.com/solopreneursid/yorpHives-2.0/pull/45",
      "2026-11-12T12:00:00Z", "2026-11-12T12:30:00Z"
    );
    if (migrate && receipt) {
      db.prepare("INSERT INTO admin_repair_ci_verifications(job_id,commit_sha,checks_json,verified_at) VALUES(?,?,?,?)")
        .run(repairId, commit, JSON.stringify(verifiedChecks()), "2026-11-12T12:20:00Z");
    }
    if (migrate && qa) {
      db.prepare("INSERT INTO admin_repair_qa_reports(job_id,commit_sha,pr_number,reproduction_status,fix_status,regression_status,evidence,reviewed_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
        .run(repairId, commit, 45, "reproduced", "passed", "passed",
          "Reproduced old error and verified the updated preview plus four related regression cases.",
          "founder@example.com", "2026-11-12T12:25:00Z", "2026-11-12T12:25:00Z");
    }
  }
  const prepare = sql => {
    let args = [];
    const stmt = {
      bind(...values) { args = values; return stmt; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async all() { return { success: true, results: db.prepare(sql).all(...args) }; },
      async run() { const v = db.prepare(sql).run(...args); return { success: true, meta: { changes: v.changes } }; }
    };
    return stmt;
  };
  const call = (accept = "application/json", headers = {}) => onRequestGet({
    env: { DB: { prepare } },
    request: new Request("https://headquarters.yorphives.com/api/admin/release-evidence", {
      headers: { accept, ...headers }
    })
  });
  return { db, call };
}
test("exact five independent CI receipts cannot imply production approval", () => {
  assert.equal(parseCiEvidence(JSON.stringify(verifiedChecks()), commit).verified, true);
  const board = summarizeReleaseBoard([{
    id: repairId,
    status: "needs_review",
    request_text: "Fix issue",
    created_at: "2026-11-12",
    updated_at: "2026-11-12",
    commit_sha: commit,
    checks_json: JSON.stringify(verifiedChecks()),
    qa_commit_sha: commit,
    reproduction_status: "reproduced",
    fix_status: "passed",
    regression_status: "passed",
    reviewed_by: "founder@example.com",
    qa_updated_at: "2026-11-12"
  }]);
  assert.equal(board.counts.ci_attested, 1);
  assert.equal(board.counts.qa_recorded, 1);
  assert.equal(board.counts.production_authorized, 0);
  assert.equal(board.production_approved, false);
  assert.equal(board.repairs[0].live_revision_verified, false);
  assert.ok(board.repairs[0].blockers.length >= 5);
});

test("malformed, duplicate, missing or wrong-revision CI receipt fails closed", () => {
  const malformed = [null, "", "{", "{}", JSON.stringify(verifiedChecks().slice(0, 3))];
  for (const value of malformed) assert.equal(parseCiEvidence(value, commit).verified, false);
  const bad = verifiedChecks(); bad[4].key = bad[3].key;
  assert.equal(parseCiEvidence(JSON.stringify(bad), commit).verified, false);
  const wrong = verifiedChecks(); wrong[2].commit_sha = "b".repeat(40);
  assert.equal(parseCiEvidence(JSON.stringify(wrong), commit).verified, false);
  const failed = verifiedChecks(); failed[0].conclusion = "failure";
  assert.equal(parseCiEvidence(JSON.stringify(failed), commit).verified, false);
  const forged = verifiedChecks(); forged[1].workflow_run_id = 0;
  assert.equal(parseCiEvidence(JSON.stringify(forged), commit).verified, false);
});

test("read-only founder JSON reports evidence honestly and blocks all deployments", async () => {
  const { db, call } = await fixture();
  try {
    const response = await call();
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.counts.repairs, 1);
    assert.equal(data.counts.ci_attested, 1);
    assert.equal(data.counts.qa_recorded, 1);
    assert.equal(data.production_approved, false);
    assert.equal(data.production_deployment_enabled, false);
    assert.equal(data.repairs[0].ci_commit_sha, commit);
    assert.equal(data.repairs[0].qa_recorded_for_ci_revision, true);
    assert.equal(data.repairs[0].live_revision_verified, false);
    assert.equal(data.repairs[0].production_approved, false);
  } finally { db.close(); }
});

test("unmigrated staging returns 503 and CI-denied session cannot fetch private evidence", async () => {
  const a = await fixture({ migrate: false });
  try {
    assert.equal((await a.call()).status, 503);
    assert.equal((await a.call("application/json", { "x-deny": "1" })).status, 403);
  } finally { a.db.close(); }
});

test("unverified CI or stale QA does not count as ready", async () => {
  const { db, call } = await fixture();
  try {
    db.prepare("UPDATE admin_repair_qa_reports SET commit_sha=? WHERE job_id=?")
      .run("b".repeat(40), repairId);
    let data = await (await call()).json();
    assert.equal(data.counts.ci_attested, 1);
    assert.equal(data.counts.qa_recorded, 0);
    db.prepare("UPDATE admin_repair_ci_verifications SET checks_json=? WHERE job_id=?")
      .run(JSON.stringify(verifiedChecks().slice(0, 1)), repairId);
    data = await (await call()).json();
    assert.equal(data.counts.ci_attested, 0);
    assert.equal(data.production_approved, false);
  } finally { db.close(); }
});

test("empty inventory and authenticated Markdown remain usable without additional services", async () => {
  const { db, call } = await fixture({ addRepair: false });
  try {
    const response = await call("text/markdown");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/markdown/);
    const text = await response.text();
    assert.match(text, /Production approval: NOT GRANTED/);
    assert.match(text, /Recent repair jobs: 0/);
    const json = await (await call()).json();
    assert.deepEqual(json.repairs, []);
  } finally { db.close(); }
});
