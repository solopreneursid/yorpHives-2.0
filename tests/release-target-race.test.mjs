import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('simultaneous history refreshes coalesce without making any production release request', async () => {
  const elements = new Map();
  function element() {
    return {
      textContent: '', disabled: false, children: [], handlers: {},
      addEventListener(name,handler) { this.handlers[name]=handler; },
      replaceChildren(...children) { this.children=children; },
      append(...children) { this.children.push(...children); }
    };
  }
  const document = {
    readyState: 'complete',
    createElement: element,
    getElementById(id) { if(!elements.has(id)) elements.set(id,element()); return elements.get(id); }
  };
  const window = {};
  let resolveResponse, requests = 0;
  const gate = new Promise(resolve => { resolveResponse=resolve; });
  const fetch = async url => {
    assert.equal(url,'/api/admin/release-evidence');
    requests++;
    return gate;
  };
  vm.runInNewContext(await readFile(new URL('../admin/release-evidence.js',import.meta.url),'utf8'),
    {document,window,fetch,Date,URL,AbortSignal,Number,Response});
  const first=window.loadInvestigationHistory();
  assert.equal(window.loadInvestigationHistory(),first);
  assert.equal(requests,1);
  resolveResponse(Response.json({
    production_approved:false,production_deployment_enabled:false,
    generated_at:'2026-11-14T00:00:00Z',
    counts:{repairs:1,ci_attested:1,qa_recorded:0},
    repairs:[{title:'Verified historical observation',job_status:'needs_review',
      updated_at:'2026-11-14T00:00:00Z',blockers:['Independent review outstanding'],
      ci_verified:true,qa_recorded_for_ci_revision:false}]
  }));
  await first;
  assert.equal(requests,1);
  assert.match(elements.get('release-evidence-updated').textContent,/Recorded data retrieved/);
  assert.equal(elements.get('release-evidence-list').children.length,1);
  assert.equal(elements.get('release-evidence-refresh').disabled,false);
  assert.equal(elements.has('release-go-live'),false);
  assert.equal(elements.has('release-launch-preview'),false);
});
