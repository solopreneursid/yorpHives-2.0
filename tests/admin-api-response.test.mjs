import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../admin/admin.js', import.meta.url), 'utf8');
const client = source.slice(source.indexOf('async function api('), source.indexOf('\nfunction cell('));

test('API client rejects successful HTML and malformed JSON instead of returning empty data', async () => {
  for (const response of [
    new Response('<html>Proxy error</html>', { headers: { 'content-type': 'text/html' } }),
    new Response('{broken', { headers: { 'content-type': 'application/json' } })
  ]) {
    const messages = [];
    const context = vm.createContext({ fetch: async () => response, AbortSignal,
      showSystemMessage: message => messages.push(message) });
    vm.runInContext(client, context);
    await assert.rejects(context.api('/api/admin/cockpit'), /JSON response/);
    assert.equal(messages.length, 1);
  }
});

test('API client preserves caller cancellation and bounds requests', async () => {
  const controller = new AbortController();
  controller.abort();
  const context = vm.createContext({ AbortSignal, showSystemMessage() {},
    fetch: async (path, options) => {
      assert.equal(options.signal.aborted, true);
      assert.equal(options.credentials, 'same-origin');
      return Response.json({ available: true });
    }
  });
  vm.runInContext(client, context);
  assert.equal((await context.api('/api/admin/cockpit', { signal: controller.signal })).available, true);
});
