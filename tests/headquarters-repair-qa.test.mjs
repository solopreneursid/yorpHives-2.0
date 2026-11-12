import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { stripTypeScriptTypes } from "node:module";
import { readFile } from "node:fs/promises";

const fixtureId = "123e4567-e89b-42d3-a456-426614174000";
const latestSha = "a".repeat(40);
const nextSha = "b".repeat(40);
const asModule = code => "data:text/javascript;base64," + Buffer.from(code).toString("base64");
const auth = asModule(`
  export const adminJson = (data, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
  export const isAdminResponse = value => value instanceof Response;
  export const requireAdmin = async context => context.request.headers.has("x-ci-service")
    ? new Response("Read-only CI identity", { status: 403 })
    : { email: "founder@example.com", serviceToken: false };
`);
const original = await readFile(new URL("../functions/api/admin/repair-qa.ts", import.meta.url), "utf8");
const route = await import(asModule(stripTypeScriptTypes(original.replace('"../../_lib/admin-auth"', JSON.stringify(auth)))));
const originalFetch = globalThis.fetch;

async function fixture(withSchema = true) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE admin_findings(id TEXT PRIMARY KEY); CREATE TABLE admin_asset_findings(id TEXT PRIMARY KEY);");
  db.exec(await readFile(new URL("../migrations/0008_admin_control_center.sql", import.meta.url), "utf8"));
  if (withSchema) db.exec(await readFile(new URL("../migrations/0023_admin_repair_qa_evidence.sql", import.meta.url), "utf8"));
  db.prepare(
    "INSERT INTO admin_repair_jobs(id,requested_by,request_text,status,branch_name,pull_request_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)"
  ).run(fixtureId,"founder@example.com","Fix QR download issue","needs_review",
    "build/agent/repair-" + fixtureId,
    "https://github.com/solopreneursid/yorpHives-2.0/pull/45",
    "2026-11-12T00:00:00Z","2026-11-12T00:00:00Z");
  if (withSchema) {
    db.prepare(
      "INSERT INTO admin_repair_ci_verifications(job_id,commit_sha,checks_json,verified_at) VALUES(?,?,?,?)"
    ).run(fixtureId, latestSha,
      JSON.stringify([{ name: "contract-tests", commit_sha: latestSha, conclusion: "success" }]),
      "2026-11-12T00:00:00Z");
  }

  const prepare = sql => {
    let args = [];
    const stmt = {
      bind(...values) { args = values; return stmt; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async all() { return { success: true, results: db.prepare(sql).all(...args) }; },
      async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; }
    };
    return stmt;
  };
  const adapter = {
    prepare,
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const output = [];
        for(const s of statements) output.push(await s.run());
        db.exec("COMMIT");
        return output;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
  };
  const call = (method, input = {}, options = {}) => {
    const url = "https://headquarters.yorphives.com/api/admin/repair-qa" +
      (method === "GET" ? "?job_id=" + fixtureId : "");
    const headers = {
      "content-type": "application/json",
      ...(method === "POST" ? { origin: options.origin ?? "https://headquarters.yorphives.com" } : {}),
      ...(options.headers || {})
    };
    if (options.origin === null) delete headers.origin;
    return (method === "GET" ? route.onRequestGet : route.onRequestPost)({
      env: { DB: adapter },
      request: new Request(url, { method, headers, ...(method === "POST" ? { body: JSON.stringify(input) } : {}) })
    });
  };
  return { db, call };
}

const validInput = () => ({
  job_id: fixtureId,
  reproduction_status: "reproduced",
  fix_status: "passed",
  regression_status: "passed",
  evidence: "Original QR download was reproduced on the prior preview. Updated preview returns the expected PNG. Retested keyboard access and invalid input handling."
});
function githubStub(commitSha = latestSha, options = {}) {
  return async (url, init) => {
    assert.match(String(url), /api\.github\.com\/repos\/solopreneursid\/yorpHives-2\.0\/pulls\/45$/);
    assert.equal(init?.headers?.["user-agent"], "YorpHives-Headquarters-QA/1.0");
    if (options.fail) return new Response("Not found", { status: 404 });
    return Response.json({
      number: 45,
      state: "open",
      draft: true,
      head: {
        ref: options.branch || "build/agent/repair-" + fixtureId,
        sha: commitSha,
        repo: { full_name: "solopreneursid/yorpHives-2.0" }
      },
      base: { ref: "build/headquarters-repair-verification",
        repo: { full_name: "solopreneursid/yorpHives-2.0" } }
    });
  };
}

