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
  const fetchImpl = async (url, init) => init.method === "POST"
    ? json({ success: true, result: deployment({
      deployment_trigger: { metadata: { branch: base.branch, commit_hash: "c".repeat(40) } }
    }) })
    : json({ success: true, result: [
      deployment({ deployment_trigger: { metadata: { branch: base.branch, commit_hash: "c".repeat(40) } })
    ] });
  await assert.rejects(createOrReusePreview({ ...base, fetchImpl, delayImpl: async () => {} }),
    /No successful Cloudflare Pages preview matched/);
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
  await assert.rejects(createOrReusePreview({ ...base, fetchImpl, delayImpl: async () => {} }), /No successful Cloudflare Pages preview matched/);
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

test("HTTP 200 with temporarily incorrect metadata recovers only via verified GET result", async () => {
  let calls = 0;
  const fetchImpl = async (url, init) => {
    calls++;
    if (init.method === "POST") return json({ success: true, result: deployment({
      deployment_trigger: { metadata: { branch: "build/old-preview", commit_hash: "c".repeat(40) } }
    }) });
    assert.match(url, /per_page=10/);
    return json({ success: true, result: [deployment()] });
  };
  const result = await createOrReusePreview({ ...base, fetchImpl, delayImpl: async () => {} });
  assert.equal(result.reused, true);
  assert.equal(result.id, "successful-preview");
  assert.equal(calls, 2);
});

test("lookup waits for exact deployment success and never trusts an active preview", async () => {
  let lookupCalls = 0;
  const fetchImpl = async (url, init) => {
    if (init.method === "POST") return notModified();
    lookupCalls++;
    return json({ success: true, result: [
      lookupCalls === 1 ? deployment({ latest_stage: { name: "deploy", status: "active" } }) : deployment()
    ] });
  };
  const result = await createOrReusePreview({ ...base, fetchImpl, delayImpl: async () => {} });
  assert.equal(result.reused, true);
  assert.equal(lookupCalls, 2);
});

test("lookup scans a bounded additional page and still validates exact branch and SHA", async () => {
  const fetchImpl = async (url, init) => {
    if (init.method === "POST") return notModified();
    const page = Number(new URL(url).searchParams.get("page"));
    if (page === 1) return json({ success: true, result: Array.from({ length: 10 }, () => deployment({
      deployment_trigger: { metadata: { branch: "build/unrelated", commit_hash: base.commitSha } }
    })) });
    if (page === 2) return json({ success: true, result: [deployment()] });
    throw Error("Unbounded pagination");
  };
  const result = await createOrReusePreview({ ...base, fetchImpl, delayImpl: async () => {} });
  assert.equal(result.id, "successful-preview");
});

test("Cloudflare lookup errors fail closed rather than accepting stale POST metadata", async () => {
  const fetchImpl = async (url, init) => init.method === "POST"
    ? json({ success: true, result: deployment({ environment: "production" }) })
    : Response.json({ success: false, result: null }, { status: 500 });
  await assert.rejects(createOrReusePreview({ ...base, fetchImpl, delayImpl: async () => {} }),
    /preview lookup failed/);
});
