import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('a slow response for the previous release target cannot overwrite the current preview', async () => {
  const nodes = new Map();
  function node() {
    return { textContent: '', value: '', handlers: {}, children: [],
      addEventListener(name, handler) { this.handlers[name] = handler; },
      removeAttribute(name) { delete this[name]; },
      setAttribute(name, value) { this[name] = value; },
      replaceChildren(...children) { this.children = children; },
      append(child) { this.children.push(child); }
    };
  }
  const document = {
    readyState: 'complete', createElement: node,
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); }
  };
  let resolveWebsite;
  const websiteResponse = new Promise(resolve => { resolveWebsite = resolve; });
  const result = target => Response.json({ target, production_approved: false,
    production_deployment_enabled: false, ready_for_preview: true,
    status: 'verified_preview', blockers: [],
    preview: { url: 'https://abcd1234.' + (target === 'headquarters' ? 'yorphives-admin-staging' : 'yorphives-2-preview') + '.pages.dev/' }
  });
  const fetch = async url => {
    if (url.endsWith('target=website')) return websiteResponse;
    if (url.endsWith('target=headquarters')) return result('headquarters');
    return Response.json({}, { status: 503 });
  };
  vm.runInNewContext(await readFile(new URL('../admin/release-evidence.js', import.meta.url), 'utf8'),
    { document, window: {}, fetch, URL, AbortSignal, Response });
  const select = document.getElementById('release-target');
  select.value = 'website';
  const first = select.handlers.change();
  select.value = 'headquarters';
  await select.handlers.change();
  const preview = document.getElementById('release-launch-preview');
  assert.equal(preview.href, 'https://abcd1234.yorphives-admin-staging.pages.dev');
  resolveWebsite(result('website'));
  await first;
  assert.equal(preview.href, 'https://abcd1234.yorphives-admin-staging.pages.dev');
  assert.equal(document.getElementById('release-go-live').disabled, true);
});
