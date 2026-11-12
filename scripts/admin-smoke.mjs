import { chromium, request } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const baseUrl = (process.env.ADMIN_BASE_URL || "").replace(/\/$/, "");
const clientId = process.env.CF_ACCESS_CLIENT_ID || "";
const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET || "";
const reportPath = process.env.ADMIN_SMOKE_REPORT || "artifacts/admin-smoke.json";

if (!baseUrl) throw new Error("ADMIN_BASE_URL is required.");
if (!clientId || !clientSecret) {
  throw new Error("Set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET as GitHub Actions repository secrets.");
}
const parsedBase = new URL(baseUrl);
if (parsedBase.protocol !== "https:") throw new Error("Admin staging tests require HTTPS.");
if (!parsedBase.hostname.endsWith(".yorphives-admin-staging.pages.dev")) {
  throw new Error("Refusing to test a non-staging Pages hostname.");
}

const accessHeaders = {
  "CF-Access-Client-Id": clientId,
  "CF-Access-Client-Secret": clientSecret
};
const checks = [];
const failures = [];
const record = (name, ok, detail) => {
  const result = { name, ok: Boolean(ok), detail: String(detail || "") };
  checks.push(result);
  if (!result.ok) failures.push(result);
};

async function run() {
  await mkdir("artifacts", { recursive: true });
  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      extraHTTPHeaders: accessHeaders
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message.slice(0, 180)));

    const response = await page.goto(baseUrl + "/admin/", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });
    record("admin_page_http", response?.status() === 200, "HTTP " + (response?.status() || 0));
    record("admin_page_not_redirected_to_login", !page.url().includes("/cdn-cgi/access/login"), page.url().split("?")[0]);

    await page.locator("#view-headquarters").waitFor({ state: "visible", timeout: 15000 });
    record("admin_shell_rendered", await page.locator(".app-shell").count() === 1, "Admin application shell exists");
    record("admin_heading_rendered", await page.locator("#view-headquarters h1").textContent().then(value => Boolean(value?.trim())), "Headquarters heading is present");

    await page.waitForFunction(() => {
      const identity = document.querySelector("#identity")?.textContent?.trim() || "";
      return identity.length > 0 && !identity.includes("Verifying");
    }, null, { timeout: 20000 });
    record("access_identity_resolved", true, "Admin identity resolved after Access authentication");

    const readEndpoints = [
      "/api/admin/headquarters",
      "/api/admin/radar",
      "/api/admin/intelligence",
      "/api/admin/validation",
      "/api/admin/overview",
      "/api/admin/assets",
      "/api/admin/findings",
      "/api/admin/audit",
      "/api/admin/repair-jobs"
    ];
    for (const endpoint of readEndpoints) {
      try {
        const apiResponse = await page.request.get(baseUrl + endpoint, { headers: accessHeaders, timeout: 20000 });
        const contentType = apiResponse.headers()["content-type"] || "";
        record(
          "read_api_" + endpoint.split("/").pop().replace(/[^a-z0-9-]/gi, "-"),
          apiResponse.status() === 200 && contentType.includes("application/json"),
          "HTTP " + apiResponse.status() + "; JSON=" + contentType.includes("application/json")
        );
      } catch {
        record("read_api_" + endpoint.split("/").pop().replace(/[^a-z0-9-]/gi, "-"), false, "Request failed");
      }
    }

    await page.waitForFunction(() => document.querySelector("#hq-storage")?.textContent === "Connected", null, { timeout: 20000 });
    record("headquarters_storage_connected", true, "Headquarters loaded the persistent registry");
    if (process.env.PAGES_BRANCH === "build/headquarters-mission-execution") {
      const engineResponse = await page.request.get(baseUrl + "/api/admin/headquarters", { headers: accessHeaders });
      const engineSnapshot = engineResponse.ok() ? await engineResponse.json() : null;
      record("private_engine_health", engineResponse.ok() && engineSnapshot?.engine_available === true,
        "Authenticated read-only service identity can see a healthy private mission engine");
      record("seven_brief_specialists", engineSnapshot?.specialists?.filter(a =>
        a.enabled === 1 && a.status === "ready" && a.autonomy_level === "recommend").length === 7,
        "Only seven recommendation specialists are enabled; engineering and QA still require verified runtimes");
    }
    if (process.env.PAGES_BRANCH === "build/headquarters-global-intelligence") {
      const researchResponse = await page.request.get(baseUrl + "/api/admin/intelligence", { headers: accessHeaders });
      const research = researchResponse.ok() ? await researchResponse.json() : null;
      record("intelligence_private_worker_health", researchResponse.ok() && research?.engine_available === true,
        "Private Research Worker is healthy through preview-only service binding");
      record("intelligence_live_source_provenance", Boolean(research?.ideas?.length) &&
        research.ideas.some(idea => idea.sources?.length && idea.sources.every(source => source.source_url?.startsWith("https://"))),
        "Stored hypotheses have legitimate public source links");
    }
    await page.locator('.nav-item[data-view="intelligence"]').click();
    await page.locator("#view-intelligence").waitFor({ state: "visible", timeout: 10000 });
    record("intelligence_workspace_rendered", await page.locator("#view-intelligence h1").count() === 1, "Protected research UI renders");
    await page.waitForFunction(() => document.querySelector("#intel-status-text")?.textContent?.includes("hypotheses stored"), null, { timeout: 20000 });
    record("intelligence_source_disclaimer", (await page.locator("#view-intelligence").innerText()).includes("not independently validated"), "Unverified evidence disclosed");
    await page.locator('.nav-item[data-view="headquarters"]').click();
    await page.locator('.nav-item[data-view="radar"]').click();
    await page.locator("#view-radar").waitFor({ state: "visible", timeout: 10000 });
    record("radar_workspace_rendered", await page.locator("#view-radar h1").count() === 1, "Opportunity Radar view is accessible");
    await page.waitForFunction(() => document.querySelector("#radar-status")?.textContent?.includes("stored first-party signals"), null, { timeout: 20000 });
    const radarContent = await page.locator("#view-radar").innerText();
    record("radar_source_provenance_disclosed", radarContent.includes("First-party evidence only"), "No fabricated external market intelligence");
    await page.locator('.nav-item[data-view="headquarters"]').click();
    await page.locator("#view-headquarters").waitFor({ state: "visible", timeout: 10000 });
    await page.locator("#hq-new").click();
    record("mission_composer_opens", await page.locator("#hq-compose").isVisible(), "New mission opens without submitting work");
    record("mission_specialists_loaded", await page.locator("#hq-agent option").count() === 9, "Nine persistent specialist definitions");
    await page.locator("#hq-close").click();
    await page.locator('.nav-item[data-view="departments"]').click();
    await page.locator("#hq-team article").first().waitFor({ state: "visible" });
    record("departments_rendered", await page.locator("#hq-team article").count() === 9, "Nine departments rendered");
    const markdown = await page.request.get(baseUrl + "/admin/", { headers: { ...accessHeaders, Accept: "text/markdown" } });
    record("headquarters_markdown", markdown.status() === 200 && markdown.headers()["content-type"]?.includes("text/markdown") && (await markdown.text()).includes("# YorpHives Headquarters"), "Authenticated Markdown representation");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#mobile-menu").click();
    await page.locator('.nav-item[data-view="headquarters"]').click();
    record("mobile_headquarters_navigation", await page.locator("#view-headquarters").isVisible(), "Mobile menu navigates and closes");
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    record("mobile_no_horizontal_overflow", fits, "Headquarters fits a 390px viewport");
    await page.setViewportSize({ width: 1440, height: 1000 });
    const deniedMission = await page.request.post(baseUrl + "/api/admin/headquarters", { headers: accessHeaders, data: {} });
    record("ci_mission_write_denied", deniedMission.status() === 403, "CI identity cannot create missions");

    const deniedWrite = await page.request.post(baseUrl + "/api/admin/repair-jobs", {
      headers: accessHeaders,
      data: { permission_probe: true, confirm: true },
      timeout: 15000
    });
    record("ci_service_token_write_denied", deniedWrite.status() === 403, "HTTP " + deniedWrite.status());
    record("github_permission_probe_control_present", await page.locator("#verify-github-permissions").count() === 1, "Owner-only permission probe control is present");

    const agentsNav = page.locator('.nav-item[data-view="agents"]');
    await agentsNav.click();
    await page.locator("#view-agents").waitFor({ state: "visible", timeout: 10000 });
    await page.locator("#agent-roster").waitFor({ state: "attached", timeout: 10000 });
    await page.waitForFunction(() => {
      const roster = document.querySelector("#agent-roster");
      return Boolean(roster && (roster.querySelector(".agent-card") || roster.textContent?.includes("No agent")));
    }, null, { timeout: 20000 });
    record("agent_operations_view_rendered", await page.locator("#agent-roster").count() === 1, "Agent registry view rendered");
    record("agent_cards_present", await page.locator("#agent-roster .agent-card").count() > 0, "Agent cards are present");

    const unauthenticated = await request.newContext({ baseURL: baseUrl, maxRedirects: 0 });
    try {
      const anonymousResponse = await unauthenticated.get("/api/admin/overview", { timeout: 15000 });
      const protectedStatus = [302, 303, 401, 403].includes(anonymousResponse.status());
      record("admin_api_requires_access", protectedStatus, "Unauthenticated HTTP " + anonymousResponse.status());
    } finally {
      await unauthenticated.dispose();
    }

    record("browser_page_errors", pageErrors.length === 0, pageErrors.length + " uncaught page errors");
  } catch (error) {
    record("admin_browser_flow", false, "Browser flow failed at: " + String(error?.message || error).split("\n")[0].slice(0,180));
  } finally {
    if (context) await context.close();
    await browser.close();
  }

  const report = {
    generated_at: new Date().toISOString(),
    target_host: parsedBase.hostname,
    summary: {
      total: checks.length,
      passed: checks.filter(item => item.ok).length,
      failed: failures.length
    },
    checks
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary));
  if (failures.length) console.warn("Admin smoke failures: " + JSON.stringify(failures.map(item => ({ name: item.name, detail: item.detail }))));
  if (failures.length) process.exitCode = 1;
}

await run();
