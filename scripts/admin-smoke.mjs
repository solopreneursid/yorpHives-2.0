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

    await page.locator("#view-overview").waitFor({ state: "visible", timeout: 15000 });
    record("admin_shell_rendered", await page.locator(".app-shell").count() === 1, "Admin application shell exists");
    record("admin_heading_rendered", await page.locator("#view-overview h1").textContent().then(value => Boolean(value?.trim())), "Overview heading is present");

    await page.waitForFunction(() => {
      const identity = document.querySelector("#identity")?.textContent?.trim() || "";
      return identity.length > 0 && !identity.includes("Verifying");
    }, null, { timeout: 20000 });
    record("access_identity_resolved", true, "Admin identity resolved after Access authentication");

    const readEndpoints = [
      "/api/admin/overview",
      "/api/admin/assets",
      "/api/admin/findings",
      "/api/admin/audit",
      "/api/admin/repair-jobs"
    ];
    for (const endpoint of readEndpoints) {
      try {
        const apiResponse = await page.request.get(baseUrl + endpoint, { timeout: 20000 });
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

    const agentsNav = page.locator('.nav-item[data-view="agents"]');
    await agentsNav.click();
    await page.locator("#view-agents").waitFor({ state: "visible", timeout: 10000 });
    await page.locator("#agent-roster").waitFor({ state: "attached", timeout: 10000 });
    await page.waitForFunction(() => {
      const roster = document.querySelector("#agent-roster");
      return Boolean(roster && (roster.children.length > 0 || roster.textContent?.includes("No agent")));
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
    record("admin_browser_flow", false, "Browser flow failed; inspect the workflow step for the failure location.");
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
  if (failures.length) process.exitCode = 1;
}

await run();
