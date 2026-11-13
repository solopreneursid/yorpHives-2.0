/**
 * No-credential visual QA against the checked-out files, not Cloudflare.
 *
 * All /api calls are intercepted. Every mutation is rejected; no real
 * identity, D1, GitHub, AI or production service can be contacted.
 * A separate authenticated test remains mandatory before launch.
 */
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactDirectory = resolve(root, "artifacts/headquarters-visual");
const endpoints = [];
const blockedMutations = [];
const blockedExternal = [];
const checks = [];
const captures = [];
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const TIMEOUT = 10000;
const MIME = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
});

const fail = (name, explanation) => {
  checks.push({ name, passed: false, explanation });
  throw new Error(name + ": " + explanation);
};
function check(name, condition, explanation) {
  if (!condition) fail(name, explanation);
  checks.push({ name, passed: true });
}
function fixture(path) {
  const iso = "2026-11-13T12:00:00.000Z";
  const neutral = {
    identity: "Browser QA · offline fixture",
    connected: { yorpmind: false, chatgpt: false },
    owner_is_in_charge: true,
    production_execution_enabled: false,
    mfa_configured: false,
    release_execution_enabled: false,
    auto_ai_dispatch_enabled: false,
    assistants: [],
    departments: [],
    specialists: [],
    missions: [],
    events: [],
    findings: [],
    assets: [],
    dependencies: [],
    jobs: [],
    counts: {},
    ideas: [],
    categories: [],
    sources: [],
    runs: [],
    opportunities: [],
    signals: [],
    reviews: [],
    mission_budget: { remaining: 0 },
    engine_available: false,
    name: "Your assistant permissions",
    generated_at: iso,
    pending_total_in_window: 0,
    truncated: false,
    recorded_jobs_scanned: 0,
    items: []
  };
  if (path === "/api/admin/website-proof") {
    const routes = ["/", "/free-tools/", "/free-tools/manifest.json",
      "/llms.txt", "/openapi.yaml", "/.well-known/yorphives.json",
      "/api/v1/free-tools"];
    const checks = routes.map((path, index) => ({
      path, title: path === "/" ? "Homepage" : path,
      expected_format: index < 2 ? "html" : "machine-readable",
      status: index === 2 ? "needs_attention" : index === 4 ?
        "not_verified" : "verified_basic",
      http_status: index === 4 ? null : 200,
      content_type: index < 2 ? "text/html" : "application/json",
      note: index === 2 ? "Simulated HTML fallback for browser layout test." :
        index === 4 ? "Simulated inaccessible site for browser layout test." :
        "Synthetic response passed layout test only.",
      security: null
    }));
    return {
      source: "real_public_http_get", origin: "https://yorphives.com",
      checked_at: iso, total: 7, basic_passed: 5,
      needs_attention: 1, unverified: 1,
      overall: "needs_attention", checks,
      previous_findings_auto_resolved: false,
      documents_proven_fully_correct: false, new_ai_model_calls: 0,
      database_writes: 0, production_changes: 0
    };
  }
  if (path === "/api/admin/action-center") {
    return { ...neutral, name: "Headquarters Founder Action Center",
      scope: "private_d1_evidence_only", actions: [], pending_total_in_window: 0 };
  }
  if (path === "/api/admin/cockpit") {
    // Synthetic dashboard records are exclusively for layout and interaction
    // testing. They never describe a connected business or live website.
    const available = { available:true, partial:false, observed_at:iso, error:null };
    return {
      name:"YorpHives Founder Cockpit", generated_at:iso,
      scope:"private_database_evidence", availability:"ready", read_only:true,
      metrics:{
        missions:{ total:12, active:5, planned:2, running:1, review:2,
          failed:1, completed:6, rehearsals:0 },
        issues:{ active:3, critical:1, known_active:3, known_critical:1 },
        monitors:{ enabled:7, passing:6, failing:1, stale:0, unknown:0,
          last_checked_at:iso, freshness_window_hours:8 },
        memory:{ experiences:2, approved_skills:1 },
        opportunities:{ proposed:4, shortlisted:1 }
      },
      sources:Object.fromEntries(["missions","issues","monitors","memory",
        "opportunities","activity"].map(name=>[name,{...available}])),
      recent_missions:[{
        job_id:"123e4567-e89b-42d3-a456-000000000001",
        title:"Review onboarding clarity", status:"awaiting_owner_approval",
        priority:"high", updated_at:iso
      }],
      recent_activity:[{
        event_id:"123e4567-e89b-42d3-a456-000000000002",
        job_id:"123e4567-e89b-42d3-a456-000000000001",
        title:"Review onboarding clarity", event_type:"mission_brief_saved",
        actor_type:"system", created_at:iso
      }],
      next_actions:[{
        id:"critical-issues", title:"Review critical website problems",
        description:"One synthetic finding exercises the attention layout.",
        view:"issues", urgency:"urgent", target:null
      }],
      finances:{ revenue:null, operating_cost:null, status:"not_connected",
        message:"Revenue and provider bills are not connected." },
      limitations:"Offline synthetic layout fixture; no real business records."
    };
  }
  if (path === "/api/admin/headquarters") {
    return { ...neutral, schema_version: "offline-qa", engine_available: false };
  }
  if (path === "/api/admin/assistant-permissions") {
    return { ...neutral, name: "Your assistant permissions", assistants: [] };
  }
  return neutral;
}
async function startServer() {
  const server = createServer(async (req, response) => {
    try {
      const u = new URL(req.url || "/", "http://localhost");
      const route = u.pathname === "/" || u.pathname === "/admin/" ?
        "/admin/index.html" : u.pathname;
      const pathname = decodeURIComponent(route);
      const resolved = resolve(root, "." + pathname);
      if (!resolved.startsWith(root + sep)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const bytes = await readFile(resolved);
      response.writeHead(200, {
        "content-type": MIME[extname(resolved)] || "application/octet-stream",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      });
      response.end(bytes);
    } catch {
      response.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    }
  });
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  return { server, baseUrl: "http://127.0.0.1:" + server.address().port };
}
async function routeApi(page, baseUrl) {
  await page.route("**/*", async intercepted => {
    const request = intercepted.request();
    const url = new URL(request.url());
    if (!request.url().startsWith(baseUrl + "/")) {
      blockedExternal.push({ origin: url.origin, method: request.method() });
      await intercepted.abort("blockedbyclient");
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      const method = request.method();
      endpoints.push({ path: url.pathname, method });
      if (method !== "GET" && method !== "HEAD") {
        blockedMutations.push({ path: url.pathname, method });
        await intercepted.fulfill({
          status: 405, headers: JSON_HEADERS,
          body: JSON.stringify({ error: { code: "OFFLINE_MUTATION_BLOCKED",
            message: "Browser fixture does not permit changes." } })
        });
        return;
      }
      await intercepted.fulfill({
        status: 200, headers: JSON_HEADERS,
        body: JSON.stringify(fixture(url.pathname))
      });
      return;
    }
    await intercepted.continue();
  });
}
async function screenshot(page, filename) {
  const pathname = resolve(artifactDirectory, filename);
  await page.screenshot({ path: pathname, fullPage: true, animations: "disabled" });
  captures.push(filename);
}
async function navigate(page, view) {
  await page.evaluate(name => {
    const nav = document.querySelector('.nav-item[data-view="' + name + '"]');
    if (!nav) throw new Error("Missing navigation item " + name);
    nav.click();
  }, view);
  await page.locator("#view-" + view).waitFor({ state: "visible", timeout: TIMEOUT });
  const status = await page.evaluate(name => ({
    hash: location.hash,
    activeCount: document.querySelectorAll(".nav-item.active").length,
    current: document.querySelector('.nav-item[aria-current="page"]')?.dataset.view,
    scrollY: window.scrollY,
    visible: document.getElementById("view-" + name)?.classList.contains("active")
  }), view);
  check("route:" + view,
    status.hash === "#" + view && status.activeCount === 1 &&
    status.current === view && status.visible && status.scrollY === 0,
    "Only the selected route should be visible, active and scrolled to the top.");
}
async function measure(page, width, height, view) {
  await page.setViewportSize({ width, height });
  await navigate(page, view);
  const info = await page.evaluate(() => {
    const content = document.querySelector(".content");
    const main = document.querySelector(".main-area");
    const active = document.querySelector(".view.active");
    const logo = document.querySelector(".brand-mark");
    return {
      viewportWidth: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      contentWidth: Math.round(content?.getBoundingClientRect().width || 0),
      mainWidth: Math.round(main?.getBoundingClientRect().width || 0),
      activeWidth: Math.round(active?.getBoundingClientRect().width || 0),
      logo: logo ? getComputedStyle(logo).backgroundImage : "",
      logoFilter: logo ? getComputedStyle(logo).filter : "",
      bodyBackground: getComputedStyle(document.body).backgroundImage
    };
  });
  check("responsive:" + width + ":" + view,
    info.scrollWidth <= width + 2 &&
    info.contentWidth > 0 && info.contentWidth <= width &&
    info.mainWidth > 0 && info.activeWidth > 0 &&
    info.logo.includes("yorphives-logo.webp") &&
    info.logoFilter === "none" &&
    info.bodyBackground.includes("radial-gradient"),
    "Page content must fit the device and show the unmodified brand mark.");
  return info;
}
async function main() {
  await mkdir(artifactDirectory, { recursive: true });
  const { server, baseUrl } = await startServer();
  let browser;
  let problem = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 960 },
      reducedMotion: "reduce"
    });
    const scriptErrors = [];
    page.on("pageerror", error => {
      scriptErrors.push(String(error.message).slice(0, 150));
    });
    await routeApi(page, baseUrl);
    const response = await page.goto(baseUrl + "/admin/", {
      waitUntil: "domcontentloaded", timeout: 20000
    });
    check("shell:loaded", response?.status() === 200 &&
      await page.locator(".app-shell").count() === 1,
      "The real HTML, JavaScript and stylesheets must load locally.");
    await page.locator("#view-headquarters").waitFor({ state: "visible", timeout: TIMEOUT });

    check("owner:hierarchy",
      await page.locator(".founder-you").count() === 1 &&
      await page.locator(".founder-assistant").count() === 2,
      "Owner sits above the two peer assistants.");
    const design = await page.evaluate(() => ({
      refined: [...document.styleSheets].some(s =>
        s.href?.endsWith("/admin/headquarters-refined.css")),
      prism: [...document.styleSheets].some(s =>
        s.href?.endsWith("/admin/headquarters-prism-theme.css")),
      collapsedSettings: document.querySelector(".founder-permission-panel")?.open === false
    }));
    check("brand:design-loaded",
      design.refined && design.prism && design.collapsedSettings,
      "Professional visual theme and optional settings must load.");

    await page.waitForFunction(() =>
      document.getElementById("cockpit-missions")?.textContent === "5",
    null, { timeout: TIMEOUT });
    const cockpit = await page.evaluate(() => ({
      headingCount:document.querySelectorAll("#view-headquarters h1").length,
      metricButtons:document.querySelectorAll(".cockpit-metrics button").length,
      counts:["cockpit-missions","cockpit-issues","cockpit-opportunities","cockpit-memory"].map(id=>
        document.getElementById(id)?.textContent),
      optionalClosed:[".cockpit-reference",".cockpit-execution-details"].every(selector=>
        document.querySelector(selector)?.open === false),
      heading:document.getElementById("founder-welcome")?.textContent
    }));
    check("cockpit:recorded-counts-and-focused-home",
      cockpit.headingCount === 1 && cockpit.metricButtons === 4 &&
      cockpit.counts.join(",") === "5,3,5,2" && cockpit.optionalClosed &&
      cockpit.heading?.includes("Today at Headquarters"),
      "A single founder heading and source-backed counts keep optional detail collapsed.");
    check("cockpit:next-action-enabled",
      await page.locator("#cockpit-next-action").isEnabled() &&
      (await page.locator("#cockpit-next-title").textContent()).includes("critical"),
      "The next action must be selected from the recorded finding fixture.");
    await page.locator("#cockpit-next-action").click();
    await page.locator("#view-issues").waitFor({state:"visible",timeout:TIMEOUT});
    check("cockpit:next-action-navigation",
      await page.locator('.nav-item[aria-current="page"]').getAttribute("data-view") === "issues",
      "The suggested next step opens its existing workspace without a mutation.");
    await navigate(page,"headquarters");
    await page.locator("#hq-new").click();
    check("cockpit:mission-composer-keyboard",
      await page.locator("#hq-compose").isVisible() &&
      await page.locator("#hq-title").evaluate(node=>node === document.activeElement),
      "New mission opens the real composer and puts keyboard focus on its title.");
    await page.locator("#hq-close").click();
    check("cockpit:mission-composer-close",
      !await page.locator("#hq-compose").isVisible() &&
      await page.locator("#hq-new").evaluate(node=>node === document.activeElement),
      "Closing a draft restores focus to New mission without creating a record.");

    const failedCockpit = async intercepted => intercepted.fulfill({
      status:503, headers:JSON_HEADERS,
      body:JSON.stringify({error:{message:"Synthetic dashboard outage for retry testing."}})
    });
    await page.route("**/api/admin/cockpit",failedCockpit);
    await page.locator("#cockpit-refresh").click();
    await page.waitForFunction(() =>
      document.getElementById("cockpit-status")?.textContent.includes("unavailable"),
    null, { timeout:TIMEOUT });
    check("cockpit:outage-clears-stale-counts",
      (await page.locator("#cockpit-missions").textContent()) === "—" &&
      await page.locator("#cockpit-refresh").isEnabled(),
      "An unavailable backend must clear stale totals and leave a usable retry action.");
    await page.unroute("**/api/admin/cockpit",failedCockpit);
    await page.locator("#cockpit-refresh").click();
    await page.waitForFunction(() =>
      document.getElementById("cockpit-missions")?.textContent === "5",
    null, { timeout:TIMEOUT });
    check("cockpit:retry-restores-recorded-counts",
      (await page.locator("#cockpit-memory").textContent()) === "2",
      "Retry must load the new snapshot after a dashboard outage.");
    if (await page.locator("#system-message-dismiss").isVisible()) {
      await page.locator("#system-message-dismiss").click();
    }

    const partialCockpit = async intercepted => {
      const partial=fixture("/api/admin/cockpit");
      partial.availability="partial";
      partial.metrics.memory={experiences:null,approved_skills:null};
      partial.sources.memory={available:false,partial:false,observed_at:null,
        error:"Synthetic memory source outage for layout testing."};
      return intercepted.fulfill({status:200,headers:JSON_HEADERS,body:JSON.stringify(partial)});
    };
    await page.route("**/api/admin/cockpit",partialCockpit);
    await page.locator("#cockpit-refresh").click();
    await page.waitForFunction(() =>
      document.getElementById("cockpit-memory")?.textContent === "—",
    null, { timeout:TIMEOUT });
    check("cockpit:optional-source-failure-isolated",
      (await page.locator("#cockpit-missions").textContent()) === "5" &&
      (await page.locator("#cockpit-skills").textContent()) === "—",
      "Missing memory must not erase missions or pretend the missing counters are zero.");
    await page.unroute("**/api/admin/cockpit",partialCockpit);
    await page.locator("#cockpit-refresh").click();
    await page.waitForFunction(() =>
      document.getElementById("cockpit-memory")?.textContent === "2",
    null, { timeout:TIMEOUT });

    // Every route is navigable without contacting a live service. Real API
    // behaviors are tested separately in the authenticated staging workflow.
    for (const route of [
      "headquarters", "yorpmind", "issues", "agents",
      "intelligence", "demand", "business", "radar",
      "departments", "overview", "monitoring", "analytics",
      "updates", "releases", "activity"
    ]) await navigate(page, route);

    await measure(page, 1440, 960, "headquarters");
    await screenshot(page, "01-desktop-home.png");
    await measure(page, 1440, 960, "issues");
    const issueScroll = await page.evaluate(() => {
      const region = document.querySelector("#view-issues .hq-issue-workspace .table-wrap");
      const styles = region && getComputedStyle(region);
      return {
        overflowY: styles?.overflowY,
        maxHeight: styles?.maxHeight,
        header: document.querySelector("#view-issues .table-wrap thead th") &&
          getComputedStyle(document.querySelector("#view-issues .table-wrap thead th")).position,
        collapsed: document.querySelector("#hq-ideas-fold")?.open === false
      };
    });
    check("issues:contained-scroll",
      issueScroll.overflowY === "auto" && issueScroll.header === "sticky" &&
      issueScroll.collapsed && Number.parseFloat(issueScroll.maxHeight) < 800,
      "Problem list scrolls inside its own bounded panel; suggestions start closed.");
    await screenshot(page, "02-desktop-problems.png");
    // This is a FAKE website result to test visual layout and founder choice.
    // It must never be presented as a successful real public HTTP probe.
    await page.locator("#website-proof-run").click();
    await page.locator(".website-proof-item").first().waitFor({state:"visible",timeout:TIMEOUT});
    check("website-proof:read-only-panel",
      await page.locator(".website-proof-item").count()===7 &&
      (await page.locator("#website-proof-status").textContent()).includes("need investigation") &&
      await page.locator("#website-proof-foot").isVisible(),
      "Seven synthetic website results render in the founder's scrollable issue panel.");
    await screenshot(page, "07-desktop-website-check.png");
    await page.locator("#website-proof-chatgpt").click();
    check("website-proof:chatgpt-handoff",
      await page.locator("#founder-handoff-dialog").evaluate(d=>d.open===true) &&
      (await page.locator("#founder-handoff-text").inputValue()).includes("Do not make a production change"),
      "The website check opens an optional review message without dispatching AI.");
    check("website-proof:handoff-visible-from-other-view",
      await page.locator("#founder-handoff-dialog").isVisible() &&
      await page.locator("#founder-handoff-close").isVisible() &&
      await page.locator("#founder-handoff-dialog").evaluate(d=>d.parentElement===document.body),
      "Founder handoff is visible and operable from Problems, not nested under hidden Home.");
    await screenshot(page, "08-desktop-handoff.png");
    await page.locator("#founder-handoff-close").click();
    await page.locator("#website-proof-yorpmind").click();
    check("website-proof:yorpmind-handoff-no-dispatch",
      await page.locator("#view-agents").isVisible() &&
      (await page.locator("#repair-request").inputValue()).includes("YorpHives website") &&
      blockedMutations.length===0,
      "YorpMind handoff prepares a review request but never dispatches work.");

    await measure(page, 1440, 960, "intelligence");
    const ideas = await page.evaluate(() => ({
      left: getComputedStyle(document.querySelector(".intel-cards")).overflowY,
      right: getComputedStyle(document.querySelector(".intel-sidebar")).overflowY
    }));
    check("research:balanced-scroll",
      ideas.left === "auto" && ideas.right === "auto",
      "Research and evidence columns scroll separately.");
    await screenshot(page, "03-desktop-ideas.png");
    await measure(page, 1024, 768, "demand");
    await screenshot(page, "04-tablet-market.png");
    await measure(page, 390, 844, "headquarters");
    await screenshot(page, "05-mobile-home.png");

    // The founder can choose either helper. These are pure local UI actions:
    // do not paste secrets, send chat messages, start workers or create jobs.
    await page.locator(".cockpit-reference > summary").click();
    await page.locator("#founder-chatgpt").click();
    const dialog = page.locator("#founder-handoff-dialog");
    check("handoff:chatgpt",
      await dialog.evaluate(node => node.open === true) &&
      (await page.locator("#founder-handoff-text").inputValue())
        .includes("Do not make a production change"),
      "ChatGPT handoff is a copyable message, not an automatic job.");
    await page.locator("#founder-handoff-close").click();
    await page.locator("#founder-yorpmind").click();
    check("handoff:yorpmind",
      await page.locator("#view-agents").isVisible() &&
      (await page.locator("#repair-request").inputValue())
        .includes("Do not publish anything"),
      "YorpMind handoff prepares a request for founder confirmation.");

    await measure(page, 390, 844, "issues");
    await screenshot(page, "06-mobile-problems.png");
    const permission = await page.evaluate(() => ({
      activeButton: document.querySelector("#founder-permission-submit")?.disabled === false,
      apiWritesAllowed: false
    }));
    check("permission:closed", !permission.activeButton,
      "No temporary assistant permission can activate from a fake browser fixture.");
    check("browser:no-unapproved-mutations", blockedMutations.length === 0,
      "No test should make or attempt a POST/PATCH/DELETE request.");
    check("browser:no-external-network", blockedExternal.length === 0,
      "Local visual QA should not access external services.");

    // There may be controlled API errors in mock-only optional panels. A
    // JavaScript page exception, however, means the actual application broke.
    check("browser:no-script-crashes", scriptErrors.length === 0,
      "Uncaught browser JavaScript errors were detected.");
    await page.close();
  } catch (error) {
    problem = error instanceof Error ? error.message : "Unknown test failure";
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    await writeFile(resolve(artifactDirectory, "report.json"), JSON.stringify({
      source: "local source files and synthetic read-only fixtures",
      liveAccessVerified: false,
      realDataVerified: false,
      productionAuthorized: false,
      checks,
      apiReads: endpoints.filter(e => e.method === "GET").length,
      blockedMutationAttempts: blockedMutations.length,
      externalRequestAttempts: blockedExternal.length,
      screenshots: captures,
      outcome: problem ? "failed" : "passed",
      error: problem ? problem.slice(0, 400) : null
    }, null, 2) + "\n");
  }
  if (problem) throw new Error(problem);
  console.log("Offline Headquarters browser QA: " + checks.length +
    " checks passed; " + captures.length + " screenshots; zero real API calls.");
}
await main();
