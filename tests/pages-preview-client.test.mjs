import test from "node:test";
import assert from "node:assert/strict";
import { createOrReusePreview, validatePreviewDeployment } from "../scripts/pages-preview-client.mjs";

const base = {
  accountId: "a".repeat(32),
  apiToken: "test-token",
  project: "yorphives-2-preview",
  branch: "build/headquarters-preview-cost-guardrails",
  commitSha: "b".repeat(40),
  commitMessage: "Test preview"
};
const deployment = (changes = {}) => ({
  id: "successful-preview",
  environment: "preview",
  url: "https://abc12345.yorphives-2-preview.pages.dev",
  deployment_trigger: { metadata: { branch: base.branch, commit_hash: base.commitSha } },
  latest_stage: { name: "deploy", status: "success" },
  ...changes
});
const json = (value, status = 200) => Response.json(value, { status });
const notModified = () => new Response(null, { status: 304 });

test("successful preview creation rejects mismatched commit even on HTTP 200", async () => {
  const fetchImpl = async () => json({ success: true, result: deployment({
    deployment_trigger: { metadata: { branch: base.branch, commit_hash: "c".repeat(40) } }
  }) });
  await assert.rejects(createOrReusePreview({ ...base, fetchImpl }), /exact isolated preview/);
});

test("duplicate 304 reuses only an exact successful preview from Cloudflare", async () => {
  let calls = 0;
  const fetchImpl = async (url, init) => {
    calls++;
    if (init.method === "POST") return notModified();
    assert.match(url, /env=preview/);
    assert.equal(init.method, "GET");
    return json({ success: true, result: [
      deployment({ id: "unrelated", deployment_trigger: { metadata: { branch: base.branch, commit_hash: "c".repeat(40) } } }),
      deployment()
    ] });
  };
  const result = await createOrReusePreview({ ...base, fetchImpl });
  assert.equal(result.reused, true);
  assert.equal(result.id, "successful-preview");
  assert.equal(result.url, "https://abc12345.yorphives-2-preview.pages.dev");
  assert.equal(calls, 2);
});

test("304 fails closed when only another branch or an unfinished preview exists", async () => {
  const fetchImpl = async (url, init) => init.method === "POST" ? notModified() :
    json({ success: true, result: [
      deployment({ deployment_trigger: { metadata: { branch: "main", commit_hash: base.commitSha } } }),
      deployment({ latest_stage: { name: "deploy", status: "active" } })
    ] });
  await assert.rejects(createOrReusePreview({ ...base, fetchImpl }), /refusing to reuse/);
});

test("rejects production branches, unknown projects, invalid URLs and nonpreview responses", async () => {
  const invalid = [deployment({ environment: "production" }),
    deployment({ url: "https://abc12345.yorphives-2-preview.pages.dev.attacker.example" }),
    deployment({ url: "http://abc12345.yorphives-2-preview.pages.dev" })];
  for (const candidate of invalid) {
    assert.equal(validatePreviewDeployment(candidate, base), null);
  }
  await assert.rejects(createOrReusePreview({ ...base, branch: "main", fetchImpl: async () => { throw Error("unexpected HTTP request"); } }), /feature branches/);
  await assert.rejects(createOrReusePreview({ ...base, project: "public-production", fetchImpl: async () => { throw Error("unexpected HTTP request"); } }), /Unapproved Pages project/);
});

test("valid fresh preview returns exact deployment and no reuse flag", async () => {
  const result = await createOrReusePreview({ ...base, fetchImpl: async (url, init) => {
    assert.equal(init.method, "POST");
    return json({ success: true, result: deployment() });
  } });
  assert.equal(result.reused, false);
  assert.equal(result.output, "SITE_BASE_URL");
});
