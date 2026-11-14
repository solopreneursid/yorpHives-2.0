/* Self-hosted only: add a source-backed browser-functional monitoring card.
 * The core Founder Pulse remains a zero-fetch renderer of cockpit evidence.
 * No development action, production mutation or model dispatch occurs here. */
(() => {
  'use strict';
  const make = (tag, text, className) => {
    const el = document.createElement(tag);
    el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  let running = false, panel, title, body, details;
  function show(data) {
    const state = data?.kind === 'functional_browser_checks' ? data.availability : 'unavailable';
    const good = Number.isSafeInteger(data?.verified_passes) ? data.verified_passes : 0;
    const bad = Number.isSafeInteger(data?.failures) ? data.failures : 0;
    const unchecked = Number.isSafeInteger(data?.unchecked) ? data.unchecked : 4;
    const stamp = state === 'recorded' || state === 'stale'
      ? new Date(data.observed_at).toLocaleString() : 'not connected';
    panel.dataset.state = state;
    if (state === 'recorded' && bad > 0) {
      title.textContent = 'Some public tools failed a real browser check';
      body.textContent = good + ' verified · ' + bad + ' failed · ' + unchecked +
        ' unverified. Inspect the individual journeys before making fixes.';
    } else if (state === 'recorded' && unchecked > 0) {
      title.textContent = 'Some browser checks could not run';
      body.textContent = good + ' verified · ' + bad + ' failed · ' + unchecked +
        ' unavailable. Missing browser coverage is not proof that a tool works.';
    } else if (state === 'recorded') {
      title.textContent = 'Four browser tool journeys passed';
      body.textContent = 'JSON format, minify, Base64 encode and URL decode produced their expected outputs. Other tools remain unverified by these tests.';
    } else if (state === 'stale') {
      title.textContent = 'Browser tool-check evidence is stale';
      body.textContent = 'The recorded results are older than 25 minutes. Check the independent browser watchdog before trusting a recovery.';
    } else {
      title.textContent = 'Browser-level tool checks are not connected';
      body.textContent = 'Install and start the separate self-hosted functional watchdog to verify actual tool outputs. Existing HTTP checks cover reachability only.';
    }
    details.replaceChildren();
    if (Array.isArray(data?.results) && ['recorded','stale'].includes(state)) {
      for (const check of data.results.slice(0,4)) {
        if (!check || typeof check.id !== 'string' || typeof check.status !== 'string') continue;
        details.append(make('span',check.id.replaceAll('-',' ') + ': ' + check.status + ' · ','hq-pulse-pill'));
      }
    }
    panel.querySelector('[data-functional-time]').textContent = 'Read-only evidence · ' + stamp;
  }
  async function reload() {
    if (running) return;
    running = true;
    try {
      const response = await fetch('/api/admin/functional-checks',{
        method:'GET',headers:{accept:'application/json'},
        credentials:'same-origin',cache:'no-store',
        signal:AbortSignal.timeout(5000)
      });
      if (!response.ok) throw new Error('Browser evidence endpoint unavailable');
      show(await response.json());
    } catch { show(null); }
    finally { running = false; }
  }
  function init() {
    const status = document.getElementById('hq-pulse-status');
    if (!status || document.getElementById('hq-functional-panel')) return;
    panel = make('article','','hq-pulse-post');
    panel.id = 'hq-functional-panel';
    panel.setAttribute('role','region');
    panel.setAttribute('aria-label','Functional tool monitoring');
    panel.setAttribute('aria-live','polite');
    panel.append(make('span','INDEPENDENT BROWSER CHECKS','hq-pulse-pill'));
    title = make('h3','Checking functional coverage…');
    body = make('p','');
    details = make('div','','hq-pulse-post-bottom');
    const foot = make('small','','hq-pulse-readonly');
    foot.dataset.functionalTime = '';
    panel.append(title,body,details,foot);
    status.insertAdjacentElement('afterend',panel);
    void reload();
    document.getElementById('cockpit-refresh')?.addEventListener('click',()=>void reload());
    setInterval(()=>void reload(),120000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
