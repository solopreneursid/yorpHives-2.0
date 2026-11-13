import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../self-host/sqlite.mjs';
import { createLocalMissionEngine, privateModelBase } from '../self-host/mission-engine.mjs';

const brief = { summary: 'Test onboarding with real users.', recommended_approach: 'Measure the current flow before changing it.',
  actions: ['Interview five customers.'], risks: ['The sample may be biased.'], assumptions: [],
  verification_needed: ['Check measured completion against the baseline.'] };
const models = () => Response.json({ data: [{ id: 'owned-open-weight-model' }] });
const request = id => new Request('https://hq-engine.internal/missions', { method: 'POST',
  headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'mission_brief', job_id: id }) });
function mission(db, status = 'queued', agent = 'product-strategist') {
  const id = crypto.randomUUID();
  db.raw.prepare("INSERT INTO agent_jobs(job_id,agent_id,job_type,title,request_summary,status,priority,created_by) VALUES(?,?,'owner_mission','Improve onboarding','Measure adoption and plan a better first session.',?,'normal','founder@localhost')").run(id, agent, status);
  return id;
}

test('private model configuration excludes public SaaS, credentials and request-controlled endpoints', () => {
  assert.equal(privateModelBase('http://127.0.0.1:8080/v1/'), 'http://127.0.0.1:8080/v1');
  assert.equal(privateModelBase('http://192.168.1.5:8000/v1'), 'http://192.168.1.5:8000/v1');
  assert.equal(privateModelBase('http://llama.internal:8080/v1'), 'http://llama.internal:8080/v1');
  for (const value of ['https://api.openai.com/v1', 'http://user:secret@localhost/v1', 'http://localhost/v1?q=1', 'http://localhost/v1#x', 'file:///tmp/model', 'http://172.32.0.1/v1'])
    assert.throws(() => privateModelBase(value));
});

test('private model mission persists a single structured brief with usage and immutable attempt, then awaits founder review', async () => {
  const db = await createDatabase({ filename: ':memory:' });
  let inferences = 0;
  const engine = await createLocalMissionEngine({ db, modelUrl: 'http://localhost:8080/v1', fetchImpl: async (url, options) => {
    if (url.endsWith('/models')) return models();
    assert.equal(url, 'http://localhost:8080/v1/chat/completions');
    assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'owned-open-weight-model');
    assert.equal(body.stream, false);
    assert.ok(!('tools' in body));
    inferences++;
    return Response.json({ choices: [{ message: { content: JSON.stringify(brief) } }], usage: { prompt_tokens: 80, completion_tokens: 100, total_tokens: 180 } });
  }});
  try {
    const health = await engine.fetch(new Request('https://hq-engine.internal/health'));
    assert.equal((await health.json()).ready, true);
    assert.equal(inferences, 0);
    const id = mission(db);
    assert.equal((await engine.fetch(request(id))).status, 202);
    await engine.waitForIdle();
    const row = db.raw.prepare('SELECT * FROM agent_jobs WHERE job_id=?').get(id);
    assert.equal(row.status, 'awaiting_owner_approval');
    const result = JSON.parse(row.result_json);
    assert.equal(result.kind, 'recommendation_brief');
    assert.equal(result.provider, 'self_hosted');
    assert.equal(result.verified, false);
    assert.equal(result.summary, brief.summary);
    assert.equal(result.provider_usage.total_tokens, 180);
    assert.equal(result.provider_usage.actual_cost_usd, null);
    assert.ok(JSON.parse(row.input_json).model_attempt_started_at);
    assert.equal((await engine.fetch(request(id))).status, 409);
    assert.equal(inferences, 1);
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM agent_approvals').get().n, 0);
  } finally { await engine.close(); db.close(); }
});

test('empty or oversized model answers fail once without fabricated work, automatic retries or sensitive errors', async () => {
  for (const bad of [{ choices: [{ message: { content: '' } }] }, { text: 'secret-provider-diagnostic'.repeat(5000) }]) {
    const db = await createDatabase({ filename: ':memory:' });
    let inferences = 0;
    const engine = await createLocalMissionEngine({ db, modelUrl: 'http://localhost:8080/v1', fetchImpl: async url => {
      if (url.endsWith('/models')) return models();
      inferences++;
      return Response.json(bad);
    }});
    try {
      const id = mission(db);
      assert.equal((await engine.fetch(request(id))).status, 202);
      await engine.waitForIdle();
      const row = db.raw.prepare('SELECT status,result_json FROM agent_jobs WHERE job_id=?').get(id);
      assert.equal(row.status, 'failed');
      assert.equal(inferences, 1);
      assert.doesNotMatch(row.result_json, /secret-provider-diagnostic/);
    } finally { await engine.close(); db.close(); }
  }
});

test('restart preserves results and marks interrupted work failed without sending it to a model again', async () => {
  const db = await createDatabase({ filename: ':memory:' });
  const id = mission(db, 'running');
  let calls = 0;
  const engine = await createLocalMissionEngine({ db, modelUrl: 'http://localhost:8080/v1', fetchImpl: async () => { calls++; return models(); } });
  try {
    const row = db.raw.prepare('SELECT status,result_json FROM agent_jobs WHERE job_id=?').get(id);
    assert.equal(row.status, 'failed');
    assert.equal(JSON.parse(row.result_json).code, 'PROCESS_RESTARTED');
    assert.equal(calls, 0);
    const disabled = mission(db, 'queued', 'engineering-lead');
    assert.equal((await engine.fetch(request(disabled))).status, 409);
    assert.equal(calls, 0);
  } finally { await engine.close(); db.close(); }
});

test('concurrent discovery reserves three slots and shutdown prevents late inference', async () => {
  const db = await createDatabase({ filename: ':memory:' });
  let release, discoveries = 0, inferences = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const engine = await createLocalMissionEngine({ db, modelUrl: 'http://localhost:8080/v1', fetchImpl: async url => {
    if (url.endsWith('/models')) { discoveries++; await gate; return models(); }
    inferences++;
    return Response.json({ choices: [{ message: { content: JSON.stringify(brief) } }] });
  }});
  try {
    const requests = Array.from({ length: 4 }, () => engine.fetch(request(mission(db))));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(discoveries, 3);
    assert.equal((await requests[3]).status, 429);
    const closing = engine.close();
    release();
    const results = await Promise.all(requests);
    await closing;
    assert.deepEqual(results.map(result => result.status), [503, 503, 503, 429]);
    assert.equal(inferences, 0);
  } finally { release(); await engine.close(); db.close(); }
});
