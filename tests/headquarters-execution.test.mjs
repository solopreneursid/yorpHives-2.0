import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { DatabaseSync } from "node:sqlite";

const source = async path => readFile(new URL(path, import.meta.url), "utf8");
const dataURL = sourceText => "data:text/javascript;base64," + Buffer.from(stripTypeScriptTypes(sourceText)).toString("base64");
const authURL = dataURL(await source("../functions/_lib/admin-auth.ts"));
const domainURL = dataURL((await source("../functions/_lib/headquarters.ts")).replace('"./admin-auth"', JSON.stringify(authURL)));
const routeURL = dataURL(
  (await source("../functions/api/admin/headquarters.ts"))
    .replace('"../../_lib/admin-auth"', JSON.stringify(authURL))
    .replace('"../../_lib/headquarters"', JSON.stringify(domainURL))
);
const { onRequestGet, onRequestPost, onRequestPatch } = await import(routeURL);
const retrievalURL = dataURL(await source("../functions/_lib/yorpmind-retrieval.js"));
const missionContextURL = dataURL((await source("../hq-engine/yorpmind-context.js"))
  .replace('"../functions/_lib/yorpmind-retrieval.js"', JSON.stringify(retrievalURL)));
const engineSource = (await source("../hq-engine/worker.js"))
  .replace('import { WorkflowEntrypoint } from "cloudflare:workers";',
    "class WorkflowEntrypoint { constructor() { this.env = {}; } }")
  .replace('"./yorpmind-context.js"', JSON.stringify(missionContextURL));
const { MissionWorkflow, default: missionWorker } = await import(dataURL(engineSource));

