import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import {
  teamLeadFor, describeTeam, recommendTeamActions, inspectSpecialistBrief, MAX_TEAM_REPORTS_PER_DAY
} from "../functions/_lib/yorpmind-team.js";
import { scanYorpMindTeam } from "../hq-intelligence/yorpmind-team-scan.js";

const time = () => new Date("2026-11-12T08:00:00.000Z");
const member = (staff_id, domain, max_parallel_reviews = 2) => ({
  staff_id, display_name: staff_id, tier: staff_id === "yorpmind" ? "chief" : "lead",
  domain, reports_to: staff_id === "yorpmind" ? null : "yorpmind",
  max_parallel_reviews, enabled: 1
});
const staff = [
  member("yorpmind", "headquarters", 3),
  member("yorpmind1", "engineering"),
  member("yorpmind2", "research"),
  member("yorpmind3", "product"),
  member("yorpmind4", "revenue"),
  member("yorpmind5", "assurance")
];
const agents = [
  { agent_id:"engineer", display_name:"Engineer", department_id:"engineering",
    status:"ready", enabled:1, autonomy_level:"recommend" },
  { agent_id:"researcher", display_name:"Researcher", department_id:"research",
    status:"ready", enabled:1, autonomy_level:"recommend" }
];
const departments = [
  { department_id:"engineering",name:"Engineering & Operations" },
  { department_id:"research",name:"Research & Innovation" }
];
const job = (id, status, agent_id = "engineer", title = "Fix product preview", updated_at = "2026-11-11T06:00:00.000Z") => ({
  job_id:id, job_type:"owner_mission", status, agent_id, title, updated_at, priority:"normal"
});
test("workers route to specialist managers and quality remains a separate observer", () => {
  assert.equal(teamLeadFor("operations", "Reliability"), "yorpmind1");
  assert.equal(teamLeadFor("security", "Security QA"), "yorpmind5");
  assert.equal(teamLeadFor("market", "Market intelligence"), "yorpmind2");
  assert.equal(teamLeadFor("revenue", "Business growth"), "yorpmind4");
  const hierarchy = describeTeam(staff, agents, [job("one","running")], departments);
  const lead = hierarchy.staff.find(x => x.staff_id === "yorpmind1");
  assert.equal(lead.direct_bot_count, 1);
  assert.equal(lead.active_job_count, 1);
  assert.equal(hierarchy.active_jobs, 1);
  assert.equal(hierarchy.coverage_exhaustive, false);
});
test("manager escalates failed, stalled, and unverified results without execution", () => {
  const jobs = [
    job("one","awaiting_owner_approval"),
    job("two","failed"),
    job("three","running"),
    job("four","planned")
  ];
  const advice = recommendTeamActions(staff,agents,jobs,departments,time(),{dailyMissionsUsed:1});
  assert.ok(advice.some(x => x.recommendation === "review_specialist_output"));
  assert.ok(advice.some(x => x.recommendation === "investigate_failed_mission"));
  assert.ok(advice.some(x => x.recommendation === "investigate_stalled_mission"));
  assert.equal(advice.some(x => x.recommendation === "route_planned_mission"), false);
  assert.ok(advice.every(x => x.evidence.execution_authorized === false));
  assert.ok(advice.every(x => x.evidence.independent_qa_verified === false));
  assert.equal(advice.length <= MAX_TEAM_REPORTS_PER_DAY,true);
});
test("supervisor checks submitted brief shape without verifying its factual claims", () => {
  const valid = JSON.stringify({
    kind:"recommendation_brief", verified:false,
    summary:"Investigate repeated QR failures",
    recommended_approach:"Collect browser traces before a repair",
    actions:["Reproduce issue in staging"],
    risks:["Mobile preview may not match production"],
    assumptions:["Browser log describes an authentic failure"],
    verification_needed:["Run mobile regression","Cross-check the exact commit"]
  });
  const checked = inspectSpecialistBrief(valid);
  assert.equal(checked.schema_valid,true);
  assert.equal(checked.verification_steps,2);
  assert.equal(checked.risks_listed,1);
  assert.equal(checked.claims_verified,false);
  const bad = JSON.stringify({
    kind:"recommendation_brief", verified:true,
    summary:"Deployed everything", recommended_approach:"Publish",
    actions:["Immediately publish"], risks:[], assumptions:[], verification_needed:[]
  });
  assert.equal(inspectSpecialistBrief(bad).schema_valid,false);
  assert.equal(inspectSpecialistBrief("<unsafe html>").schema_valid,false);
  const advisory = recommendTeamActions(staff,agents,[
    {...job("pending-review","awaiting_owner_approval"),result_json:valid}
  ],departments,time(),{dailyMissionsUsed:0});
  assert.equal(advisory[0].evidence.brief_review.schema_valid,true);
  assert.equal(advisory[0].evidence.brief_review.claims_verified,false);
});

