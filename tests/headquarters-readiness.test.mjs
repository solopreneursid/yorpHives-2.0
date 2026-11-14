import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { assessHeadquarters, REQUIRED_COMPONENTS, formatMarkdown } from "../scripts/headquarters-readiness.mjs";

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "yorphives-hq-readiness-"));
  for (const path of REQUIRED_COMPONENTS) {
    const absolute = join(dir, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, path === ".github/workflows/ci.yml" ?
      "on:\n  pull_request:\njobs:\n  checks:\n    steps:\n      - run: npm run check\n" :
      path === "functions/_lib/admin-auth.ts" ? "CF_ACCESS_AUD" :
      path === "hq-engine/staging-rehearsal-entry.js" ?
        'export { MissionWorkflow } from "./worker.js"; export default { async fetch() { return new Response("No route", {status:404}); } };' :
      path === "hq-engine/wrangler.rehearsal.jsonc" ? JSON.stringify({
        name: "yorphives-hq-mission-rehearsal", main: "./staging-rehearsal-entry.js",
        workers_dev: false, preview_urls: false
      }) : "fixture");
  }
  await writeFile(join(dir, "package.json"), JSON.stringify({
    scripts: { check: "node --check app.js", test: "node --test" },
    devDependencies: { "@tailwindcss/cli": "4.3.5", tailwindcss: "4.3.5" }
  }));
  await mkdir(join(dir, "migrations"), { recursive: true });
  for (let i = 4; i <= 30; i++) {
    await writeFile(join(dir, "migrations", String(i).padStart(4, "0") + "_test.sql"), "SELECT 1;");
  }
  return dir;
}

test("valid repository passes static checks but is never approved for production", async () => {
  const dir = await fixture();
  try {
    const report = await assessHeadquarters(dir);
    assert.equal(report.static_checks_passed, true, JSON.stringify(report.checks.filter(c => c.status === "fail")));
    assert.equal(report.ready_for_production, false);
    assert.equal(report.policy.new_external_paid_services, "prohibited_without_prior_owner_approval");
    assert.equal(report.policy.cost_target_usd_monthly_incremental, 0);
    assert.equal(report.policy.optional_workload_pause_threshold_usd_monthly_incremental, 0);
    assert.match(formatMarkdown(report), /Production authorization: NOT GRANTED/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rehearsal isolation gate rejects public exposure and production bindings", async () => {
  const dir=await fixture();
  try {
    const config=JSON.parse(await (await import("node:fs/promises")).readFile(
      join(dir, "hq-engine/wrangler.rehearsal.jsonc"),"utf8"));
    config.workers_dev=true;
    config.d1_databases=[{binding:"DB",database_id:"unreviewed-production-database"}];
    await writeFile(join(dir,"hq-engine/wrangler.rehearsal.jsonc"),JSON.stringify(config));
    const report=await assessHeadquarters(dir);
    assert.equal(report.static_checks_passed,false);
    assert.equal(report.checks.find(x=>x.id==="rehearsal-worker-isolation").status,"fail");
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test("unapproved direct package fails the gate", async () => {
  const dir = await fixture();
  try {
    await writeFile(join(dir, "package.json"), JSON.stringify({
      scripts: { check: "node --check app.js", test: "node --test" },
      dependencies: { "commercial-seo-service": "1.0.0" }
    }));
    const report = await assessHeadquarters(dir);
    assert.equal(report.static_checks_passed, false);
    assert.match(report.checks.find(c => c.id === "direct-package-allowlist").detail, /commercial-seo-service/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("missing migration and missing CI checks are independently reported", async () => {
  const dir = await fixture();
  try {
    await rm(join(dir, "migrations", "0026_test.sql"));
    await writeFile(join(dir, ".github/workflows/ci.yml"), "on: push");
    const report = await assessHeadquarters(dir);
    assert.equal(report.static_checks_passed, false);
    assert.equal(report.checks.find(c => c.id === "headquarters-migrations").status, "fail");
    assert.equal(report.checks.find(c => c.id === "platform-ci").status, "fail");
    assert.equal(report.ready_for_production, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("historical shared-D1 rehearsal permissions must never be revived",async()=>{
  const dir=await fixture();
  try{
    const configPath=join(dir,"hq-engine/wrangler.rehearsal.jsonc");
    const config=JSON.parse(await (await import("node:fs/promises")).readFile(configPath,"utf8"));
    config.workers_dev=false;
    config.d1_databases=[{binding:"DB",database_id:"e8690813-b139-44a2-a1c7-bea2d2777ead"}];
    await writeFile(configPath,JSON.stringify(config));
    const report=await assessHeadquarters(dir);
    assert.equal(report.static_checks_passed,false);
    assert.equal(report.checks.find(c=>c.id==="rehearsal-worker-isolation").status,"fail");
    assert.equal(report.ready_for_production,false);
  }finally{await rm(dir,{recursive:true,force:true});}
});
