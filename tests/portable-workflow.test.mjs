import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHeadquartersServer } from '../self-host/server.mjs';
import { createLocalMissionEngine } from '../self-host/mission-engine.mjs';

test('signed-in founder can save, execute and review a mission through the actual private model HTTP adapter', async () => {
  let inferences = 0;
  const model = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/v1/models' && request.method === 'GET') {
      response.end(JSON.stringify({ data: [{ id: 'test-local-model' }] }));
      return;
    }
    if (request.url === '/v1/chat/completions' && request.method === 'POST') {
      let body = '';
      for await (const chunk of request) body += chunk;
      const payload = JSON.parse(body);
      assert.equal(payload.model, 'test-local-model');
      inferences++;
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        summary: 'Validate a measurable customer problem.',
        recommended_approach: 'Interview prospective users before building.',
        actions: ['Run five interviews.'], risks: ['Small sample.'], assumptions: [],
        verification_needed: ['Record independent interview evidence.']
      }) } }] }));
      return;
    }
    response.writeHead(404).end('{}');
  });
  await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
  const directory = await mkdtemp(join(tmpdir(), 'yorphives-workflow-'));
  let runtime;
  try {
    const password = 'integration-password-for-local-tests';
    runtime = await createHeadquartersServer({ password, dataDirectory: directory,
      createMissionEngine: ({ db }) => createLocalMissionEngine({ db, modelUrl: `http://127.0.0.1:${model.address().port}/v1` }) });
    const call = (path, options = {}) => fetch(runtime.origin + path, { redirect: 'manual', ...options });
    const signed = await call('/auth/login', { method: 'POST', headers: { origin: runtime.origin, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ password }) });
    const cookie = signed.headers.get('set-cookie').split(';')[0];
    const headers = { cookie, origin: runtime.origin, 'content-type': 'application/json' };
    const snapshot = () => call('/api/admin/headquarters', { headers }).then(response => response.json());
    assert.equal((await snapshot()).engine_available, true);
    const mission = { job_id: crypto.randomUUID(), title: 'Test customer demand', request_summary: 'Prepare a measurable customer interview plan with risks and acceptance criteria.', agent_id: 'product-strategist', priority: 'normal' };
    assert.equal((await call('/api/admin/headquarters', { method: 'POST', headers, body: JSON.stringify(mission) })).status, 201);
    let record = (await snapshot()).missions[0];
    assert.equal((await call('/api/admin/headquarters', { method: 'PATCH', headers, body: JSON.stringify({ job_id: mission.job_id, action: 'dispatch', expected_updated_at: record.updated_at }) })).status, 202);
    await runtime.env.HQ_ENGINE_SERVICE.waitForIdle();
    record = (await snapshot()).missions[0];
    assert.equal(record.status, 'awaiting_owner_approval');
    assert.equal(JSON.parse(record.result_json).verified, false);
    let cockpit = await (await call('/api/admin/cockpit', { headers })).json();
    assert.equal(cockpit.metrics.missions.review, 1);
    assert.equal(cockpit.metrics.memory.experiences, 0);
    const reviewed = await call('/api/admin/headquarters', { method: 'PATCH', headers, body: JSON.stringify({ job_id: mission.job_id, action: 'review_brief', expected_updated_at: record.updated_at }) });
    assert.equal(reviewed.status, 200);
    assert.equal((await reviewed.json()).verified, false);
    cockpit = await (await call('/api/admin/cockpit', { headers })).json();
    assert.equal(cockpit.metrics.missions.review, 0);
    assert.equal(cockpit.metrics.missions.completed, 1);
    assert.equal(cockpit.metrics.memory.experiences, 0);
    assert.equal(inferences, 1);
  } finally {
    if (runtime) await runtime.close();
    await new Promise(resolve => model.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