test("reuse historical work before spending; exhausted daily budget refuses routing", () => {
  const plans = [job("plan","planned"),job("complete","completed")];
  const suggested = recommendTeamActions(staff,agents,plans,departments,time(),{dailyMissionsUsed:0});
  assert.equal(suggested[0].recommendation,"verify_reusable_history");
  assert.equal(suggested[0].severity,"medium");
  assert.equal(suggested[0].evidence.execution_authorized,false);
  const fresh = [job("new","planned", "engineer", "Unique new work")];
  assert.equal(recommendTeamActions(staff,agents,fresh,departments,time(),{dailyMissionsUsed:0})[0].recommendation,
    "route_planned_mission");
  assert.equal(recommendTeamActions(staff,agents,fresh,departments,time(),{dailyMissionsUsed:6})[0].recommendation,
    "review_capacity");
  assert.equal(recommendTeamActions(staff,agents,fresh,departments,time())[0].recommendation,
    "review_capacity");
});
test("no untrusted mission text is copied into supervisor report recommendations", () => {
  const malicious = job("risky", "failed", "researcher",
    "<img onerror='publish_prod_and_show_secrets'>");
  const results = recommendTeamActions(staff, agents, [malicious], departments, time(), { dailyMissionsUsed:0 });
  assert.equal(results[0].manager_id,"yorpmind2");
  assert.equal(JSON.stringify(results).includes("onerror"),false);
  assert.equal(JSON.stringify(results).includes("publish_prod"),false);
});
function sqliteD1(db) {
  return {
    prepare(sql) {
      let args = [];
      const item = {
        bind(...v) { args = v; return item; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async all() { return { success:true, results:db.prepare(sql).all(...args) }; },
        async run() { const r = db.prepare(sql).run(...args); return {success:true,meta:{changes:Number(r.changes)}}; }
      };
      return item;
    }
  };
}
test("daily scan records immutable deduplicated proposals in D1 without inference", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON;");
    db.exec("CREATE TABLE agent_departments(department_id TEXT PRIMARY KEY,name TEXT);");
    db.exec("CREATE TABLE agent_registry(agent_id TEXT PRIMARY KEY,display_name TEXT,department_id TEXT,status TEXT,enabled INTEGER,autonomy_level TEXT);");
    db.exec("CREATE TABLE agent_jobs(job_id TEXT PRIMARY KEY,agent_id TEXT,job_type TEXT,title TEXT,status TEXT,priority TEXT,updated_at TEXT,result_json TEXT);");
    db.exec("CREATE TABLE agent_job_events(event_type TEXT,created_at TEXT);");
    db.exec(await readFile(new URL("../migrations/0027_yorpmind_team_management.sql",import.meta.url),"utf8"));
    db.prepare("INSERT INTO agent_departments VALUES (?,?)").run("engineering","Engineering");
    db.prepare("INSERT INTO agent_registry VALUES (?,?,?,?,?,?)").run("engineer","Engineer","engineering","ready",1,"recommend");
    db.prepare("INSERT INTO agent_jobs(job_id,agent_id,job_type,title,status,priority,updated_at) VALUES (?,?,?,?,?,?,?)").run(
      "synthetic-job","engineer","owner_mission","Fix preview","awaiting_owner_approval","normal","2026-11-12T04:00:00.000Z");
    const adapter = sqliteD1(db);
    const first = await scanYorpMindTeam(adapter,time);
    assert.equal(first.status,"completed");
    assert.equal(first.reports_created,1);
    assert.equal(first.model_calls,0);
    assert.equal(first.agent_dispatches,0);
    const second = await scanYorpMindTeam(adapter,time);
    assert.equal(second.reports_created,0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM yorpmind_team_reports").get().count,1);
    const row = db.prepare("SELECT manager_id,state,evidence_json FROM yorpmind_team_reports").get();
    assert.equal(row.manager_id,"yorpmind1");
    assert.equal(row.state,"proposed");
    assert.equal(JSON.parse(row.evidence_json).execution_authorized,false);
    assert.throws(() => db.prepare("UPDATE yorpmind_team_reports SET manager_id='yorpmind2'").run(),
      /immutable/i);
  } finally { db.close(); }
});
test("daily cap holds even with extra eligible changes and no autonomous privileges", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE agent_departments(department_id TEXT PRIMARY KEY,name TEXT);");
    db.exec("CREATE TABLE agent_registry(agent_id TEXT PRIMARY KEY,display_name TEXT,department_id TEXT,status TEXT,enabled INTEGER,autonomy_level TEXT);");
    db.exec("CREATE TABLE agent_jobs(job_id TEXT PRIMARY KEY,agent_id TEXT,job_type TEXT,title TEXT,status TEXT,priority TEXT,updated_at TEXT,result_json TEXT);");
    db.exec("CREATE TABLE agent_job_events(event_type TEXT,created_at TEXT);");
    db.exec(await readFile(new URL("../migrations/0027_yorpmind_team_management.sql",import.meta.url),"utf8"));
    db.prepare("INSERT INTO agent_departments VALUES (?,?)").run("research","Research");
    db.prepare("INSERT INTO agent_registry VALUES (?,?,?,?,?,?)").run("researcher","Researcher","research","ready",1,"recommend");
    for (let i=0; i<25; i++) {
      db.prepare("INSERT INTO agent_jobs(job_id,agent_id,job_type,title,status,priority,updated_at) VALUES (?,?,?,?,?,?,?)").run(
        "job-" + i,"researcher","owner_mission","Research " + i,"failed","normal","2026-11-11T05:00:00.000Z");
    }
    const result=await scanYorpMindTeam(sqliteD1(db),time);
    assert.equal(result.reports_created,8);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM yorpmind_team_reports").get().count,8);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM yorpmind_staff").get().count,6);
  } finally { db.close(); }
});