const key = await crypto.subtle.generateKey({
  name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"
}, true, ["sign", "verify"]);
const jwk = await crypto.subtle.exportKey("jwk", key.publicKey);
jwk.kid = "hq";
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
async function token(extra = {}) {
  const a = encode({ alg: "RS256", kid: "hq" });
  const b = encode({
    iss: "https://hq-test.cloudflareaccess.com",
    aud: ["hq-test"], exp: Math.floor(Date.now() / 1000) + 120,
    email: "owner@example.com", ...extra
  });
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key.privateKey, new TextEncoder().encode(a + "." + b)
  );
  return a + "." + b + "." + Buffer.from(signature).toString("base64url");
}
const signedOwner = await token();
function createDb() {
  const database = new DatabaseSync(":memory:");
  const prepare = sql => {
    let values = [];
    const statement = {
      bind(...items) { values = items; return statement; },
      async first() { return database.prepare(sql).get(...values) || null; },
      async all() { return { results: database.prepare(sql).all(...values), success: true }; },
      async run() {
        const record = database.prepare(sql).run(...values);
        return { success: true, meta: { changes: Number(record.changes) } };
      }
    };
    return statement;
  };
  return { database, adapter: { prepare } };
}
const call = (env, method, body, override = {}) => ({
  env,
  request: new Request("https://hq.example.com/api/admin/headquarters", {
    method,
    headers: {
      "cf-access-jwt-assertion": signedOwner,
      origin: "https://hq.example.com",
      "content-type": "application/json",
      ...override
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
});
const makeMission = (agent = "product-strategist") => ({
  job_id: crypto.randomUUID(),
  agent_id: agent,
  title: "Improve the YorpHives onboarding funnel",
  request_summary: "Outline measurable onboarding improvements with risks, assumptions and verification needs.",
  priority: "high"
});
const brief = () => ({
  summary: "Improve first-use clarity.",
  recommended_approach: "Test the onboarding flow and measure completion.",
  actions: ["Audit first session friction", "Design an A/B experiment"],
  risks: ["Changes may lower activation"],
  assumptions: ["New users have unclear next steps"],
  verification_needed: ["Collect real funnel analytics"]
});
const step = { do: async (name, options, handler) => (typeof options === "function" ? options : handler)() };
const originalFetch = globalThis.fetch;

test("mission execution requires authenticated owner, allowed specialist and healthy service", async () => {
  const { database, adapter } = createDb();
  database.exec(await source("../migrations/0010_agentic_os_foundation.sql"));
  database.exec(await source("../migrations/0011_headquarters_audit.sql"));
  database.exec(await source("../migrations/0012_headquarters_execution.sql"));
  database.exec(await source("../migrations/0013_headquarters_brief_review.sql"));
  globalThis.fetch = async url => {
    assert.equal(url, "https://hq-test.cloudflareaccess.com/cdn-cgi/access/certs");
    return Response.json({ keys: [jwk] });
  };
  const workerEnv = {
    DB: adapter,
    AI: {
      run: async (model, params) => {
        assert.equal(model, "@cf/qwen/qwen3.8-27b");
        assert.equal(params.reasoning_effort, "low");
        assert.equal(params.chat_template_kwargs.enable_thinking, false);
        assert.equal(params.max_completion_tokens, 1800);
        return { choices: [{ message: { content: JSON.stringify(brief()) } }] };
      }
    },
    MISSION_WORKFLOW: {
      async create({ id, params }) {
        assert.equal(params.kind, "mission_brief");
        assert.equal(id, "mission-" + params.job_id);
        return { id };
      }
    }
  };
  const HQ_ENGINE_SERVICE = {
    async fetch(request) { return missionWorker.fetch(request, workerEnv); }
  };
  const env = {
    DB: adapter, HQ_ENGINE_SERVICE,
    CF_ACCESS_TEAM_DOMAIN: "hq-test.cloudflareaccess.com",
    CF_ACCESS_AUD: "hq-test",
    ADMIN_ALLOWED_EMAILS: "owner@example.com",
    ADMIN_CI_SERVICE_TOKEN_IDS: "test-ci"
  };
  try {
    assert.equal((await onRequestGet(call(env, "GET", undefined, { "cf-access-jwt-assertion": "" }))).status, 401);
    const ci = await token({ email: undefined, sub: "", common_name: "test-ci", service_token_status: true });
    assert.equal((await onRequestPatch(call(env, "PATCH", { action: "dispatch", job_id: crypto.randomUUID(), expected_updated_at: "now" }, { "cf-access-jwt-assertion": ci }))).status, 403);
    const mission = makeMission();
    assert.equal((await onRequestPost(call(env, "POST", mission))).status, 201);
    const snapshot = await (await onRequestGet(call(env, "GET"))).json();
    assert.equal(snapshot.engine_available, true);
    const offlineSnapshot = await (await onRequestGet(call({ ...env, HQ_ENGINE_SERVICE: undefined }, "GET"))).json();
    assert.equal(offlineSnapshot.engine_available, false);
    assert.equal(snapshot.specialists.filter(agent => agent.enabled && agent.autonomy_level === "recommend").length, 7);
    assert.equal(snapshot.missions.length, 1);
    const stale = { action: "dispatch", job_id: mission.job_id, expected_updated_at: "stale" };
    assert.equal((await onRequestPatch(call(env, "PATCH", stale))).status, 409);
    const wanted = { ...stale, expected_updated_at: snapshot.missions[0].updated_at };
    const missing = await onRequestPatch(call({ ...env, HQ_ENGINE_SERVICE: undefined }, "PATCH", wanted));
    assert.equal(missing.status, 503);
    assert.equal(database.prepare("SELECT status FROM agent_jobs WHERE job_id=?").get(mission.job_id).status, "planned");
    assert.equal((await onRequestPatch(call(env, "PATCH", wanted, { origin: "https://malicious.example" }))).status, 403);
    const started = await onRequestPatch(call(env, "PATCH", wanted));
    assert.equal(started.status, 202);
    assert.equal((await started.json()).workflow_id, "mission-" + mission.job_id);
    assert.equal((await onRequestPatch(call(env, "PATCH", wanted))).status, 409);
    assert.equal(database.prepare("SELECT status FROM agent_jobs WHERE job_id=?").get(mission.job_id).status, "queued");

    const wf = new MissionWorkflow();
    wf.env = workerEnv;
    const completed = await wf.run({ payload: JSON.stringify({ kind: "mission_brief", job_id: mission.job_id }) }, step);
    assert.equal(completed.status, "awaiting_owner_approval");
    const record = database.prepare("SELECT status,result_json,evidence_json FROM agent_jobs WHERE job_id=?").get(mission.job_id);
    assert.equal(record.status, "awaiting_owner_approval");
    assert.equal(JSON.parse(record.result_json).verified, false);
    assert.deepEqual(JSON.parse(record.result_json).actions, brief().actions);
    assert.equal(JSON.parse(record.evidence_json)[0].source_count, 0);
    const eventNames = database.prepare("SELECT event_type FROM agent_job_events WHERE job_id=? ORDER BY created_at").all(mission.job_id).map(row => row.event_type);
    for (const name of ["mission_created", "mission_queued", "mission_running", "mission_awaiting_owner_approval"]) assert.ok(eventNames.includes(name), name);

    const current = database.prepare("SELECT updated_at FROM agent_jobs WHERE job_id=?").get(mission.job_id);
    const review = { action: "review_brief", job_id: mission.job_id, expected_updated_at: current.updated_at };
    const reviewed = await onRequestPatch(call(env, "PATCH", review));
    assert.equal(reviewed.status, 200);
    assert.equal((await reviewed.json()).verified, false);
    assert.equal((await onRequestPatch(call(env, "PATCH", review))).status, 409);
    const reviewedMission = database.prepare("SELECT status,result_json FROM agent_jobs WHERE job_id=?").get(mission.job_id);
    assert.equal(reviewedMission.status, "completed");
    assert.equal(JSON.parse(reviewedMission.result_json).verified, false);
    assert.ok(database.prepare("SELECT 1 FROM agent_job_events WHERE job_id=? AND event_type='brief_review_acknowledged'").get(mission.job_id));
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM agent_approvals WHERE job_id=?").get(mission.job_id).count, 0);

    const engineer = makeMission("engineering-lead");
    assert.equal((await onRequestPost(call(env, "POST", engineer))).status, 201);
    const engineerRow = database.prepare("SELECT updated_at FROM agent_jobs WHERE job_id=?").get(engineer.job_id);
    const engineerAttempt = await onRequestPatch(call(env, "PATCH", { action: "dispatch", job_id: engineer.job_id, expected_updated_at: engineerRow.updated_at }));
    assert.equal(engineerAttempt.status, 409);
    assert.equal(database.prepare("SELECT status FROM agent_jobs WHERE job_id=?").get(engineer.job_id).status, "planned");
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("failed AI inference is recorded without marking a mission verified", async () => {
  const { database, adapter } = createDb();
  database.exec(await source("../migrations/0010_agentic_os_foundation.sql"));
  database.exec(await source("../migrations/0012_headquarters_execution.sql"));
  database.exec(await source("../migrations/0013_headquarters_brief_review.sql"));
  const mission = makeMission("innovation-scout");
  database.prepare(
    "INSERT INTO agent_jobs (job_id,agent_id,job_type,title,request_summary,status,priority,created_by) VALUES (?,?, 'owner_mission',?,?, 'queued',?,?)"
  ).run(mission.job_id, mission.agent_id, mission.title, mission.request_summary, mission.priority, "owner@example.com");
  const workflow = new MissionWorkflow();
  workflow.env = {
    DB: adapter,
    AI: { run: async () => { throw new Error("Model unavailable"); } }
  };
  try {
    await assert.rejects(workflow.run({ payload: { kind: "mission_brief", job_id: mission.job_id } }, step), /Model unavailable/);
    const record = database.prepare("SELECT status,result_json FROM agent_jobs WHERE job_id=?").get(mission.job_id);
    assert.equal(record.status, "failed");
    assert.equal(JSON.parse(record.result_json).verified, false);
  } finally { database.close(); }
});

test("mission Worker refuses unqueued or unregistered direct dispatches", async () => {
  const { database, adapter } = createDb();
  database.exec(await source("../migrations/0010_agentic_os_foundation.sql"));
  database.exec(await source("../migrations/0012_headquarters_execution.sql"));
  database.exec(await source("../migrations/0013_headquarters_brief_review.sql"));
  const calls = { count: 0 };
  const env = {
    DB: adapter,
    AI: { run: async () => ({ response: JSON.stringify(brief()) }) },
    MISSION_WORKFLOW: { async create() { calls.count++; return { id: "not-allowed" }; } }
  };
  const request = (url, options) => missionWorker.fetch(new Request(url, options), env);
  try {
    const health = await request("https://hq-engine.internal/health");
    assert.equal((await health.json()).ready, true);
    const unqueued = await request("https://hq-engine.internal/missions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "mission_brief", job_id: crypto.randomUUID() }) });
    assert.equal(unqueued.status, 409);
    const malformed = await request("https://hq-engine.internal/missions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "mission_brief", job_id: "invalid" }) });
    assert.equal(malformed.status, 400);
    assert.equal(calls.count, 0);
  } finally { database.close(); }
});

test("resume a mission claimed by an earlier durable step attempt", async () => {
  const { database, adapter } = createDb();
  database.exec(await source("../migrations/0010_agentic_os_foundation.sql"));
  database.exec(await source("../migrations/0012_headquarters_execution.sql"));
  database.exec(await source("../migrations/0013_headquarters_brief_review.sql"));
  const mission = makeMission("innovation-scout");
  database.prepare(
    "INSERT INTO agent_jobs (job_id,agent_id,job_type,title,request_summary,status,priority,created_by,started_at) VALUES (?,?,'owner_mission',?,?,'running',?,?,'2026-11-12T01:00:00.000Z')"
  ).run(mission.job_id, mission.agent_id, mission.title, mission.request_summary, mission.priority, "owner@example.com");
  const workflow = new MissionWorkflow();
  workflow.env = { DB: adapter, AI: { run: async () => ({ response: JSON.stringify(brief()) }) } };
  try {
    const receipt = await workflow.run({ payload: { kind: "mission_brief", job_id: mission.job_id } }, step);
    assert.equal(receipt.status, "awaiting_owner_approval");
    const result = database.prepare("SELECT status,result_json FROM agent_jobs WHERE job_id=?").get(mission.job_id);
    assert.equal(result.status, "awaiting_owner_approval");
    assert.equal(JSON.parse(result.result_json).verified, false);
  } finally {
    database.close();
  }
});

test("owner can discard an AI planning brief without authorizing release", async () => {
  const { database, adapter } = createDb();
  database.exec(await source("../migrations/0010_agentic_os_foundation.sql"));
  database.exec(await source("../migrations/0011_headquarters_audit.sql"));
  database.exec(await source("../migrations/0012_headquarters_execution.sql"));
  database.exec(await source("../migrations/0013_headquarters_brief_review.sql"));
  const mission = makeMission();
  database.prepare(
    "INSERT INTO agent_jobs(job_id,agent_id,job_type,title,request_summary,status,priority,created_by,result_json) VALUES (?,?, 'owner_mission',?,?, 'awaiting_owner_approval',?, ?,?)"
  ).run(mission.job_id, mission.agent_id, mission.title, mission.request_summary, mission.priority, "owner@example.com", JSON.stringify({ kind: "recommendation_brief", verified: false, summary: "Test" }));
  const env = {
    DB: adapter,
    CF_ACCESS_TEAM_DOMAIN: "hq-test.cloudflareaccess.com",
    CF_ACCESS_AUD: "hq-test",
    ADMIN_ALLOWED_EMAILS: "owner@example.com"
  };
  globalThis.fetch = async () => Response.json({ keys: [jwk] });
  try {
    const row = database.prepare("SELECT updated_at FROM agent_jobs WHERE job_id=?").get(mission.job_id);
    const action = { job_id: mission.job_id, expected_updated_at: row.updated_at, action: "discard_brief" };
    const response = await onRequestPatch(call(env, "PATCH", action));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).verified, false);
    const state = database.prepare("SELECT status FROM agent_jobs WHERE job_id=?").get(mission.job_id);
    assert.equal(state.status, "cancelled");
    assert.equal((await onRequestPatch(call(env, "PATCH", action))).status, 409);
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM agent_approvals").get().n, 0);
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("owner AI mission dispatches stop at six per UTC day, including failed/completed jobs", async () => {
  const { database, adapter } = createDb();
  database.exec(await source("../migrations/0010_agentic_os_foundation.sql"));
  database.exec(await source("../migrations/0011_headquarters_audit.sql"));
  database.exec(await source("../migrations/0012_headquarters_execution.sql"));
  database.exec(await source("../migrations/0013_headquarters_brief_review.sql"));
  const env = {
    DB: adapter,
    HQ_ENGINE_SERVICE: {
      async fetch(request) {
        if (new URL(request.url).pathname === "/health") {
          return Response.json({ ready: true, mode: "bounded_recommendation" });
        }
        return Response.json({ workflow_id: "mission-test", status: "queued" }, { status: 202 });
      }
    },
    CF_ACCESS_TEAM_DOMAIN: "hq-test.cloudflareaccess.com",
    CF_ACCESS_AUD: "hq-test",
    ADMIN_ALLOWED_EMAILS: "owner@example.com"
  };
  globalThis.fetch = async () => Response.json({ keys: [jwk] });
  try {
    for (let i = 0; i < 6; i += 1) {
      const mission = makeMission();
      assert.equal((await onRequestPost(call(env, "POST", mission))).status, 201);
      const { updated_at } = database.prepare("SELECT updated_at FROM agent_jobs WHERE job_id=?").get(mission.job_id);
      const started = await onRequestPatch(call(env, "PATCH", {
        job_id: mission.job_id, expected_updated_at: updated_at, action: "dispatch"
      }));
      assert.equal(started.status, 202, "Dispatch " + (i + 1) + " should fit the day budget");
      database.prepare("UPDATE agent_jobs SET status='completed' WHERE job_id=?").run(mission.job_id);
    }
    const additional = makeMission();
    assert.equal((await onRequestPost(call(env, "POST", additional))).status, 201);
    const { updated_at } = database.prepare("SELECT updated_at FROM agent_jobs WHERE job_id=?").get(additional.job_id);
    const refused = await onRequestPatch(call(env, "PATCH", {
      job_id: additional.job_id, expected_updated_at: updated_at, action: "dispatch"
    }));
    assert.equal(refused.status, 429);
    assert.match((await refused.json()).error.message, /Daily AI mission allowance/);
    assert.equal(database.prepare("SELECT status FROM agent_jobs WHERE job_id=?").get(additional.job_id).status, "planned");
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM agent_job_events WHERE event_type='mission_queued'").get().n, 6);
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});
