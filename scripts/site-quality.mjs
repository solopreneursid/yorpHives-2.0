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
  const toolResults = [];
  let failedTools = [];
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
    async function checkToolPage() {
      while (toolCursor < toolManifest.length) {
        const tool = toolManifest[toolCursor++];
        const toolPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const pageErrorsForTool = [];
        const consoleErrors = [];
        const failedRequests = [];
        const httpErrors = [];
        const startedAt = Date.now();
        let responseStatus = 0;
        let finalUrl = "";
        let rootCount = 0;
        let visibleRootCount = 0;
        let controls = 0;
        let visibleControls = 0;
        let heading = "";
        let stage = "navigation";
        toolPage.on("pageerror", error => pageErrorsForTool.push(error.message.slice(0, 500)));
        toolPage.on("console", message => {
          if (message.type() === "error") consoleErrors.push(message.text().slice(0, 500));
        });
        toolPage.on("requestfailed", request => {
          let target = "";
          try {
            const url = new URL(request.url());
            target = url.origin + url.pathname;
          } catch { target = "unparseable-request-url"; }
          failedRequests.push({ url: target, error: (request.failure()?.errorText || "request failed").slice(0, 250) });
        });
        toolPage.on("response", item => {
          if (item.status() >= 400) {
            let target = "";
            try {
              const url = new URL(item.url());
              target = url.origin + url.pathname;
            } catch { target = "unparseable-response-url"; }
            httpErrors.push({ url: target, status: item.status() });
          }
        });
        try {
          const response = await toolPage.goto(absolute(tool.url), { waitUntil: "domcontentloaded", timeout: 25000 });
          responseStatus = response?.status() || 0;
          finalUrl = toolPage.url();
          stage = "tool-root";
          // Tool pages use several real root contracts: legacy #tool-app/#advanced-tool,
          // image #image-tool, research #research-tool, and newer #next-tool.
          // Prefer the explicit data-tool contract so the smoke test follows the page itself.
          const rootSelector = "main [data-tool], main #tool-app, main #advanced-tool, main .tool-workspace";
          const visibleRootSelector = "main [data-tool]:visible, main #tool-app:visible, main #advanced-tool:visible, main .tool-workspace:visible";
          rootCount = await toolPage.locator(rootSelector).count();
          visibleRootCount = await toolPage.locator(visibleRootSelector).count();
          const root = toolPage.locator(visibleRootSelector).first();
          try {
            await root.waitFor({ state: "visible", timeout: 5000 });
          } catch {}
          visibleRootCount = await toolPage.locator(visibleRootSelector).count();
          stage = "interactive-controls";
          const controlSelector = "input:not([type=hidden]), textarea, select, button, [role=button], a.button";
          controls = await root.locator(controlSelector).count().catch(() => 0);
          try {
            await root.locator("input:not([type=hidden]):visible, textarea:visible, select:visible, button:visible, [role=button]:visible, a.button:visible").first().waitFor({ state: "visible", timeout: 5000 });
          } catch {}
          visibleControls = await root.locator("input:not([type=hidden]):visible, textarea:visible, select:visible, button:visible, [role=button]:visible, a.button:visible").count().catch(() => 0);
          let keyboardFocusable = false;
          if (visibleControls > 0) {
            const firstControl = root.locator("input:not([type=hidden]):visible, textarea:visible, select:visible, button:visible, [role=button]:visible, a.button:visible").first();
            keyboardFocusable = await firstControl.evaluate(element => {
              element.focus();
              return document.activeElement === element;
            }).catch(() => false);
          }
          const hiddenVisibleCount = await toolPage.locator("main [hidden]:visible").count();
          stage = "primary-heading";
          heading = (await toolPage.locator("main h1").first().textContent().catch(() => "")) || "";
          const ok = responseStatus === 200 && visibleRootCount > 0 && visibleControls > 0 && keyboardFocusable && hiddenVisibleCount === 0 && Boolean(heading.trim()) && pageErrorsForTool.length === 0;
          const result = {
            slug: tool.slug, title: tool.title, path: tool.url, status: responseStatus, final_url: finalUrl,
            root_count: rootCount, visible_root_count: visibleRootCount,
            control_count: controls, visible_control_count: visibleControls, keyboard_focusable: keyboardFocusable,
            hidden_elements_visible: hiddenVisibleCount,
            primary_heading_present: Boolean(heading.trim()),
            page_errors: pageErrorsForTool, console_errors: consoleErrors,
            failed_requests: failedRequests, http_errors: httpErrors,
            duration_ms: Date.now() - startedAt, ok
          };
          if (!ok) {
            await mkdir(`${reportDir}/tool-page-failures`, { recursive: true });
            result.screenshot = `tool-page-failures/${tool.slug}.png`;
            await toolPage.screenshot({ path: `${reportDir}/${result.screenshot}`, fullPage: true, timeout: 10000 }).catch(error => {
              result.screenshot_error = error instanceof Error ? error.message.slice(0, 250) : String(error);
            });
          }
          toolResults.push(result);
        } catch (error) {
          const result = {
            slug: tool.slug, title: tool.title, path: tool.url, status: responseStatus,
            final_url: toolPage.url(), stage, root_count: rootCount,
            visible_root_count: visibleRootCount, control_count: controls,
            visible_control_count: visibleControls, keyboard_focusable: false, hidden_elements_visible: null, primary_heading_present: Boolean(heading.trim()),
            page_errors: pageErrorsForTool, console_errors: consoleErrors,
            failed_requests: failedRequests, http_errors: httpErrors,
            duration_ms: Date.now() - startedAt,
            error: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
            ok: false
          };
          await mkdir(`${reportDir}/tool-page-failures`, { recursive: true });
          result.screenshot = `tool-page-failures/${tool.slug}.png`;
          await toolPage.screenshot({ path: `${reportDir}/${result.screenshot}`, fullPage: true, timeout: 10000 }).catch(screenshotError => {
            result.screenshot_error = screenshotError instanceof Error ? screenshotError.message.slice(0, 250) : String(screenshotError);
          });
          toolResults.push(result);
        } finally {
          await toolPage.close();
        }
      }
    }
    await Promise.all(Array.from({ length: 4 }, checkToolPage));
    failedTools = toolResults.filter(item => !item.ok);
    const failureSummary = failedTools.map(item => {
      const reasons = [];
      if (item.status !== 200) reasons.push(`HTTP ${item.status}`);
      if (!item.visible_root_count) reasons.push("tool root not visible");
      if (!item.visible_control_count) reasons.push("no visible controls");
      if (!item.keyboard_focusable) reasons.push("no keyboard-focusable control");
      if (item.hidden_elements_visible > 0) reasons.push(item.hidden_elements_visible + " hidden elements are visible");
      if (!item.primary_heading_present) reasons.push("main h1 missing");
      if (item.page_errors?.length) reasons.push(`pageerror: ${item.page_errors.join(" | ")}`);
      if (item.console_errors?.length) reasons.push(`console: ${item.console_errors.slice(0, 2).join(" | ")}`);
      if (item.failed_requests?.length) reasons.push(`failed requests: ${item.failed_requests.slice(0, 3).map(request => request.url + " (" + request.error + ")").join(", ")}`);
      if (item.http_errors?.length) reasons.push(`HTTP errors: ${item.http_errors.slice(0, 3).map(response => response.status + " " + response.url).join(", ")}`);
      if (item.error) reasons.push(`${item.stage || "render"}: ${item.error}`);
      return `${item.slug}: ${reasons.join("; ") || "interactive rendering contract failed"}`;
    });
    record("all_free_tools_render_and_controls", failedTools.length === 0,
      failureSummary.join("\\n") || `${toolResults.length} tools loaded with visible controls and no uncaught page errors`);

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

  // Keep tool-level diagnostics in the artifact so failures can be investigated without rerunning locally.
  // No form values or page body text are collected; only structural and browser diagnostics are stored.
  const report = {
    generated_at: new Date().toISOString(),
    base_url: baseUrl,
    summary: { total: checks.length, passed: checks.filter(item => item.ok).length, failed: failures.length },
    checks: checks.map(item => ({ name: item.name, ok: Boolean(item.ok), detail: item.detail })),
    sitemap_pages: {
      checked: sitemapResults.length,
      failed: sitemapResults.filter(item => !item.ok).length
    },
    tool_pages: {
      checked: toolResults.length,
      failed: toolResults.filter(item => !item.ok).length,
      results: toolResults
    },
    broken_internal_links: { checked: internalLinks.size, failed: linkResults.length },
    failures: failures.map(item => ({ name: item.name, detail: item.detail }))
  };
  await writeFile(`${reportDir}/site-quality.json`, JSON.stringify(report, null, 2));
  await writeFile(`${reportDir}/site-quality.md`, [
    "# YorpHives site quality report",
    "",
    `Generated: ${report.generated_at}`,
    `Target: ${report.base_url}`,
    `Result: ${report.summary.passed}/${report.summary.total} checks passed`,
    "",
    "| Check | Result | Details |",
    "| --- | --- | --- |",
    ...report.checks.map(item => `| ${item.name} | ${item.ok ? "PASS" : "FAIL"} | ${item.detail} |`),
    "",
    `Sitemap pages checked: ${report.sitemap_pages.checked}; failed: ${report.sitemap_pages.failed}.`,
    `Tool pages checked: ${report.tool_pages.checked}; failed: ${report.tool_pages.failed}.`,
    "",
    "## Individual tool-page diagnostics",
    "",
    ...toolResults.map(item => {
      const reasons = [];
      if (item.status !== 200) reasons.push(`HTTP ${item.status}`);
      if (!item.visible_root_count) reasons.push("root not visible");
      if (!item.visible_control_count) reasons.push("no visible controls");
      if (!item.keyboard_focusable) reasons.push("no keyboard-focusable control");
      if (item.hidden_elements_visible > 0) reasons.push(item.hidden_elements_visible + " hidden elements are visible");
      if (!item.primary_heading_present) reasons.push("main h1 missing");
      if (item.page_errors?.length) reasons.push(`page errors: ${item.page_errors.join(" | ")}`);
      if (item.console_errors?.length) reasons.push(`console errors: ${item.console_errors.slice(0, 3).join(" | ")}`);
      if (item.failed_requests?.length) reasons.push(`failed requests: ${item.failed_requests.map(request => request.url + " (" + request.error + ")").join(", ")}`);
      if (item.http_errors?.length) reasons.push(`HTTP errors: ${item.http_errors.map(response => response.status + " " + response.url).join(", ")}`);
      if (item.error) reasons.push(item.error);
      return `- ${item.ok ? "PASS" : "FAIL"} **${item.slug}** — ${reasons.join("; ") || "rendered successfully"}`;
    }),
    "",
    `Internal links checked: ${report.broken_internal_links.checked}; failed: ${report.broken_internal_links.failed}.`,
    ""
  ].join("\n"));
  console.log(JSON.stringify(report.summary));
  console.log("Free Tools page sweep: " + toolResults.length + " checked, " + failedTools.length + " failed.");
  for (const item of failedTools) {
    console.error("[tool-page-failure] " + JSON.stringify({
      slug: item.slug, path: item.path, status: item.status, stage: item.stage || null,
      root_count: item.root_count, visible_root_count: item.visible_root_count,
      control_count: item.control_count, visible_control_count: item.visible_control_count,
      keyboard_focusable: item.keyboard_focusable,
      hidden_elements_visible: item.hidden_elements_visible,
      primary_heading_present: item.primary_heading_present, page_errors: item.page_errors,
      console_errors: item.console_errors, failed_requests: item.failed_requests,
      http_errors: item.http_errors, error: item.error, screenshot: item.screenshot
    }));
  }
  if (failures.length) process.exitCode = 1;
}

await run();
