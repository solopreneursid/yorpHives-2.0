import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { request as httpRequest } from 'node:http';
import { resolve } from 'node:path';
import { createHeadquartersServer } from '../self-host/server.mjs';
import { createDatabase } from '../self-host/sqlite.mjs';

const password = crypto.randomUUID();
async function fixture(t) {
  const directory = await mkdtemp(resolve(tmpdir(), 'yorphives-portable-'));
  const runtime = await createHeadquartersServer({ password, dataDirectory: directory });
  t.after(async () => { await runtime.close(); await rm(directory, { recursive: true, force: true }); });
  const request = (path, options = {}) => fetch(runtime.origin + path, { redirect: 'manual', ...options });
  const login = () => request('/auth/login', { method: 'POST', headers: { origin: runtime.origin, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ password }) });
  return { runtime, directory, request, login };
}

test('portable server requires a real owner session and completes persistent mission lifecycle', async t => {
  const { runtime, directory, request, login } = await fixture(t);
  assert.equal((await request('/admin/')).status, 303);
  assert.equal((await request('/api/admin/headquarters', { headers: { 'cf-access-jwt-assertion': 'forged', 'x-owner-email': 'owner@localhost' } })).status, 401);
  assert.equal((await request('/auth/login', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ password }) })).status, 403);
  const signed = await login();
  assert.equal(signed.status, 303);
  const cookieHeader = signed.headers.get('set-cookie');
  assert.match(cookieHeader, /HttpOnly/);
  assert.match(cookieHeader, /SameSite=Strict/);
  assert.match(cookieHeader, /Max-Age=28800/);
  const cookie = cookieHeader.split(';')[0];
  const headers = { cookie, origin: runtime.origin, 'content-type': 'application/json' };
  const html = await request('/admin/', { headers });
  assert.equal(html.status, 200);
  assert.match(await html.text(), /data-runtime="self-hosted"/);
  const initial = await (await request('/api/admin/headquarters', { headers })).json();
  assert.equal(initial.departments.length, 9);
  assert.equal(initial.engine_available, false);
  assert.equal(initial.missions.length, 0);
  const mission = { job_id: crypto.randomUUID(), agent_id: 'product-strategist', title: 'Test a real business workflow', request_summary: 'Assess a market problem and collect evidence before investing.', priority: 'normal' };
  assert.equal((await request('/api/admin/headquarters', { method: 'POST', headers: { ...headers, origin: 'https://evil.example' }, body: JSON.stringify(mission) })).status, 403);
  assert.equal((await request('/api/admin/headquarters', { method: 'POST', headers, body: JSON.stringify(mission) })).status, 201);
  assert.equal((await request('/api/admin/headquarters', { method: 'POST', headers, body: JSON.stringify(mission) })).status, 200);
  const saved = await (await request('/api/admin/headquarters', { headers })).json();
  assert.equal(saved.missions.length, 1);
  assert.equal(saved.missions[0].title, mission.title);
  assert.equal(saved.events.length, 1);
  assert.equal((await request('/api/admin/headquarters', { method: 'PATCH', headers, body: JSON.stringify({ job_id: mission.job_id, expected_updated_at: saved.missions[0].updated_at, action: 'dispatch' }) })).status, 503);
  assert.equal((await request('/api/admin/headquarters', { method: 'PATCH', headers, body: JSON.stringify({ job_id: mission.job_id, expected_updated_at: saved.missions[0].updated_at, action: 'cancel' }) })).status, 200);
  const final = await (await request('/api/admin/headquarters', { headers })).json();
  assert.equal(final.missions[0].status, 'cancelled');
  assert.equal(final.events.length, 2);
  assert.equal((await stat(resolve(directory, 'headquarters.sqlite'))).mode & 0o777, 0o600);
  const memory = await request('/api/admin/yorpmind', { headers });
  assert.equal(memory.status, 200);
  const team = await request('/api/admin/yorpmind-team', { headers });
  assert.equal(team.status, 200);
  assert.equal((await team.json()).autonomous_dispatch, false);
  assert.equal((await request('/api/admin/analytics', { headers })).status, 200);
  assert.equal((await (await request('/api/admin/analytics', { headers })).json()).configured, false);
  const emailReadiness = await request('/api/admin/founder-otp', { headers });
  assert.equal(emailReadiness.status, 200);
  const email = await emailReadiness.json();
  assert.equal(email.can_request, false);
  assert.equal(email.delivery_ready, false);
  assert.equal(email.production_allowed, false);
  assert.equal((await request('/auth/logout', { method: 'POST', headers })).status, 303);
  assert.equal((await request('/api/admin/headquarters', { headers })).status, 401);
  const reopened = await createDatabase({ filename: resolve(directory, 'headquarters.sqlite') });
  assert.equal((await reopened.prepare('SELECT status FROM agent_jobs WHERE job_id=?').bind(mission.job_id).first()).status, 'cancelled');
  reopened.close();
});

