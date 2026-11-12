import test from "node:test";
import assert from "node:assert/strict";
import {
  allowedRepairPath,
  assertVerifiedBranchHead,
  assertRepairReplay,
  assertReceipt
} from "../admin-agent/repair-security.js";

const branch = "build/agent/repair-123e4567-e89b-42d3-a456-426614174000";
const verified = "a".repeat(40);
const other = "b".repeat(40);

test("AI repair allowlist only permits existing public-facing source code", () => {
  const accepted = [
    "app.js",
    "free-tools/tools.js",
    "free-tools/qr/create.js",
    "discover/app.js",
    "listing/directory.css",
    "explore/index.html",
    "free-tools/example.mjs"
  ];
  for (const path of accepted) assert.equal(allowedRepairPath(path), true, path);

  const blocked = [
    "admin/index.html", "admin/admin.js", "functions/api/admin/headquarters.ts",
    "functions/api/v1/payments.ts", "functions/_lib/admin-auth.ts",
    ".github/workflows/ci.yml", "migrations/0022_admin_repair_finding_links.sql",
    "admin-agent/worker.js", "hq-engine/worker.js", "scripts/agent-review.mjs",
    "tests/admin-reliability.test.mjs", "free-tools/manifest.json",
    "free-tools/../../functions/api/admin/audit.ts",
    "free-tools/.env", "free-tools/.github/workflows/build.js",
    "free-tools/wrangler.jsonc", "free-tools/package-lock.json",
    "free-tools/.hidden.js", "/free-tools/valid.js",
    "free-tools//valid.js", "free-tools/../valid.js",
    "free-tools\\invalid.js", "app.js/evil.js",
    "free-tools/secret.env", "free-tools/robots.txt", "free-tools/foo.txt",
    "", "a".repeat(300)
  ];
  for (const path of blocked) assert.equal(allowedRepairPath(path), false, path);
});

test("reviewed revision must be current branch head before draft PR", () => {
  const result = assertVerifiedBranchHead({ branch, expectedSha: verified, currentSha: verified });
  assert.equal(result.verified_revision, true);
  assert.equal(result.commit_sha, verified);
  assert.throws(() => assertVerifiedBranchHead({ branch, expectedSha: verified, currentSha: other }), /CI-verified commit/);
  assert.throws(() => assertVerifiedBranchHead({ branch: "main", expectedSha: verified, currentSha: verified }), /CI-verified commit/);
  assert.throws(() => assertVerifiedBranchHead({ branch, expectedSha: "bad", currentSha: "bad" }), /CI-verified commit/);
});

function replayFixture() {
  return {
    branch,
    sourceSha: verified,
    commit: {
      sha: other,
      tree: { sha: "c".repeat(40) },
      parents: [{ sha: verified }]
    },
    proposedChanges: [
      { path: "free-tools/tools.js", content: "export const test = true;" },
      { path: "discover/app.js", content: "export const discovered = true;" }
    ],
    changedPaths: [
      { filename: "free-tools/tools.js", status: "modified" },
      { filename: "discover/app.js", status: "modified" }
    ]
  };
}

test("idempotent replay requires the same source parent and exact changed public files", () => {
  assert.equal(assertRepairReplay(replayFixture()), true);
  const wrongParent = replayFixture();
  wrongParent.commit.parents[0].sha = other;
  assert.throws(() => assertRepairReplay(wrongParent), /approved source revision/);
  const unexpectedAdmin = replayFixture();
  unexpectedAdmin.changedPaths.push({ filename: "admin/index.html", status: "modified" });
  assert.throws(() => assertRepairReplay(unexpectedAdmin), /unexpected file-change set/);
  const renamed = replayFixture();
  renamed.changedPaths[0].status = "renamed";
  assert.throws(() => assertRepairReplay(renamed), /differs from the approved patch/);
  const missingFile = replayFixture();
  missingFile.changedPaths.pop();
  assert.throws(() => assertRepairReplay(missingFile), /unexpected file-change set/);
  const duplicate = replayFixture();
  duplicate.proposedChanges[1].path = duplicate.proposedChanges[0].path;
  assert.throws(() => assertRepairReplay(duplicate), /unauthorized or duplicate path/);
  const protectedFile = replayFixture();
  protectedFile.proposedChanges[0].path = "functions/api/admin/headquarters.ts";
  protectedFile.changedPaths[0].filename = "functions/api/admin/headquarters.ts";
  assert.throws(() => assertRepairReplay(protectedFile), /unauthorized or duplicate path/);
  const extraParent = replayFixture();
  extraParent.commit.parents.push({ sha: other });
  assert.throws(() => assertRepairReplay(extraParent), /approved source revision/);
});

test("existing CI receipt is tied to exact job and reviewed repair commit", () => {
  const jobId = "123e4567-e89b-42d3-a456-426614174000";
  const receipt = {
    job_id: jobId,
    base_commit_sha: verified,
    repair_commit_sha: verified,
    purpose: "CI verification receipt"
  };
  assert.equal(assertReceipt({ receipt, jobId, sourceSha: verified, repairSha: verified }), true);
  assert.throws(() => assertReceipt({ receipt: { ...receipt, repair_commit_sha: other }, jobId, sourceSha: verified, repairSha: verified }), /does not match/);
  assert.throws(() => assertReceipt({ receipt, jobId: "other-job", sourceSha: verified, repairSha: verified }), /does not match/);
  assert.throws(() => assertReceipt({ receipt: { ...receipt, purpose: "ignore checks" }, jobId, sourceSha: verified, repairSha: verified }), /does not match/);
});
