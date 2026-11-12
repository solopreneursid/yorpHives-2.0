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
      "/api/admin/demand",
      "/api/admin/traffic-evidence",
      "/api/admin/market-sources",
      "/api/admin/next-actions",
      "/api/admin/tool-activity",
      "/api/admin/business-intelligence",
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

    // Verify the real private D1 schema before installing synthetic browser GET fixtures.
    const repairLinksResponse = await page.request.get(baseUrl + "/api/admin/repair-jobs", {
      headers: accessHeaders, timeout: 20000
    });
    const repairLinksSnapshot = repairLinksResponse.ok() ? await repairLinksResponse.json().catch(() => null) : null;
    record("staging_asset_repair_schema_ready",
      repairLinksResponse.status() === 200 && repairLinksSnapshot?.finding_links_ready === true,
      "Private staging D1 migration 0022 is live and the Admin API acknowledges source-qualified repair links");

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
    await page.locator('.nav-item[data-view="business"]').click();
    await page.locator("#view-business").waitFor({ state: "visible", timeout: 10000 });
    await page.waitForFunction(() => document.querySelector("#bi-status")?.textContent?.includes("candidates"), null, { timeout: 20000 });
    record("business_intelligence_board", await page.locator("#bi-list").count() === 1,
      "Source-qualified business board renders behind Cloudflare Access");
    record("business_missing_integrations_explicit", (await page.locator("#bi-sources").innerText()).includes("Search Console"),
      "Unavailable Search Console evidence is visible instead of fabricated");
    record("business_owner_review_requires_human", await page.locator("#bi-review-dialog").count() === 1,
      "Owner review form is present but CI does not mutate opportunity status");
    await page.locator('.nav-item[data-view="demand"]').click();

    await page.locator("#view-demand").waitFor({ state: "visible", timeout: 10000 });
    await page.waitForFunction(() => document.querySelector("#demand-status-line")?.textContent?.includes("opportunities"), null, { timeout: 20000 });
    record("demand_explorer_visible", await page.locator("#view-demand h1").count() === 1, "Open-ended Market Explorer is accessible");
    record("demand_categories_are_optional", (await page.locator("#view-demand").innerText()).includes("Categories are examples, not limits"), "No fixed sector ceiling");
    await page.waitForFunction(() => document.querySelector("#traffic-availability")?.textContent?.includes("Cloudflare"), null, { timeout: 20000 });
    record("tool_completion_and_agent_activity_panel",
      await page.locator("#activity-list").count() === 1,
      "Client-reported and authenticated agent execution metrics are visually separated");
    record("headquarters_decision_queue", await page.locator("#hq-next-actions").count() === 1,
      "Evidence-backed founder actions are visible without authorizing product releases");
    record("first_party_traffic_evidence_ui", await page.locator("#traffic-rows").count() === 1,
      "First-party request evidence is available without granting mutation rights to CI");
    await page.locator('.nav-item[data-view="headquarters"]').click();
    await page.locator('.nav-item[data-view="intelligence"]').click();
    await page.locator("#view-intelligence").waitFor({ state: "visible", timeout: 10000 });
    record("intelligence_workspace_rendered", await page.locator("#view-intelligence h1").count() === 1, "Protected research UI renders");
    await page.waitForFunction(() => document.querySelector("#intel-status-text")?.textContent?.includes("hypotheses stored"), null, { timeout: 20000 });
    record("intelligence_source_disclaimer", (await page.locator("#view-intelligence").innerText()).includes("not independently validated"), "Unverified evidence disclosed");
    const proposalCards = await page.locator("#intel-ideas .intel-card").count();
    const experimentPanels = await page.locator("#intel-ideas .hq-val-section").count();
    record("intelligence_validation_lab_inline",
      proposalCards > 0 && experimentPanels === proposalCards,
      "Each product hypothesis has a source-independent validation panel, without performing a mutation");
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
    const invalidQa = await page.request.get(baseUrl + "/api/admin/repair-qa?job_id=invalid", {
      headers: accessHeaders, timeout: 15000
    });
    record("repair_qa_private_route_responds",
      invalidQa.status() === 400 &&
      (invalidQa.headers()["content-type"] || "").includes("application/json"),
      "Authenticated read-only QA route validates job IDs without recording a review");
    const deniedQaWrite = await page.request.post(baseUrl + "/api/admin/repair-qa", {
      headers: accessHeaders, data: {
        job_id: "123e4567-e89b-42d3-a456-426614174000",
        reproduction_status: "reproduced", fix_status: "passed", regression_status: "passed",
        evidence: "CI service identity must never write QA observations or publish releases."
      }, timeout: 15000
    });
    record("ci_qa_write_denied", deniedQaWrite.status() === 403,
      "Read-only CI token cannot submit issue-specific QA; HTTP " + deniedQaWrite.status());

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

    // Read-only, browser-local fixture: exercises the actual incident UI without
    // creating findings, dispatching AI, or changing staging D1 records.
    const sampleFinding = {
      id: "preview-incident-fixture", title: "Preview-only tool failure",
      severity: "high", details: "Synthetic preview QA: expected output not produced.",
      status: "open", first_detected: "2026-11-12T00:00:00Z",
      last_verified: "2026-11-12T00:10:00Z", resolved_at: null,
      monitor_name: "Synthetic tool", monitor_url: "https://yorphives.com/free-tools/",
      environment: "staging-fixture", source_type: "asset",
      recommendation: "Reproduce in isolated preview and verify expected output."
    };
    await page.route("**/api/admin/findings*", async route => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [sampleFinding] }) });
    });
    let unexpectedRepairWrites = 0;
    await page.route("**/api/admin/repair-jobs", async route => {
      if (route.request().method() !== "GET") {
        unexpectedRepairWrites += 1;
        await route.fulfill({ status: 405, contentType: "application/json", body: '{"error":"No repair dispatch is allowed in smoke tests."}' });
        return;
      }
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          data: [{ id: "preview-repair-fixture", finding_id: sampleFinding.id, finding_source: "asset",
            request_text: "Investigate synthetic failure", status: "needs_review",
            result_summary: "Synthetic preview result only; no actual repair.",
            updated_at: "2026-11-12T00:15:00Z",
            pull_request_url: "https://github.com/solopreneursid/yorpHives-2.0/pull/22" }],
          finding_links_ready: true, agentConfigured: false, agents: [], summary: {}
        })
      });
    });
    await page.route("**/api/admin/repair-qa?**", async route => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          job_id: "preview-repair-fixture", qa: null,
          revision_status: "not_reviewed", issue_specific_qa_complete: false,
          production_approved: false,
          note: "No issue-specific QA evidence recorded."
        })
      });
    });
    await page.locator('.nav-item[data-view="issues"]').click();
    await page.locator('#view-issues').waitFor({ state: "visible", timeout: 10000 });
    await page.getByRole("button", { name: "View incident evidence for Preview-only tool failure" }).click();
    record("incident_dialog_accessible",
      await page.getByRole("dialog", { name: "Preview-only tool failure" }).isVisible(),
      "Authenticated founder sees an accessible incident dialog");
    record("incident_evidence_present",
      (await page.locator("#incident-evidence").innerText()).includes("Synthetic preview QA"),
      "Finding evidence is rendered as text, not executable HTML");
    await page.locator("#incident-related .incident-repair").first().waitFor({ state: "visible", timeout: 10000 });
    record("incident_linked_repair_history",
      (await page.locator("#incident-related").innerText()).includes("Synthetic preview result"),
      "Related repair history is visible without owner mutations");
    await page.getByRole("button", { name: "Record issue-specific QA" }).click();
    record("repair_qa_dialog_accessible",
      await page.getByRole("dialog", { name: "Verify repair outcome" }).isVisible(),
      "Authenticated founder sees a dedicated revision-specific QA form");
    record("repair_qa_clear_separate_approval",
      (await page.locator("#repair-qa-dialog").innerText()).includes("This never publishes a release") &&
      (await page.locator("#repair-qa-status").innerText()).includes("No issue-specific QA"),
      "QA testing is separate from production approval; CI never submits QA evidence");
    await page.locator("#repair-qa-close").click();
    await page.locator("#incident-prepare").click();
    await page.locator("#view-agents").waitFor({ state: "visible", timeout: 10000 });
    const repairRequestValue = await page.locator("#repair-request").inputValue();
    const selectedFindingValue = await page.locator("#repair-finding").inputValue();
    const repairStatusValue = await page.locator("#repair-message").innerText();
    const linked = selectedFindingValue === sampleFinding.id && repairStatusValue.includes("Finding linked");
    const safeGeneralFallback = selectedFindingValue === "" && repairStatusValue.includes("general investigation");
    const preparedChecks = {
      title: repairRequestValue.includes("Preview-only tool failure"),
      finding_id: repairRequestValue.includes(sampleFinding.id),
      safe_selected_or_general_fallback: linked || safeGeneralFallback,
      no_repair_http_writes: unexpectedRepairWrites === 0
    };
    record("incident_prepare_does_not_dispatch",
      Object.values(preparedChecks).every(Boolean),
      "Synthetic findings absent from live selectable inventory must fall back to general investigation; no repair POST. " +
      JSON.stringify(preparedChecks) + "; options: " + await page.locator("#repair-finding option").count());
    await page.unroute("**/api/admin/findings*");
    await page.unroute("**/api/admin/repair-jobs");
    await page.unroute("**/api/admin/repair-qa?**");

    // Release evidence UI is read-only; browser route fixtures cannot mark
    // production approved or issue any deployment and are never persisted.
    await page.route("**/api/admin/release-evidence", async route => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          schema_version: 1,
          generated_at: "2026-11-12T13:30:00Z",
          scope: "most_recent_25_repairs",
          production_approved: false,
          production_deployment_enabled: false,
          counts: { repairs: 1, ci_attested: 1, qa_recorded: 0, production_authorized: 0 },
          repairs: [{
            job_id: "123e4567-e89b-42d3-a456-426614174000",
            job_status: "needs_review",
            title: "Synthetic preview repair verification",
            updated_at: "2026-11-12T13:15:00Z",
            ci_verified: true,
            qa_recorded_for_ci_revision: false,
            live_revision_verified: false,
            production_approved: false,
            pull_request_url: "https://github.com/solopreneursid/yorpHives-2.0/pull/26",
            blockers: ["Independent founder QA remains outstanding.", "Exact owner production authorization is not granted."]
          }]
        })
      });
    });
    await page.locator('.nav-item[data-view="releases"]').click();
    await page.locator("#view-releases").waitFor({ state: "visible", timeout: 10000 });
    await page.locator(".release-evidence-card").first().waitFor({ state: "visible", timeout: 10000 });
    record("release_evidence_board_founder_visible",
      (await page.locator("#release-evidence-summary").innerText()).includes("Recent investigations") &&
      (await page.locator("#release-evidence-list").innerText()).includes("Synthetic preview repair verification"),
      "First-party release evidence appears in the founder workspace");
    record("release_evidence_no_implicit_production_approval",
      (await page.locator("#view-releases").innerText()).includes("Production remains locked") &&
      (await page.locator("#release-evidence-list").innerText()).includes("PRODUCTION LOCKED") &&
      (await page.locator("#view-releases button").allTextContents()).every(label => !/deploy|publish|release to production/i.test(label)),
      "Release status is explanatory only; no publishing action is enabled");
    await page.unroute("**/api/admin/release-evidence");

    const unauthenticated = await request.newContext({ baseURL: baseUrl, maxRedirects: 0 });
    try {
      const anonymousResponse = await unauthenticated.get("/api/admin/overview", { timeout: 15000 });
      const protectedStatus = [302, 303, 401, 403].includes(anonymousResponse.status());
      record("admin_api_requires_access", protectedStatus, "Unauthenticated HTTP " + anonymousResponse.status());
      const anonymousQa = await unauthenticated.get("/api/admin/repair-qa?job_id=invalid", { timeout: 15000 });
      record("repair_qa_requires_cloudflare_access",
        [302, 303, 401, 403].includes(anonymousQa.status()),
        "Anonymous QA request denied by Access: HTTP " + anonymousQa.status());
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