test("owner QA saves atomic audit evidence for the exact current PR revision, without production approval", async () => {
  const { db, call } = await fixture();
  globalThis.fetch = githubStub();
  try {
    const response = await call("POST", validInput());
    assert.equal(response.status, 201);
    const data = await response.json();
    assert.equal(data.qa.commit_sha, latestSha);
    assert.equal(data.issue_specific_qa_complete, true);
    assert.equal(data.production_approved, false);
    assert.equal(data.qa.reviewed_by, "founder@example.com");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_audit_events WHERE action='repair_qa_reviewed'").get().n, 1);
    const get = await call("GET");
    assert.equal((await get.json()).revision_status, "current");
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("changed GitHub PR commit invalidates prior QA while preserving its history", async () => {
  const { db, call } = await fixture();
  try {
    globalThis.fetch = githubStub(latestSha);
    assert.equal((await call("POST", validInput())).status, 201);
    globalThis.fetch = githubStub(nextSha);
    const stale = await (await call("GET")).json();
    assert.equal(stale.qa.commit_sha, latestSha);
    assert.equal(stale.revision_status, "changed");
    assert.equal(stale.issue_specific_qa_complete, false);
    const newAttempt = await call("POST", validInput());
    assert.equal(newAttempt.status, 409, "New PR revision must not inherit old CI approval");
    assert.equal((await newAttempt.json()).error.code, "CI_REVISION_CHANGED");
    db.prepare("UPDATE admin_repair_ci_verifications SET commit_sha=? WHERE job_id=?").run(nextSha, fixtureId);
    const later = await (await call("POST", { ...validInput(), evidence: "Retested on new revision; original issue still reproduces on old revision. Updated fix passes all regressions." })).json();
    assert.equal(later.qa.commit_sha, nextSha);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_repair_qa_reports").get().n, 2);
  } finally { globalThis.fetch = originalFetch; db.close(); }
});

test("GitHub unavailable never manufactures a current QA verdict", async () => {
  const { db, call } = await fixture();
  try {
    globalThis.fetch = githubStub();
    assert.equal((await call("POST", validInput())).status, 201);
    globalThis.fetch = githubStub(latestSha, { fail: true });
    const get = await (await call("GET")).json();
    assert.equal(get.revision_status, "unavailable");
    assert.equal(get.issue_specific_qa_complete, false);
    assert.equal(get.production_approved, false);
    assert.equal((await call("POST", validInput())).status, 503);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_repair_qa_reports").get().n, 1);
  } finally { globalThis.fetch = originalFetch; db.close(); }
});

test("invalid source, insecure origin, unknown PR and unsupported findings are denied", async () => {
  const { db, call } = await fixture();
  try {
    globalThis.fetch = githubStub(latestSha, { branch: "main" });
    assert.equal((await call("POST", validInput())).status, 503);
    globalThis.fetch = githubStub();
    assert.equal((await call("POST", validInput(), { origin: "https://another.example" })).status, 403);
    assert.equal((await call("POST", { ...validInput(), fix_status: "passed", reproduction_status: "not_reproduced" })).status, 400);
    assert.equal((await call("POST", { ...validInput(), evidence: "short" })).status, 400);
    assert.equal((await call("POST", validInput(), { headers: { "x-ci-service": "1" } })).status, 403);
    db.prepare("UPDATE admin_repair_jobs SET status='running' WHERE id=?").run(fixtureId);
    assert.equal((await call("POST", validInput())).status, 409);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_repair_qa_reports").get().n, 0);
  } finally { globalThis.fetch = originalFetch; db.close(); }
});

test("repair PR without independently recorded exact-commit CI attestation cannot obtain passing QA", async () => {
  const { db, call } = await fixture();
  globalThis.fetch = githubStub();
  try {
    db.prepare("DELETE FROM admin_repair_ci_verifications WHERE job_id=?").run(fixtureId);
    const denied = await call("POST", validInput());
    assert.equal(denied.status, 409);
    assert.equal((await denied.json()).error.code, "CI_NOT_VERIFIED");
    const read = await (await call("GET")).json();
    assert.equal(read.revision_status, "unverified");
    assert.equal(read.issue_specific_qa_complete, false);
    assert.equal(read.production_approved, false);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_repair_qa_reports").get().n, 0);
  } finally { globalThis.fetch = originalFetch; db.close(); }
});

test("unmigrated environment fails closed; read-only Markdown makes QA status available to agents", async () => {
  const a = await fixture(false);
  try {
    assert.equal((await a.call("GET")).status, 503);
    assert.equal((await a.call("POST", validInput())).status, 503);
  } finally { a.db.close(); }
  const b = await fixture();
  globalThis.fetch = githubStub();
  try {
    assert.equal((await b.call("POST", validInput())).status, 201);
    const response = await b.call("GET", {}, { headers: { accept: "text/markdown" } });
    assert.match(response.headers.get("content-type"), /text\/markdown/);
    const text = await response.text();
    assert.match(text, /Production approved: NO/);
    assert.match(text, /Issue-specific QA complete: yes/);
  } finally { globalThis.fetch = originalFetch; b.db.close(); }
});
