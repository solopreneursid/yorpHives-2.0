import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const baseUrl = (process.env.SITE_BASE_URL || "https://yorphives.com").replace(/\/$/, "");
const reportDir = process.env.REPORT_DIR || "artifacts";
const failures = [];
const checks = [];
const record = (name, ok, detail = "") => {
  checks.push({ name, ok, detail });
  if (!ok) failures.push({ name, detail });
};
const absolute = (path) => new URL(path, baseUrl).toString();

async function request(path) {
  const response = await fetch(absolute(path), { redirect: "manual", signal: AbortSignal.timeout(12000) });
  return response;
}

async function run() {
  await mkdir(reportDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  try {
    const home = await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
    record("homepage_http", home?.status() === 200, String(home?.status()));
    record("homepage_h1", await page.locator("h1").count() > 0, "Expected a visible primary heading");
    record("homepage_navigation", await page.locator('nav a[href="/free-tools/"]').count() > 0, "Free Tools navigation link");

    const tools = await page.goto(absolute("/free-tools/"), { waitUntil: "domcontentloaded", timeout: 30000 });
    record("free_tools_http", tools?.status() === 200, String(tools?.status()));
    const search = page.locator("#tool-search");
    await search.fill("json formatter");
    const jsonCard = page.locator('[data-tool-card][href="/free-tools/json-formatter/"]');
    record("free_tools_search", await jsonCard.isVisible(), "Searching JSON Formatter should retain its matching card");
    record("free_tools_search_filters", await page.locator("[data-tool-card]:visible").count() === 1, "Search should filter to one exact matching tool");
    await jsonCard.click();
    await page.waitForURL("**/free-tools/json-formatter/");
    await page.locator("#tool-app .tool-form").waitFor({ state: "visible", timeout: 15000 });
    const jsonInput = page.locator('#tool-app textarea[name="text"]');
    await jsonInput.fill('{"yorphives":{"status":"ok","count":3}}');
    await page.getByRole("button", { name: /run tool/i }).click();
    const output = page.locator("#tool-result");
    await page.waitForFunction(() => document.querySelector("#tool-result")?.textContent?.includes('"status": "ok"'), null, { timeout: 10000 });
    record("json_formatter_execution", (await output.textContent()).includes('"count": 3'), "Tool should parse and pretty-print JSON in-browser");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(absolute("/free-tools/"), { waitUntil: "domcontentloaded" });
    const menu = page.getByRole("button", { name: /open navigation/i });
    if (await menu.count()) {
      await menu.click();
      record("mobile_navigation", await page.locator("#mobile-nav").isVisible(), "Mobile navigation should open");
    } else {
      record("mobile_navigation", false, "Mobile menu button not found");
    }
    const manifestResponse = await request("/free-tools/manifest.json");
    record("tool_manifest_http", manifestResponse.status === 200, String(manifestResponse.status));
    const toolManifest = await manifestResponse.json();
    record("tool_manifest_valid", Array.isArray(toolManifest) && toolManifest.length >= 1, Array.isArray(toolManifest) ? toolManifest.length + " tools listed" : "Manifest was not an array");

    let toolCursor = 0;
    const toolResults = [];
    async function checkToolPage() {
      while (toolCursor < toolManifest.length) {
        const tool = toolManifest[toolCursor++];
        const toolPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const errors = [];
        toolPage.on("pageerror", error => errors.push(error.message));
        try {
          const response = await toolPage.goto(absolute(tool.url), { waitUntil: "domcontentloaded", timeout: 25000 });
          const root = toolPage.locator("#tool-app, #advanced-tool").first();
          await root.waitFor({ state: "visible", timeout: 12000 });
          await root.locator("input, textarea, select, button").first().waitFor({ state: "attached", timeout: 12000 });
          const controls = await root.locator("input, textarea, select, button").count();
          const heading = await toolPage.locator("main h1").first().textContent().catch(() => "");
          toolResults.push({
            slug: tool.slug,
            title: tool.title,
            status: response?.status() || 0,
            root: await root.count() > 0,
            controls,
            heading: Boolean(heading?.trim()),
            page_errors: errors,
            ok: response?.status() === 200 && controls > 0 && Boolean(heading?.trim()) && errors.length === 0
          });
        } catch (error) {
          toolResults.push({ slug: tool.slug, title: tool.title, status: 0, controls: 0, ok: false, error: error instanceof Error ? error.message : String(error), page_errors: errors });
        } finally {
          await toolPage.close();
        }
      }
    }
    await Promise.all(Array.from({ length: 4 }, checkToolPage));
    const failedTools = toolResults.filter(item => !item.ok);
    record("all_free_tools_render_and_controls", failedTools.length === 0,
      failedTools.slice(0, 20).map(item => item.slug + ": " + (item.error || "HTTP " + item.status + ", controls " + item.controls + ", JS errors " + item.page_errors.join("|"))).join("; ") ||
      toolResults.length + " tools loaded with an interactive control and no page errors");

    record("browser_console_errors", pageErrors.length === 0, pageErrors.join(" | "));
  } catch (error) {
    record("browser_flow_unhandled_error", false, error instanceof Error ? error.message : String(error));
  } finally {
    await browser.close();
  }

  const sitemapResponse = await request("/sitemap.xml");
  record("sitemap_http", sitemapResponse.status === 200, String(sitemapResponse.status));
  const sitemap = await sitemapResponse.text();
  const urls = [...sitemap.matchAll(/<loc>(https:\/\/yorphives\.com[^<]+)<\/loc>/g)].map(match => new URL(match[1]).pathname);
  record("sitemap_xml_entries", urls.length >= 5, `${urls.length} URLs found`);

  const robotsResponse = await request("/robots.txt");
  const robots = await robotsResponse.text();
  record("robots_sitemap_reference", robotsResponse.status === 200 && robots.includes("/sitemap.xml"), `HTTP ${robotsResponse.status}`);

  let cursor = 0;
  const sitemapResults = [];
  async function worker() {
    while (cursor < urls.length) {
      const path = urls[cursor++];
      try {
        const response = await request(path);
        const html = response.headers.get("content-type")?.includes("text/html");
        const body = html ? await response.text() : "";
        const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
        const description = body.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] || "";
        const canonical = body.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] || "";
        const ok = response.status === 200 && html && title.length > 0 && description.length > 0 && canonical.length > 0;
        sitemapResults.push({ path, status: response.status, title: Boolean(title), description: Boolean(description), canonical: Boolean(canonical), ok });
      } catch (error) {
        sitemapResults.push({ path, status: 0, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker));
  const broken = sitemapResults.filter(item => !item.ok);
  record("sitemap_pages_http_and_metadata", broken.length === 0, broken.slice(0, 15).map(item => `${item.path}: HTTP ${item.status}`).join("; ") || `${sitemapResults.length} pages passed`);

  const internalLinks = new Set(["/", "/free-tools/", "/explore/", "/builder/", "/connect/", "/llms.txt"]);
  const freeToolsHtml = await (await request("/free-tools/")).text();
  for (const match of freeToolsHtml.matchAll(/href=["'](\/[^"'#?]*)(?:[?#][^"']*)?["']/g)) internalLinks.add(match[1]);
  const linkResults = [];
  for (const path of [...internalLinks].slice(0, 100)) {
    try {
      const response = await request(path);
      if (response.status >= 400) linkResults.push({ path, status: response.status });
    } catch {
      linkResults.push({ path, status: 0 });
    }
  }
  record("internal_navigation_links", linkResults.length === 0, linkResults.slice(0, 20).map(item => `${item.path}: ${item.status}`).join("; ") || `${internalLinks.size} links passed`);

  const report = {
    generated_at: new Date().toISOString(),
    base_url: baseUrl,
    summary: { total: checks.length, passed: checks.filter(item => item.ok).length, failed: failures.length },
    checks,
    sitemap_pages: sitemapResults,\n    tool_pages: toolResults,
    broken_internal_links: linkResults,
    failures
  };
  await writeFile(`${reportDir}/site-quality.json`, JSON.stringify(report, null, 2));
  await writeFile(`${reportDir}/site-quality.md`, [
    "# YorpHives site quality report",
    "",
    `Generated: ${report.generated_at}`,
    `Target: ${baseUrl}`,
    `Result: ${report.summary.passed}/${report.summary.total} checks passed`,
    "",
    "| Check | Result | Details |",
    "| --- | --- | --- |",
    ...checks.map(item => `| ${item.name} | ${item.ok ? "PASS" : "FAIL"} | ${item.detail.replaceAll("|", "\\|")} |`),
    ""
  ].join("\n"));
  console.log(JSON.stringify(report.summary));
  if (failures.length) process.exitCode = 1;
}

await run();
