/**
 * Read-only, browser-level functional checks for the public YorpHives website.
 *
 * This intentionally checks actual output after a user interaction, not HTTP 200.
 * Playwright/Chromium is an optional, self-hosted runtime dependency. No user
 * documents, credentials, analytics data, production writes or AI calls.
 */
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

export const FUNCTIONAL_TARGET = 'https://yorphives.com/free-tools/file-studio/';
const inputJSON = '{"name":"YorpHives","numbers":[1,2],"enabled":true}';
export const FUNCTIONAL_PROBES = Object.freeze([
  Object.freeze({ id:'json-formatter', tool:'json-formatter', operation:'json-pretty',
    input:inputJSON, expected:JSON.stringify(JSON.parse(inputJSON),null,2) }),
  Object.freeze({ id:'json-minifier', tool:'json-minifier', operation:'json-minify',
    input:inputJSON, expected:JSON.stringify(JSON.parse(inputJSON)) }),
  Object.freeze({ id:'base64-encoder', tool:'base64-encoder', operation:'base64-encode',
    input:'YorpHives browser test', expected:Buffer.from('YorpHives browser test','utf8').toString('base64') }),
  Object.freeze({ id:'url-decoder', tool:'url-decoder', operation:'url-decode',
    input:'YorpHives%20product%20check%20%26%20QA', expected:'YorpHives product check & QA' })
]);
const hash = text => createHash('sha256').update(text,'utf8').digest('hex');
const cleanStatus = (probe, observedAt, duration, status, reason, actual = null) => ({
  id:probe.id, system:'website', product:probe.tool, source:'chromium_browser_journey',
  source_url:FUNCTIONAL_TARGET + '?tool=' + encodeURIComponent(probe.tool),
  observed_at:observedAt, duration_ms:Math.max(0,Math.round(duration)),
  status, reason, verification_status:status === 'passed' ? 'functionally_verified' : 'unverified',
  evidence:actual === null ? null : {
    operation:probe.operation, expected_sha256:hash(probe.expected), observed_sha256:hash(actual)
  }
});
const absent = (probe, at, reason) => cleanStatus(probe,at,0,'unavailable',reason);

/**
 * No browser supplied = unavailable, NEVER a false claim of broken website.
 * The caller owns installing and providing open-source Playwright Chromium.
 * The allowlist blocks network requests to private hosts/third-party services.
 */
export async function runFunctionalChecks({
  chromium, probes = FUNCTIONAL_PROBES, clock = () => new Date().toISOString(),
  timeoutMs = 12000
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000)
    throw new RangeError('A functional check timeout must be between 1000 and 30000 ms.');
  if (!Array.isArray(probes) || probes.length > FUNCTIONAL_PROBES.length ||
      probes.some(probe => !FUNCTIONAL_PROBES.includes(probe)))
    throw new TypeError('Only reviewed, built-in browser probes may run.');
  if (!chromium || typeof chromium.launch !== 'function')
    return probes.map(probe => absent(probe,clock(),'browser_not_installed'));
  let browser, context;
  try {
    browser = await chromium.launch({ headless:true });
    context = await browser.newContext({
      javaScriptEnabled:true, acceptDownloads:false,
      viewport:{ width:390, height:844 }, ignoreHTTPSErrors:false
    });
    await context.route('**/*', route => {
      try {
        const requested = new URL(route.request().url());
        if (requested.origin === 'https://yorphives.com')
          return route.continue();
      } catch { /* fail closed */ }
      return route.abort();
    });
  } catch {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    return probes.map(probe => absent(probe,clock(),'browser_start_unavailable'));
  }
  const results = [];
  try {
    for (const probe of probes) {
      const observedAt = clock();
      const start = performance.now();
      let page;
      try {
        page = await context.newPage();
        page.setDefaultTimeout(timeoutMs);
        const url = FUNCTIONAL_TARGET + '?tool=' + encodeURIComponent(probe.tool);
        const response = await page.goto(url,{ waitUntil:'domcontentloaded',timeout:timeoutMs });
        const landed = new URL(page.url());
        if (landed.origin !== 'https://yorphives.com' ||
            landed.pathname !== '/free-tools/file-studio/' ||
            !response || response.status() < 200 || response.status() >= 300) {
          results.push(cleanStatus(probe,observedAt,performance.now()-start,'failed','page_unavailable'));
          continue;
        }
        await page.locator('#textInput').fill(probe.input);
        await page.locator('#textAction').selectOption(probe.operation);
        await page.locator('#runText').click();
        const actual = await page.locator('#textOutput').textContent();
        if (typeof actual !== 'string') {
          results.push(cleanStatus(probe,observedAt,performance.now()-start,'failed','missing_output'));
        } else {
          const correct = actual === probe.expected;
          results.push(cleanStatus(probe,observedAt,performance.now()-start,
            correct ? 'passed':'failed',correct ? 'output_verified':'output_mismatch',actual));
        }
      } catch {
        results.push(cleanStatus(probe,observedAt,performance.now()-start,'failed','browser_journey_failed'));
      } finally { await page?.close().catch(() => {}); }
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
  return results;
}
