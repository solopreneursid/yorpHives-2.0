import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../admin-agent/worker.js", import.meta.url), "utf8");
const stub = "class WorkflowEntrypoint {}";
const moduleSource = source.replace(
  'import { WorkflowEntrypoint } from "cloudflare:workers";', stub
);
assert.notEqual(moduleSource, source, "Worker import must be safely stubbed");
const mod = await import("data:text/javascript;base64," + Buffer.from(moduleSource).toString("base64"));

test("retired workflow never executes and no GitHub token is referenced", async () => {
  assert.doesNotMatch(source, /GITHUB_TOKEN|authorization:|env\.AI\.run|ADMIN_REPAIR_WORKFLOW\.create/);
  assert.doesNotMatch(source, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
  const job = new mod.AdminRepairWorkflow();
  await assert.rejects(job.run({payload:{request_text:"Modify site"}}), /MONITOR_ONLY/);
});

test("all mutation requests fail before touching network, bindings or database", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw Error("must not call network"); };
  try {
    for (const method of ["POST","PUT","PATCH","DELETE"]) {
      const r = await mod.default.fetch(new Request("https://admin-agent.internal/instances",{method}),{});
      assert.equal(r.status,405,method);
      const body=await r.json();
      assert.equal(body.error,"MONITOR_ONLY");
      assert.equal(body.dispatch_performed,false);
      assert.equal(body.production_deployed,false);
    }
    assert.equal(calls,0);
  } finally { globalThis.fetch = originalFetch; }
});

test("retired health reports fail closed without requesting credentials", async () => {
  const response=await mod.default.fetch(new Request("https://admin-agent.internal/health"),{});
  assert.equal(response.status,503);
  const data=await response.json();
  assert.equal(data.ready,false);
  assert.equal(data.mode,"monitor_only");
  assert.equal(data.workflow_dispatch_enabled,false);
  assert.equal(data.deployment_enabled,false);
  assert.equal(data.github.public_repository_read_without_token,true);
});

test("only internally identified GET requests can list public issues without a token", async () => {
  const originalFetch=globalThis.fetch;
  const requests=[];
  globalThis.fetch=async (url,options)=>{
    requests.push({url:String(url),options});
    return Response.json([
      {number:7,title:"Example issue",body:"Read only",updated_at:"2026-11-14",state:"open",labels:[{name:"bug"}]},
      {number:8,title:"PR",pull_request:{url:"example"},state:"open"}
    ]);
  };
  try {
    const rejected=await mod.default.fetch(new Request("https://admin-agent.internal/issue-inbox"),{});
    assert.equal(rejected.status,403);
    const r=await mod.default.fetch(new Request("https://admin-agent.internal/issue-inbox",{
      headers:{"x-yorphives-internal-inbox":"1"}
    }),{});
    assert.equal(r.status,200);
    const body=await r.json();
    assert.equal(body.read_only,true);
    assert.equal(body.issues.length,1);
    assert.equal(body.issues[0].number,7);
    assert.equal(requests.length,1);
    assert.equal(requests[0].options.method,"GET");
    assert.equal(requests[0].options.headers.authorization,undefined);
    assert.match(requests[0].url,/^https:\/\/api\.github\.com\/repos\/solopreneursid\/yorpHives-2\.0\/issues\?/);
  } finally { globalThis.fetch=originalFetch; }
});
