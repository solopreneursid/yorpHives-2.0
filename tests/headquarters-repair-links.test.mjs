import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { stripTypeScriptTypes } from "node:module";

const source = path => readFile(new URL(path, import.meta.url), "utf8");
const asModule = text => "data:text/javascript;base64," + Buffer.from(text).toString("base64");
const authStub = asModule(`
  export const adminJson = (data, status = 200) => Response.json(data, { status });
  export const isAdminResponse = identity => identity instanceof Response;
  export const requireAdmin = async () => ({ email: "owner@example.com" });
`);
const routeSource = (await source("../functions/api/admin/repair-jobs.ts"))
  .replace('"../../_lib/admin-auth"', JSON.stringify(authStub));
const { onRequestPost } = await import(asModule(stripTypeScriptTypes(routeSource)));

async function setup(withLinks = true) {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys=ON; CREATE TABLE admin_findings(id TEXT PRIMARY KEY);" +
    "CREATE TABLE admin_asset_findings(id TEXT PRIMARY KEY);");
  database.exec(await source("../migrations/0008_admin_control_center.sql"));
  if (withLinks) database.exec(await source("../migrations/0022_admin_repair_finding_links.sql"));
  database.prepare("INSERT INTO admin_findings(id) VALUES(?)").run("same-id");
  database.prepare("INSERT INTO admin_asset_findings(id) VALUES(?)").run("same-id");
  const prepare = sql => {
    let bound = [];
    const statement = {
      bind(...values) { bound = values; return statement; },
      async first() { return database.prepare(sql).get(...bound) || null; },
      async all() { return { success: true, results: database.prepare(sql).all(...bound) }; },
      async run() {
        const record = database.prepare(sql).run(...bound);
        return { success: true, meta: { changes: Number(record.changes) } };
      }
    };
    return statement;
  };
  const adapter = {
    prepare,
    async batch(statements) {
      const result = [];
      database.exec("BEGIN");
      try {
        for (const stmt of statements) result.push(await stmt.run());
        database.exec("COMMIT");
        return result;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    }
  };
  const env = {
    DB: adapter,
    ADMIN_AGENT_SERVICE: { async fetch(request) {
      assert.equal(new URL(request.url).pathname, "/instances");
      const payload = await request.json();
      assert.equal(payload.repository, "solopreneursid/yorpHives-2.0");
      return Response.json({ id: "isolated-workflow-fixture" }, { status: 202 });
    } }
  };
  const call = body => onRequestPost({
    env,
    request: new Request("https://headquarters.yorphives.com/api/admin/repair-jobs", {
      method: "POST", headers: { origin: "https://headquarters.yorphives.com", "content-type": "application/json" },
      body: JSON.stringify({ request_text: "Reproduce this test fixture and propose a scoped fix.", ...body })
    })
  });
  return { database, call, adapter };
}

test("asset finding uses an atomic source-specific link, not the monitor-only legacy FK", async () => {
  const { database, call } = await setup();
  try {
    const res = await call({ finding_id: "same-id", finding_source: "asset" });
    assert.equal(res.status, 202);
    const row = database.prepare("SELECT id, finding_id, status FROM admin_repair_jobs").get();
    assert.equal(row.finding_id, null);
    assert.equal(row.status, "dispatched");
    const link = database.prepare("SELECT finding_source,finding_id FROM admin_repair_finding_links WHERE job_id=?").get(row.id);
    assert.deepEqual(link, { finding_source: "asset", finding_id: "same-id" });
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM admin_audit_events").get().count, 2);
  } finally { database.close(); }
});

test("monitor findings retain legacy FK and source-qualified association", async () => {
  const { database, call } = await setup();
  try {
    const res = await call({ finding_id: "same-id", finding_source: "monitor" });
    assert.equal(res.status, 202);
    const row = database.prepare("SELECT id,finding_id FROM admin_repair_jobs").get();
    assert.equal(row.finding_id, "same-id");
    const link = database.prepare("SELECT finding_source,finding_id FROM admin_repair_finding_links WHERE job_id=?").get(row.id);
    assert.equal(link.finding_source, "monitor");
  } finally { database.close(); }
});

test("invalid finding source and nonexisting finding never dispatch", async () => {
  const { database, call } = await setup();
  try {
    assert.equal((await call({ finding_id: "same-id", finding_source: "unknown" })).status, 400);
    assert.equal((await call({ finding_id: "unknown", finding_source: "asset" })).status, 404);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM admin_repair_jobs").get().count, 0);
  } finally { database.close(); }
});

test("older staging without migration remains compatible for monitors but fails closed for assets", async () => {
  const { database, call } = await setup(false);
  try {
    const asset = await call({ finding_id: "same-id", finding_source: "asset" });
    assert.equal(asset.status, 503);
    assert.equal((await asset.json()).error.code, "REPAIR_LINK_MIGRATION_REQUIRED");
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM admin_repair_jobs").get().count, 0);
    assert.equal((await call({ finding_id: "same-id" })).status, 202);
  } finally { database.close(); }
});

test("database trigger rejects invalid linked identities without orphaning repair records", async () => {
  const { database, adapter } = await setup();
  try {
    await assert.rejects(adapter.batch([
      adapter.prepare("INSERT INTO admin_repair_jobs(id,finding_id,requested_by,request_text,status,created_at,updated_at) VALUES ('tx-test',NULL,'owner','repair','queued','now','now')"),
      adapter.prepare("INSERT INTO admin_repair_finding_links(job_id,finding_source,finding_id) VALUES('tx-test','asset','missing')")
    ]), /Referenced asset finding does not exist/);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM admin_repair_jobs").get().count, 0);
  } finally { database.close(); }
});
