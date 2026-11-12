import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join, dirname, fileURLToPath } from "node:path";
import { parseNameStatus, reviewClass, reportMarkdown } from "../scripts/headquarters-lineage-audit.mjs";

const exec = promisify(execFile);
const command = async (cwd, program, ...args) => exec(program, args, { cwd });
const script = fileURLToPath(new URL("../scripts/headquarters-lineage-audit.mjs", import.meta.url));

test("Git NUL-delimited status parser handles modified, added and renamed paths", () => {
  const parsed = parseNameStatus("M\0functions/api/admin/repair-jobs.ts\0A\0docs/review.md\0R100\0old.js\0admin/new.js\0");
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].review_class, "privileged_backend");
  assert.equal(parsed[2].previous_path, "old.js");
  assert.equal(parsed[2].review_class, "admin_operations");
  assert.equal(reviewClass("migrations/0022_test.sql"), "data_migration");
});

test("lineage report inventories full branch changes without authorizing production", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hq-lineage-"));
  try {
    await command(dir, "git", "init", "-b", "main");
    await command(dir, "git", "config", "user.email", "test@example.com");
    await command(dir, "git", "config", "user.name", "Release Audit Test");
    await writeFile(join(dir, "README.md"), "baseline\n");
    await command(dir, "git", "add", ".");
    await command(dir, "git", "commit", "-m", "baseline");
    await command(dir, "git", "switch", "-c", "build/fixture");
    const file = join(dir, "migrations/0022_test.sql");
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, "SELECT 1;\n");
    await command(dir, "git", "add", ".");
    await command(dir, "git", "commit", "-m", "add migration");
    await command(dir, process.execPath, script);
    const report = JSON.parse(await readFile(join(dir, "artifacts/headquarters-readiness/full-lineage.json"), "utf8"));
    const summary = await readFile(join(dir, "artifacts/headquarters-readiness/full-lineage.md"), "utf8");
    assert.equal(report.commits_ahead, 1);
    assert.equal(report.commits_behind, 0);
    assert.equal(report.changed_files[0].path, "migrations/0022_test.sql");
    assert.equal(report.by_class.data_migration, 1);
    assert.equal(report.owner_security_review_required, true);
    assert.equal(report.production_approved, false);
    assert.match(summary, /Production approval: NOT GRANTED/);
    assert.match(reportMarkdown(report), /data_migration/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("missing base ref fails closed instead of inventing a clean comparison", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hq-lineage-no-base-"));
  try {
    await command(dir, "git", "init", "-b", "feature");
    await command(dir, "git", "config", "user.email", "test@example.com");
    await command(dir, "git", "config", "user.name", "Release Audit Test");
    await writeFile(join(dir, "README.md"), "only branch\n");
    await command(dir, "git", "add", ".");
    await command(dir, "git", "commit", "-m", "feature only");
    await assert.rejects(command(dir, process.execPath, script), /Full-lineage review failed closed/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
