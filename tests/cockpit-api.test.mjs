import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { cockpitSnapshot, MONITOR_FRESHNESS_HOURS } from "../functions/_lib/cockpit.js";

const source = path => readFile(new URL(path, import.meta.url), "utf8");
const moduleUrl = code => "data:text/javascript;base64," +
  Buffer.from(stripTypeScriptTypes(code)).toString("base64");
const authUrl = moduleUrl(await source("../functions/_lib/admin-auth.ts"));
const domainUrl = moduleUrl(await source("../functions/_lib/cockpit.js"));
const routeUrl = moduleUrl((await source("../functions/api/admin/cockpit.ts"))
  .replace('"../../_lib/admin-auth"', JSON.stringify(authUrl))
  .replace('"../../_lib/cockpit.js"', JSON.stringify(domainUrl)));
const { onRequestGet } = await import(routeUrl);
const migrationFiles = (await readdir(new URL("../migrations/",import.meta.url)))
  .filter(name=>name.endsWith(".sql")).sort();
const migrations = await Promise.all(migrationFiles.map(name=>source("../migrations/"+name)));
const now = new Date("2026-11-13T12:00:00.000Z");

function adapter(db, observed = []) {
  return {
    prepare(sql) {
      observed.push(sql);
      assert.match(sql.trim(), /^(SELECT|WITH)\b/i, "Cockpit may only read the database");
      let values = [];
      const statement = {
        bind(...args) { values=args; return statement; },
        async first() { return db.prepare(sql).get(...values)||null; },
        async all() { return {success:true,results:db.prepare(sql).all(...values)}; }
      };
      return statement;
    }
  };
}
function fixture() {
  const db = new DatabaseSync(":memory:");
  for (const sql of migrations) db.exec(sql);
  return db;
}
function mission(db, status, origin = null) {
  const id=crypto.randomUUID();
  db.prepare("INSERT INTO agent_jobs(job_id,agent_id,job_type,title,request_summary,status,created_by,origin_type,updated_at) " +
    "VALUES (?,'engineering-lead','owner_mission',?,'Acceptance criteria are recorded.',?,'founder@example.test',?,?)")
    .run(id,"Mission "+id,status,origin,now.toISOString());
  return id;
}

test("cockpit counts the whole real schema, excludes rehearsals, and limits recent lists", async () => {
  const db=fixture();
  const queries=[];
  try {
    for (let i=0;i<123;i++) mission(db,"planned");
    for (const state of ["failed","failed","awaiting_owner_approval","running","completed","completed","cancelled"])
      mission(db,state);
    mission(db,"failed","staging_rehearsal");
    const data=await cockpitSnapshot(adapter(db,queries),now);
    assert.equal(data.availability,"ready");
    assert.deepEqual(data.metrics.missions,{
      total:130,active:125,planned:123,running:1,review:1,failed:2,completed:2,rehearsals:1
    });
    assert.equal(data.recent_missions.length,6);
    assert.equal(data.recent_activity.length,6);
    assert.equal(data.sources.missions.observed_at,now.toISOString());
    assert.equal(data.metrics.memory.experiences,0);
    assert.equal(data.metrics.memory.approved_skills,0);
    assert.equal(data.finances.revenue,null);
    assert.equal(data.finances.operating_cost,null);
    assert.equal(data.finances.status,"not_connected");
    assert.equal(data.read_only,true);
    assert.ok(data.next_actions.some(action=>action.id==="failed-missions"));
    assert.ok(data.next_actions.every(action=>["headquarters","issues","monitoring","intelligence","yorpmind"].includes(action.view)));
    assert.ok(queries.length<=12,"The overview uses a fixed number of queries, independent of record count");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM agent_jobs").get().n,131);
  } finally {db.close();}
});

test("monitor health uses only latest checks and distinguishes stale, absent, invalid and future evidence",async()=>{
  const db=fixture();
  try {
    db.exec("UPDATE admin_monitors SET enabled=0");
    db.prepare("INSERT INTO admin_runs(id,trigger_source,status,started_at) VALUES('cockpit-run','manual','completed',?)")
      .run(now.toISOString());
    function monitor(id,checks) {
      db.prepare("INSERT INTO admin_monitors(id,name,url,environment,enabled) VALUES(?,?,?,'production',1)")
        .run(id,id,"https://example.test/"+id);
      checks.forEach(([ok,checked_at],i)=>db.prepare("INSERT INTO admin_checks(id,run_id,monitor_id,ok,checked_at) VALUES(?,'cockpit-run',?,?,?)")
        .run(id+"-"+i,id,ok,checked_at));
    }
    monitor("passing",[[0,"2026-11-13T10:00:00.000Z"],[1,"2026-11-13T11:00:00.000Z"]]);
    monitor("failing",[[0,"2026-11-13T11:30:00.000Z"]]);
    monitor("stale",[[1,"2026-11-13T03:00:00.000Z"]]);
    monitor("missing",[]);
    monitor("future",[[1,"2026-11-13T13:00:00.000Z"]]);
    monitor("invalid",[[1,"not-a-timestamp"]]);
    const data=await cockpitSnapshot(adapter(db),now);
    assert.deepEqual(data.metrics.monitors,{
      enabled:6,passing:1,failing:1,stale:1,unknown:3,
      last_checked_at:"2026-11-13T11:30:00.000Z",freshness_window_hours:MONITOR_FRESHNESS_HOURS
    });
    assert.equal(data.sources.monitors.observed_at,"2026-11-13T11:30:00.000Z");
    assert.ok(data.next_actions.some(action=>action.id==="monitor-evidence"));
    assert.ok(data.next_actions.some(action=>action.id==="monitor-failures" && action.urgency==="urgent"));
  }finally{db.close();}
});

