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
const intakeURI = asModule(await source("../functions/_lib/repair-intake.js"));
const routeSource = (await source("../functions/api/admin/repair-jobs.ts"))
  .replace('"../../_lib/admin-auth"', JSON.stringify(authStub))
  .replace('"../../_lib/repair-intake.js"', JSON.stringify(intakeURI));
const { onRequestPost } = await import(asModule(stripTypeScriptTypes(routeSource)));

async function setup(withLinks = true) {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys=ON; " +
    "CREATE TABLE admin_findings(id TEXT PRIMARY KEY,status TEXT);" +
    "CREATE TABLE admin_assets(id TEXT PRIMARY KEY,asset_type TEXT,url TEXT);" +
    "CREATE TABLE admin_asset_findings(id TEXT PRIMARY KEY,asset_id TEXT,status TEXT,category TEXT,finding_key TEXT);");
  database.exec(await source("../migrations/0008_admin_control_center.sql"));
  if (withLinks) database.exec(await source("../migrations/0022_admin_repair_finding_links.sql"));
  database.prepare("INSERT INTO admin_findings(id,status) VALUES(?,?)").run("same-id","open");
  database.prepare("INSERT INTO admin_assets(id,asset_type,url) VALUES(?,?,?)").run("asset-page","website_page","https://yorphives.com/free-tools/");
  database.prepare("INSERT INTO admin_asset_findings(id,asset_id,status,category,finding_key) VALUES(?,?,?,?,?)").run("same-id","asset-page","investigating","seo","missing-title");
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

test("monitor and asset findings remain read-only: no repair jobs or associations can be dispatched",async()=>{
 for(const withLinks of [true,false]){
  const {database,call}=await setup(withLinks);
  try{
   for(const payload of [
    {finding_id:"same-id",finding_source:"asset"},
    {finding_id:"same-id",finding_source:"monitor"},
    {finding_id:"missing",finding_source:"asset"},
    {finding_id:"same-id",finding_source:"unknown"},
    {}
   ]){
    const response=await call(payload);
    assert.equal(response.status,405);
    const body=await response.json();
    assert.equal(body.error.code,"MONITOR_ONLY");
    assert.equal(body.dispatch_performed,false);
    assert.equal(body.production_deployed,false);
   }
   assert.equal(database.prepare("SELECT COUNT(*) AS n FROM admin_repair_jobs").get().n,0);
   if(withLinks)assert.equal(database.prepare("SELECT COUNT(*) AS n FROM admin_repair_finding_links").get().n,0);
   assert.equal(database.prepare("SELECT COUNT(*) AS n FROM admin_audit_events").get().n,0);
  }finally{database.close();}
 }
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
