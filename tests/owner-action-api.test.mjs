import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { DatabaseSync } from "node:sqlite";

const source = path => readFile(new URL(path, import.meta.url), "utf8");
const url = text => "data:text/javascript;base64," +
  Buffer.from(stripTypeScriptTypes(text)).toString("base64");
const auth = url(
  "export const adminJson = (value, status=200) => Response.json(value,{status,headers:{'cache-control':'no-store'}});" +
  "export const isAdminResponse = value => value instanceof Response;" +
  "export const requireAdmin = async context => context.request.headers.get('x-test-deny')==='yes' " +
  "? new Response('Access required',{status:401}) : {email:'founder@example.test'};"
);
const advice = url(await source("../functions/_lib/owner-action-center.js"));
const route = url((await source("../functions/api/admin/action-center.ts"))
  .replace('"../../_lib/admin-auth"', JSON.stringify(auth))
  .replace('"../../_lib/owner-action-center.js"', JSON.stringify(advice)));
const { onRequestGet } = await import(route);

function adapter(db) {
  return {
    prepare(sql) {
      let values = [];
      const stmt = {
        bind(...args) { values = args; return stmt; },
        async first() { return db.prepare(sql).get(...values) || null; },
        async all() { return { success:true, results: db.prepare(sql).all(...values) }; }
      };
      return stmt;
    }
  };
}
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE agent_jobs(job_id TEXT PRIMARY KEY,job_type TEXT,status TEXT,result_json TEXT,updated_at TEXT);");
  db.exec("CREATE TABLE admin_repair_jobs(id TEXT PRIMARY KEY,status TEXT);");
  db.exec("CREATE TABLE admin_runs(started_at TEXT);");
  db.exec("CREATE TABLE yorpmind_staff(staff_id TEXT PRIMARY KEY);");
  db.exec("CREATE TABLE yorpmind_team_reports(state TEXT);");
  db.exec("CREATE TABLE yorpmind_owner_delegations(state TEXT,request_expires_at TEXT);");
  db.prepare("INSERT INTO agent_jobs VALUES(?,?,?,?,?)").run(
    "123e4567-e89b-42d3-a456-000000000001", "owner_mission", "failed",
    JSON.stringify({ error: "AI response did not contain valid JSON.", verified:false }),
    "2026-11-12T10:00:00Z");
  db.prepare("INSERT INTO admin_runs VALUES(?)").run(new Date().toISOString());
  return db;
}
function request(db, extras = {}) {
  return {
    env: { DB: adapter(db) },
    request: new Request("https://headquarters.example/api/admin/action-center", {
      headers: { accept: extras.accept || "application/json",
        ...(extras.denied ? { "x-test-deny": "yes" } : {}) }
    })
  };
}
test("private action API surfaces a classified staging failure without changing jobs", async () => {
  const db=fixture();
  try {
    const res=await onRequestGet(request(db));
    assert.equal(res.status,200);
    const body=await res.json();
    assert.equal(body.scope,"private_d1_evidence_only");
    assert.equal(body.actions[0].target,"failed");
    assert.match(body.actions[0].why,/BRIEF_JSON_INVALID/);
    assert.ok(body.actions.every(a=>a.execution_authorized===false));
    assert.equal(body.release_execution_enabled,false);
    assert.equal(db.prepare("SELECT status FROM agent_jobs").get().status,"failed");
    assert.equal(res.headers.get("cache-control"),"no-store");
  } finally { db.close(); }
});
test("machine-readable Markdown uses the same non-executable advice",async()=>{
  const db=fixture();
  try{
    const result=await onRequestGet(request(db,{accept:"text/markdown"}));
    assert.equal(result.status,200);
    assert.match(result.headers.get("content-type"),/text\/markdown/);
    const body=await result.text();
    assert.match(body,/Production execution: DISABLED/);
    assert.match(body,/BRIEF\\_JSON\\_INVALID|BRIEF_JSON_INVALID/);
  }finally{db.close();}
});
test("unauthenticated action reads fail closed",async()=>{
  const db=fixture();
  try{
    assert.equal((await onRequestGet(request(db,{denied:true}))).status,401);
    db.exec("DROP TABLE admin_repair_jobs");
    assert.equal((await onRequestGet(request(db))).status,503);
  }finally{db.close();}
});
