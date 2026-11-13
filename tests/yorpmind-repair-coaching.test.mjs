import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { suggestRepairCoaching } from "../functions/_lib/yorpmind-repair-coaching.js";
import { scanYorpMindTeam } from "../hq-intelligence/yorpmind-team-scan.js";

const engineer="0a97b125-b051-4a6a-a4ec-4161c9a1b641";
const specialist="86115145-1298-45b3-9296-3541df84471c";
const day="2026-11-13";
const staff=[{staff_id:"yorpmind1",enabled:1},{staff_id:"yorpmind5",enabled:1}];
const repairs=[
  {source_job_id:engineer,status:"failed",
    failure_summary:"Workers AI returned no text response.",
    finding_source:"asset",finding_key:"missing-canonical",
    asset_url:"https://yorphives.com/openapi.yaml"},
  {source_job_id:specialist,status:"failed",
    failure_summary:"MODEL_OUTPUT_EMPTY: The AI model returned no usable text.",
    finding_source:"asset",finding_key:"missing-canonical",
    asset_url:"https://yorphives.com/free-tools/manifest.json"}
];

function d1(db) {
  return {prepare(sql) {
    let args=[];
    const chain={
      bind(...values){args=values;return chain;},
      async first(){return db.prepare(sql).get(...args)||null;},
      async all(){return{results:db.prepare(sql).all(...args)};},
      async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}
    };
    return chain;
  }};
}

test("observed repair failures teach Engineering and QA what to check, not what to approve",()=>{
  const cases=suggestRepairCoaching(repairs,staff,day);
  assert.equal(cases.length,4);
  assert.deepEqual(new Set(cases.map(c=>c.manager_id)),
    new Set(["yorpmind1","yorpmind5"]));
  assert.deepEqual(new Set(cases.map(c=>c.subject_agent_id)),
    new Set(["engineering-lead","quality-engineer"]));
  assert.ok(cases.every(c=>c.recommendation==="investigate_failed_mission"));
  assert.ok(cases.every(c=>c.evidence.tested_fix===false &&
    c.evidence.approved_skill===false));
  assert.ok(cases.some(c=>c.evidence.expected_format==="yaml"));
  assert.ok(cases.some(c=>c.evidence.expected_format==="json"));
  assert.ok(cases.every(c=>c.report_key.length<=150 &&
    c.summary.length>=20 && c.summary.length<=400 &&
    JSON.stringify(c.evidence).length<=1200));
  assert.equal(suggestRepairCoaching(repairs,[{staff_id:"yorpmind5",enabled:0}],day).length,0);
  assert.equal(suggestRepairCoaching([{...repairs[0],status:"needs_review"}],staff,day).length,0);
  assert.equal(suggestRepairCoaching(repairs,staff,"invalid-date").length,0);
});

test("daily YorpMind team scan saves real failed repair coaching proposals idempotently without AI",async()=>{
  const db=new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON;");
    db.exec("CREATE TABLE agent_departments(department_id TEXT PRIMARY KEY,name TEXT);");
    db.exec("CREATE TABLE agent_registry(agent_id TEXT PRIMARY KEY,display_name TEXT,department_id TEXT,status TEXT,enabled INTEGER,autonomy_level TEXT);");
    db.exec("CREATE TABLE agent_jobs(job_id TEXT PRIMARY KEY,agent_id TEXT,job_type TEXT,title TEXT,status TEXT,priority TEXT,updated_at TEXT,result_json TEXT,origin_type TEXT);");
    db.exec("CREATE TABLE agent_job_events(event_type TEXT,created_at TEXT);");
    db.exec("CREATE TABLE admin_assets(id TEXT PRIMARY KEY,url TEXT);");
    db.exec("CREATE TABLE admin_asset_findings(id TEXT PRIMARY KEY,asset_id TEXT,finding_key TEXT);");
    db.exec("CREATE TABLE admin_repair_jobs(id TEXT PRIMARY KEY,status TEXT,result_summary TEXT,updated_at TEXT);");
    db.exec("CREATE TABLE admin_repair_finding_links(job_id TEXT PRIMARY KEY,finding_source TEXT,finding_id TEXT);");
    db.exec(await readFile(new URL("../migrations/0027_yorpmind_team_management.sql",import.meta.url),"utf8"));
    for(const [n,path] of [["a","/openapi.yaml"],["b","/free-tools/manifest.json"]]) {
      db.prepare("INSERT INTO admin_assets(id,url) VALUES(?,?)").run(n,"https://yorphives.com"+path);
    }
    const rows=[[engineer,"a"],[specialist,"b"]];
    for(const [id,assetId] of rows){
      db.prepare("INSERT INTO admin_asset_findings(id,asset_id,finding_key) VALUES(?,?,?)")
        .run(id+"-finding",assetId,"missing-canonical");
      db.prepare("INSERT INTO admin_repair_jobs(id,status,result_summary,updated_at) VALUES(?,'failed',?,?)")
        .run(id,"Workers AI returned no text response.","2026-11-13T04:59:00.000Z");
      db.prepare("INSERT INTO admin_repair_finding_links(job_id,finding_source,finding_id) VALUES(?,'asset',?)")
        .run(id,id+"-finding");
    }
    const clock=()=>new Date("2026-11-13T09:20:00.000Z");
    const result=await scanYorpMindTeam(d1(db),clock);
    assert.equal(result.status,"completed");
    assert.equal(result.coaching_reports_created,4);
    assert.equal(result.engineering_qa_work_orders_created,4);
    assert.equal(result.work_orders_are_proposals_only,true);
    assert.equal(result.failed_repairs_scanned,2);
    assert.equal(result.model_calls,0);
    assert.equal(result.agent_dispatches,0);
    assert.equal(result.production_changes,0);
    const saved=db.prepare("SELECT manager_id,state,evidence_json FROM yorpmind_team_reports ORDER BY manager_id").all();
    assert.equal(saved.length,8);
    assert.ok(saved.every(x=>x.state==="proposed"));
    assert.ok(saved.every(x=>{
      const e=JSON.parse(x.evidence_json);
      return e.approved_skill===false || e.learning_approved===false;
    }));
    const repeated=await scanYorpMindTeam(d1(db),clock);
    assert.equal(repeated.coaching_reports_created,0);
    assert.equal(repeated.engineering_qa_work_orders_created,0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM yorpmind_team_reports").get().n,8);
  }finally{db.close();}
});