test('portable server denies host spoofing, oversized bodies and private source assets', async t => {
  const { runtime, request, login } = await fixture(t);
  const badHostStatus = await new Promise((resolveStatus, reject) => {
    const check = httpRequest(new URL('/health', runtime.origin), { headers: { host: 'evil.example' } }, response => { response.resume(); resolveStatus(response.statusCode); });
    check.on('error', reject); check.end();
  });
  assert.equal(badHostStatus, 421);
  const cookie = (await login()).headers.get('set-cookie').split(';')[0];
  const headers = { cookie, origin: runtime.origin, 'content-type': 'application/json' };
  for (const path of ['/self-host/server.mjs', '/self-host/data/owner-password', '/migrations/0010_agentic_os_foundation.sql', '/.git/config', '/.env', '/functions/_lib/admin-auth.ts', '/admin/../package.json', '/admin/styles/headquarters.input.css.map']) {
    assert.equal((await request(path, { headers })).status, 404, path);
  }
  assert.equal((await request('/api/admin/headquarters', { method: 'POST', headers, body: 'x'.repeat(24001) })).status, 413);
  assert.equal((await request('/admin/admin.js', { headers })).status, 200);
  assert.equal((await request('/brand/yorphives-logo.webp', { headers })).status, 200);
  assert.equal((await request('/api/admin/step-up/assistant-permissions', { headers })).status, 503);
});

test('portable sign-in bounds repeated failed attempts and does not accept an arbitrary cookie', async t => {
  const { runtime, request } = await fixture(t);
  assert.equal((await request('/api/admin/headquarters', { headers: { cookie: 'yorphives_owner=' + 'a'.repeat(64) } })).status, 401);
  for (let index = 0; index < 5; index++) {
    const response = await request('/auth/login', { method: 'POST', headers: { origin: runtime.origin, 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=incorrect' });
    assert.equal(response.status, 401);
  }
  assert.equal((await request('/auth/login', { method: 'POST', headers: { origin: runtime.origin, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ password }) })).status, 429);
});

test('SQLite compatibility layer migrates all schema, rolls back batches and detects modified history', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'yorphives-sqlite-'));
  const filename = resolve(directory, 'data.sqlite');
  try {
    const db = await createDatabase({ filename });
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM self_host_migrations').first()).n, 30);
    await assert.rejects(db.batch([
      db.prepare("INSERT INTO agent_departments(department_id,slug,name,mission) VALUES ('batch-test','batch-test','Test','Test')"),
      db.prepare('INSERT INTO table_does_not_exist VALUES (1)')
    ]));
    assert.equal(await db.prepare("SELECT * FROM agent_departments WHERE department_id='batch-test'").first(), null);
    db.raw.prepare("UPDATE self_host_migrations SET sha256='changed' WHERE name='0001_catalogue.sql'").run();
    db.close();
    await assert.rejects(createDatabase({ filename }), /Migration changed after application/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('local observation schedule records a real daily scan without dispatch or fabricated lessons', async () => {
  const { createObservationScheduler } = await import('../self-host/scheduler.mjs');
  const db = await createDatabase({ filename: ':memory:' });
  const schedule = createObservationScheduler({ db });
  try {
    const result = await schedule.runOnce();
    assert.equal(result.status, 'completed');
    assert.equal(result.model_calls, 0);
    assert.equal(result.agent_dispatches, 0);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM yorpmind_evolution_runs').first()).n, 1);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM yorpmind_experiences').first()).n, 0);
    await schedule.runOnce();
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM yorpmind_evolution_runs').first()).n, 1);
  } finally { await schedule.close(); db.close(); }
});

test('online backup retains committed SQLite records and private file permissions', async () => {
  const { createBackup } = await import('../self-host/backup.mjs');
  const directory = await mkdtemp(resolve(tmpdir(), 'yorphives-backup-'));
  const db = await createDatabase({ filename: resolve(directory, 'headquarters.sqlite') });
  try {
    await db.prepare("INSERT INTO agent_departments(department_id,slug,name,mission) VALUES ('backup-test','backup-test','Backed up','Verify online backup')").run();
    const backup = await createBackup(directory);
    assert.equal((await stat(backup)).mode & 0o777, 0o600);
    const restored = await createDatabase({ filename: backup });
    assert.equal((await restored.prepare("SELECT name FROM agent_departments WHERE department_id='backup-test'").first()).name, 'Backed up');
    restored.close();
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM agent_departments WHERE department_id='backup-test'").first()).n, 1);
  } finally { db.close(); await rm(directory, { recursive: true, force: true }); }
});

test('HTTP readiness reports disabled monitoring while liveness remains available', async t => {
  const { request } = await fixture(t);
  assert.equal((await request('/health')).status, 200);
  const response = await request('/ready');
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    service: 'YorpHives Headquarters', status: 'degraded', database: 'available', monitoring: 'disabled'
  });
  const head = await request('/ready', { method: 'HEAD' });
  assert.equal(head.status, 503);
  assert.equal(await head.text(), '');
});
