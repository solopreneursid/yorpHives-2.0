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
      path === "functions/_lib/admin-auth.ts" ? "CF_ACCESS_AUD" : "fixture");
  }
  await writeFile(join(dir, "package.json"), JSON.stringify({
    scripts: { check: "node --check app.js", test: "node --test" },
    devDependencies: { "@tailwindcss/cli": "4.3.5", tailwindcss: "4.3.5" }
  }));
  await mkdir(join(dir, "migrations"), { recursive: true });
  for (let i = 4; i <= 25; i++) {
    await writeFile(join(dir, "migrations", String(i).padStart(4, "0") + "_test.sql"), "SELECT 1;");
  }
  return dir;
}

test("valid repository passes static checks but is never approved for production", async () => {
  const dir = await fixture();
  try {
    const report = await assessHeadquarters(dir);
    assert.equal(report.static_checks_passed, true);
    assert.equal(report.ready_for_production, false);
    assert.equal(report.policy.new_external_paid_services, "prohibited_without_prior_owner_approval");
    assert.match(formatMarkdown(report), /Production authorization: NOT GRANTED/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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
    await rm(join(dir, "migrations", "0025_test.sql"));
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
