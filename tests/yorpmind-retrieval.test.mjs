import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { stripTypeScriptTypes } from "node:module";
import { readFile } from "node:fs/promises";

const load = path => readFile(new URL(path, import.meta.url), "utf8");
const dataUrl = source => "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const helperUrl = dataUrl(await load("../functions/_lib/yorpmind-retrieval.js"));
const {
  parseYorpMindQuery, rankYorpMindEvidence, yorpmindRetrievalResponse,
  yorpmindRetrievalMarkdown
} = await import(helperUrl);

const authUrl = dataUrl(`
  export const adminJson = (value, status = 200) =>
    Response.json(value, { status, headers: { "cache-control": "no-store" } });
  export const isAdminResponse = value => value instanceof Response;
  export const requireAdmin = async context =>
    context.request.headers.get("x-deny")
      ? new Response("Access denied", { status: 401 })
      : { email: "founder@example.com", serviceToken: Boolean(context.request.headers.get("x-ci-read-only")) };
`);
const routeSource = (await load("../functions/api/admin/yorpmind-search.ts"))
  .replace('"../../_lib/admin-auth"', JSON.stringify(authUrl))
  .replace('"../../_lib/yorpmind-retrieval.js"', JSON.stringify(helperUrl));
const { onRequestGet } = await import(dataUrl(stripTypeScriptTypes(routeSource)));

const repairId = "123e4567-e89b-42d3-a456-426614174000";
const memoryId = "4c3e4567-e89b-42d3-a456-426614174000";
const skillId = "8c3e4567-e89b-42d3-a456-426614174000";
const sha = "a".repeat(40);

async function fixture(migrated = true) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE admin_findings(id TEXT PRIMARY KEY); CREATE TABLE admin_asset_findings(id TEXT PRIMARY KEY);");
  db.exec(await load("../migrations/0008_admin_control_center.sql"));
  db.exec(await load("../migrations/0023_admin_repair_qa_evidence.sql"));
  if (migrated) db.exec(await load("../migrations/0024_yorpmind_foundation.sql"));
  db.prepare("INSERT INTO admin_repair_jobs(id,requested_by,request_text,status,created_at,updated_at) VALUES(?,?,?,?,?,?)")
    .run(repairId, "founder@example.com", "Investigate download failure",
      "needs_review", "2026-11-12T12:00:00Z", "2026-11-12T12:00:00Z");
  if (migrated) {
    db.prepare("INSERT INTO yorpmind_experiences(experience_id,scope,source_type,source_id,source_commit_sha,title,lesson,evidence_level,status,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .run(memoryId, "headquarters", "repair_qa", repairId, sha, "QR image download incident",
        "Founder reproduced the download failure and retested browser regression on the isolated preview.",
        "founder_reported_qa", "recorded", "founder@example.com", "2026-11-12T13:00:00Z");
    db.prepare("INSERT INTO yorpmind_skills(skill_id,slug,title,purpose,status,current_revision,approved_revision,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(skillId, "diagnose-download", "Diagnose download regressions",
        "Use controlled preview testing to diagnose image download regressions.",
        "approved", 1, 1, "founder@example.com", "2026-11-12T13:30:00Z", "2026-11-12T13:30:00Z");
    db.prepare("INSERT INTO yorpmind_skill_revisions(skill_id,revision,source_experience_id,procedure_json,created_by,created_at) VALUES(?,?,?,?,?,?)")
      .run(skillId, 1, memoryId, JSON.stringify([
        "Reproduce the download failure on an isolated preview.",
        "Collect browser regression evidence and request independent verification."
      ]), "founder@example.com", "2026-11-12T13:30:00Z");
  }
  const prepare = sql => {
    let values = [];
    const statement = {
      bind(...args) { values = args; return statement; },
      async first() { return db.prepare(sql).get(...values) || null; },
      async all() { return { success: true, results: db.prepare(sql).all(...values) }; },
      async run() {
        const result = db.prepare(sql).run(...values);
        return { success: true, meta: { changes: Number(result.changes) } };
      }
    };
    return statement;
  };
  const call = ({ query = "download regression", accept = "application/json", denied = false, limit } = {}) => {
    const url = new URL("https://admin-staging.yorphives.com/api/admin/yorpmind-search");
    url.searchParams.set("q", query);
    if (limit !== undefined) url.searchParams.set("limit", limit);
    const request = new Request(url, {
      headers: { accept, ...(denied ? { "x-deny": "yes" } : {}) }
    });
    return onRequestGet({ request, env: { DB: { prepare } } });
  };
  return { db, call };
}

