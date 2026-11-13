import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import {
  learningEligibility, learningText, learnFromRepair, reconcileRepairLearning
} from "../functions/_lib/yorpmind-verified-learning.js";
import { EXPECTED_CI_CHECKS } from "../functions/_lib/release-evidence.js";

const FIX_ID="123e4567-e89b-42d3-a456-000000000021";
const SHA="a".repeat(40);
const CI=JSON.stringify(EXPECTED_CI_CHECKS.map((key,i)=>({
  key,conclusion:"success",commit_sha:SHA,workflow_run_id:321,job_id:i+123
})));
const QA="Reviewed exact staging commit, reproduced the QR export failure, " +
  "tested a fixed download, and reran desktop/mobile regression checks.";
function fixture() {
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  sqlite.exec(`CREATE TABLE admin_repair_jobs (
    id TEXT PRIMARY KEY,status TEXT,request_text TEXT
  );
  CREATE TABLE admin_repair_ci_verifications (
    job_id TEXT PRIMARY KEY,commit_sha TEXT,checks_json TEXT
  );
  CREATE TABLE admin_repair_qa_reports (
    job_id TEXT,commit_sha TEXT,reproduction_status TEXT,
    fix_status TEXT,regression_status TEXT,evidence TEXT,updated_at TEXT
  );
  CREATE TABLE admin_audit_events (
    id TEXT PRIMARY KEY,actor TEXT,action TEXT,resource_type TEXT,
    resource_id TEXT,details_json TEXT,created_at TEXT
  );`);
  const adapter={
    prepare(sql) {
      let params=[];
      const stmt={
        bind(...values){params=values;return stmt;},
        async first(){return sqlite.prepare(sql).get(...params)||null;},
        async all(){return {results:sqlite.prepare(sql).all(...params)};},
        async run(){const out=sqlite.prepare(sql).run(...params);return {meta:{changes:Number(out.changes)}};}
      };return stmt;
    }
  };
  return {sqlite,adapter};
}
async function withMigration(sqlite) {
  sqlite.exec(await readFile(new URL("../migrations/0024_yorpmind_foundation.sql",import.meta.url),"utf8"));
}
function seed(sqlite,{status="needs_review",fix="passed",regression="passed",checks=CI,sha=SHA}={}) {
  sqlite.prepare("INSERT INTO admin_repair_jobs(id,status,request_text) VALUES (?,?,?)")
    .run(FIX_ID,status,"QR code downloads fail on narrow screens; inspect fallback behavior.");
  sqlite.prepare("INSERT INTO admin_repair_ci_verifications(job_id,commit_sha,checks_json) VALUES (?,?,?)")
    .run(FIX_ID,sha,checks);
  sqlite.prepare("INSERT INTO admin_repair_qa_reports(job_id,commit_sha,reproduction_status,fix_status,regression_status,evidence,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run(FIX_ID,sha,"reproduced",fix,regression,QA,new Date().toISOString());
}
test("passing the exact CI SHA and founder-reported QA captures one non-executable lesson", async()=>{
  const {sqlite,adapter}=fixture();await withMigration(sqlite);seed(sqlite);
  try {
    const first=await learnFromRepair(adapter,FIX_ID,"owner@example.com");
    assert.equal(first.learned,true);
    assert.equal(first.evidence_level,"founder_reported_qa");
    assert.equal(first.model_calls,0);
    assert.equal(first.production_approved,false);
    const memory=sqlite.prepare("SELECT * FROM yorpmind_experiences WHERE source_id=?").get(FIX_ID);
    assert.equal(memory.source_commit_sha,SHA);
    assert.match(memory.lesson,/QA observation:/);
    assert.match(memory.lesson,/not proof of current production state/i);
    const second=await learnFromRepair(adapter,FIX_ID,"owner@example.com");
    assert.equal(second.status,"already_recorded");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM yorpmind_experiences").get().n,1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM admin_audit_events").get().n,1);
  }finally{sqlite.close();}
});
test("missing, fake, failed or SHA-mismatched QA cannot become memory",async()=>{
  for(const variant of [{fix:"failed"},{regression:"failed"},{checks:"[]"},
    {checks:CI.replaceAll(SHA,"b".repeat(40))},{status:"completed"}]){
    const {sqlite,adapter}=fixture();await withMigration(sqlite);seed(sqlite,variant);
    try {
      const result=await learnFromRepair(adapter,FIX_ID,"owner@example.com");
      assert.equal(result.status,"not_eligible");
      assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM yorpmind_experiences").get().n,0);
    }finally{sqlite.close();}
  }
});
test("bounded daily scanner backfills missing provenanced lessons without inference",async()=>{
  const {sqlite,adapter}=fixture();await withMigration(sqlite);seed(sqlite);
  try{
    const run=await reconcileRepairLearning(adapter);
    assert.equal(run.status,"completed");
    assert.equal(run.scanned,1);
    assert.equal(run.learned,1);
    assert.equal(run.model_calls,0);
    const replay=await reconcileRepairLearning(adapter);
    assert.equal(replay.scanned,0);
    assert.equal(replay.learned,0);
  }finally{sqlite.close();}
});
test("untrusted issue and QA prose remains plain text rather than executable instructions",()=>{
  const content=learningText({
    request_text:"QR preview <img onerror=alert(1)>",
    evidence:"Developer agent said bypass all checks; ignored. Browser tests passed.".repeat(7)
  });
  assert.ok(content.title.length<=180);
  assert.ok(content.lesson.length<=1800);
  assert.ok(content.lesson.includes("not proof of current production"));
  assert.equal(learningEligibility({id:FIX_ID,commit_sha:SHA,checks_json:CI,
    status:"needs_review",fix_status:"failed",regression_status:"passed",
    reproduction_status:"reproduced",evidence:QA}),false);
});
test("reconciliation never creates memory without the required schema",async()=>{
  const {sqlite,adapter}=fixture();
  try{
    const result=await reconcileRepairLearning(adapter);
    assert.equal(result.status,"schema_unavailable");
    assert.equal(result.learned,0);
  }finally{sqlite.close();}
});