test("a missing optional table preserves other sources and never turns unknown counts into zero",async()=>{
  const db=fixture();
  try {
    mission(db,"planned");
    db.exec("DROP TABLE hq_intelligence_ideas");
    const data=await cockpitSnapshot(adapter(db),now);
    assert.equal(data.availability,"partial");
    assert.equal(data.sources.opportunities.available,false);
    assert.equal(data.metrics.opportunities.proposed,null);
    assert.equal(data.metrics.opportunities.shortlisted,null);
    assert.equal(data.sources.missions.available,true);
    assert.equal(data.metrics.missions.planned,1);
    assert.doesNotMatch(data.sources.opportunities.error,/SQL|no such table|hq_intelligence/i);
  }finally{db.close();}
});

test("partial findings expose known counts without presenting an incomplete total",async()=>{
  const db=fixture();
  try {
    const timestamp=now.toISOString();
    db.prepare("INSERT INTO admin_findings(id,fingerprint,severity,title,details,status,first_detected,last_verified) " +
      "VALUES ('critical','critical','critical','Check critical issue','Recorded finding','open',?,?)").run(timestamp,timestamp);
    db.exec("DROP TABLE admin_asset_findings");
    const data=await cockpitSnapshot(adapter(db),now);
    assert.equal(data.sources.issues.available,true);
    assert.equal(data.sources.issues.partial,true);
    assert.equal(data.metrics.issues.active,null);
    assert.equal(data.metrics.issues.critical,null);
    assert.equal(data.metrics.issues.known_active,1);
    assert.equal(data.metrics.issues.known_critical,1);
    assert.match(data.next_actions.find(action=>action.id==="critical-issues").description,/At least 1/);
    assert.equal(data.availability,"partial");
  }finally{db.close();}
});

test("private cockpit requires a real signed allowlisted identity and returns no-store JSON",async()=>{
  const db=fixture();
  const queries=[];
  const originalFetch=globalThis.fetch;
  try {
    const key=await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,
      publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
    const jwk=await crypto.subtle.exportKey("jwk",key.publicKey);jwk.kid="cockpit-test";
    const encode=value=>Buffer.from(JSON.stringify(value)).toString("base64url");
    const head=encode({alg:"RS256",kid:"cockpit-test"});
    const claims=encode({iss:"https://cockpit-test.cloudflareaccess.com",aud:["founder-cockpit"],
      email:"founder@example.test",exp:Math.floor(Date.now()/1000)+300});
    const signature=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key.privateKey,
      new TextEncoder().encode(head+"."+claims));
    const jwt=head+"."+claims+"."+Buffer.from(signature).toString("base64url");
    globalThis.fetch=async url=>{
      assert.equal(url,"https://cockpit-test.cloudflareaccess.com/cdn-cgi/access/certs");
      return Response.json({keys:[jwk]});
    };
    const env={DB:adapter(db,queries),CF_ACCESS_TEAM_DOMAIN:"cockpit-test.cloudflareaccess.com",
      CF_ACCESS_AUD:"founder-cockpit",ADMIN_ALLOWED_EMAILS:"founder@example.test"};
    const context=token=>({env,request:new Request("https://hq.example.test/api/admin/cockpit",{
      headers:token?{"cf-access-jwt-assertion":token}:{}
    })});
    assert.equal((await onRequestGet(context())).status,401);
    assert.equal((await onRequestGet(context("not-a-jwt"))).status,401);
    assert.equal(queries.length,0,"Unauthorized readers must not run cockpit queries");
    const response=await onRequestGet(context(jwt));
    assert.equal(response.status,200);
    assert.equal(response.headers.get("cache-control"),"no-store");
    assert.equal(response.headers.get("x-content-type-options"),"nosniff");
    assert.equal((await response.json()).availability,"ready");
    const brokenEnv={...env,DB:{prepare(){throw new Error("Sensitive database connection details");}}};
    const unavailable=await onRequestGet({...context(jwt),env:brokenEnv});
    assert.equal(unavailable.status,503);
    const body=await unavailable.json();
    assert.equal(body.availability,"unavailable");
    assert.equal(body.metrics.missions.total,null);
    assert.doesNotMatch(JSON.stringify(body),/Sensitive database/);
  }finally{globalThis.fetch=originalFetch;db.close();}
});