test("lexical retrieval checks terms, stable relevance, source provenance and no execution", async () => {
  const { db, call } = await fixture();
  try {
    const response = await call();
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.name, "YorpMind");
    assert.equal(data.search_mode, "bounded_recent_lexical");
    assert.equal(data.source_window.exhaustive, false);
    assert.equal(data.results.length, 2);
    assert.equal(data.results[0].record_type, "reference_skill");
    assert.equal(data.results[0].matched_terms.includes("download"), true);
    assert.equal(data.results[1].record_type, "experience");
    assert.equal(data.results[1].source_commit_sha, sha);
    assert.equal(data.results[1].evidence_level, "founder_reported_qa");
    assert.equal(data.execution.inference_calls, 0);
    assert.equal(data.execution.agent_actions, 0);
    assert.equal(data.execution.public_access, false);
    assert.equal(data.execution.production_approved, false);
    for (const item of data.results) {
      assert.equal(item.safe_to_execute, false);
      assert.equal(item.live_verified, false);
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM admin_audit_events").get().count, 0);
  } finally { db.close(); }
});

test("draft or retired skills, archived experiences and untrusted scope never enter search results", async () => {
  const { db, call } = await fixture();
  try {
    db.prepare("UPDATE yorpmind_skills SET status='draft', approved_revision=NULL WHERE skill_id=?").run(skillId);
    let data = await (await call()).json();
    assert.equal(data.results.length, 1);
    assert.equal(data.results[0].record_type, "experience");
    db.prepare("UPDATE yorpmind_experiences SET status='archived' WHERE experience_id=?").run(memoryId);
    data = await (await call()).json();
    assert.equal(data.results.length, 0);
    db.prepare("UPDATE yorpmind_skills SET status='approved', approved_revision=1 WHERE skill_id=?").run(skillId);
    data = await (await call()).json();
    assert.equal(data.results.length, 1);
    assert.equal(data.results[0].record_type, "reference_skill");
  } finally { db.close(); }
});

test("query validation rejects control, wildcard-only, overly broad or oversized searches", () => {
  const invalid = [
    "%", "??", "the and with", "a", "x".repeat(161),
    "download\nregression", "one two three four five six seven eight",
    "abc 123 def 456 ghi 789 jkl"
  ];
  for (const item of invalid) assert.equal(parseYorpMindQuery(item), null, item);
  assert.deepEqual(parseYorpMindQuery("Download download regression")?.terms, ["download", "regression"]);
  assert.deepEqual(parseYorpMindQuery("QR download regression")?.terms, ["download", "regression"]);
});

test("bounded candidate window is explicit, ranks exact matches and preserves stable ordering", () => {
  const query = parseYorpMindQuery("download regression");
  const experiences = Array.from({ length: 125 }, (_, index) => ({
    scope: "headquarters", status: "recorded", evidence_level: "founder_reported_qa",
    source_type: "repair_qa", experience_id: "memory-" + index, source_id: repairId,
    source_commit_sha: sha, title: index === 2 ? "download regression" : "Other procedures",
    lesson: index === 2 ? "Reproduce the regression before trusting the fix." : "No matching content.",
    created_at: new Date(2026, 0, 1 + index).toISOString()
  }));
  const result = rankYorpMindEvidence(query, experiences.slice(0, 120), [], 5);
  assert.equal(result.length, 1);
  assert.equal(result[0].record_id, "memory-2");
  const snapshot = yorpmindRetrievalResponse(query, experiences.slice(0, 120), [], 8);
  assert.equal(snapshot.source_window.maximum_per_type, 120);
  assert.equal(snapshot.source_window.exhaustive, false);
  assert.equal(snapshot.execution.inference_calls, 0);
});

test("Markdown is authenticated and remains non-executable reference data", async () => {
  const { db, call } = await fixture();
  try {
    const response = await call({ accept: "text/markdown" });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/markdown/);
    const body = await response.text();
    assert.match(body, /Autonomous skill execution: DISABLED/);
    assert.match(body, /Inference calls: 0/);
    assert.match(body, /Safe for execution: NO/);
    assert.match(body, /Historical repair|Source SHA/);
    const sample = yorpmindRetrievalResponse(parseYorpMindQuery("download"), [{
      scope: "headquarters", status: "recorded", evidence_level: "founder_reported_qa",
      source_type: "repair_qa", experience_id: memoryId, source_id: repairId,
      source_commit_sha: sha, title: "download", lesson: "Do not trust `this` _untrusted_ payload.",
      created_at: "2026-11-12T13:00:00Z"
    }], [], 3);
    assert.match(yorpmindRetrievalMarkdown(sample), /\\`this\\`/);
  } finally { db.close(); }
});

test("read-only endpoints fail closed when private D1 migration or Access authorization is absent", async () => {
  const base = await fixture();
  try {
    assert.equal((await base.call({ denied: true })).status, 401);
    assert.equal((await base.call({ limit: "0" })).status, 400);
    assert.equal((await base.call({ limit: "9" })).status, 400);
    assert.equal((await base.call({ limit: "1.5" })).status, 400);
    assert.equal((await base.call({ query: "abc 123 def 456 ghi 789 jkl" })).status, 400);
  } finally { base.db.close(); }

  const legacy = await fixture(false);
  try {
    const response = await legacy.call();
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "YORPMIND_MIGRATION_REQUIRED");
  } finally { legacy.db.close(); }
});
