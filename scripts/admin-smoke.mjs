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
  // Log only checkpoint names and pass/fail, never private API payloads,
  // Cloudflare Access credentials, owner emails, OTPs or business evidence.
  console.log(JSON.stringify({ checkpoint: result.name, ok: result.ok }));
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

    // Layout review for the screenshot-reported issues. This check changes
    // browser presentation only: no tasks, approvals or paid work are launched.
    const compactStart = await page.evaluate(() => ({
      styleLoaded: [...document.styleSheets].some(sheet =>
        String(sheet.href||"").includes("headquarters-refined.css")),
      navigationGroups: document.querySelectorAll("#sidebar details.sidebar-group").length,
      ownerTitle: document.querySelector("#founder-welcome")?.textContent?.trim(),
      mainWidth: Math.round(document.querySelector(".main-area")?.getBoundingClientRect().width||0),
      viewport: innerWidth
    }));
    record("compact_styling_and_organized_sidebar",
      compactStart.styleLoaded && compactStart.navigationGroups===2 &&
      compactStart.ownerTitle?.includes("Headquarters") &&
      compactStart.mainWidth>0 && compactStart.mainWidth<=compactStart.viewport,
      "Unified styling, two optional navigation groups and a founder-first home");
    const palette = await page.evaluate(() => {
      const themeLoaded=[...document.styleSheets].some(sheet=>
        String(sheet.href||"").includes("headquarters-prism-theme.css"));
      const mark=document.querySelector(".sidebar .brand .brand-mark");
      const hero=document.querySelector(".founder-command");
      const active=document.querySelector('.nav-item[data-view="headquarters"]');
      return {
        themeLoaded,
        background: getComputedStyle(document.body).backgroundImage,
        markBackground: mark?getComputedStyle(mark).backgroundImage:"",
        markFilter: mark?getComputedStyle(mark).filter:"",
        heroBackground: hero?getComputedStyle(hero).backgroundImage:"",
        activeBackground: active?getComputedStyle(active).backgroundImage:"",
        hasBackgroundGrid: getComputedStyle(document.body,"::before").backgroundImage.includes("linear-gradient")
      };
    });
    record("prism_brand_ambient_theme_without_logo_changes",
      palette.themeLoaded &&
      palette.background.includes("radial-gradient") &&
      palette.markBackground.includes("yorphives-logo.webp") &&
      palette.markFilter==="none" &&
      palette.heroBackground.includes("radial-gradient") &&
      palette.activeBackground.includes("linear-gradient") &&
      palette.hasBackgroundGrid,
      "The official mark remains untouched; native gradient lighting, grid and selected navigation render correctly");


    // Reproduce the original screenshot's retained scroll position:
    // switching from a very long view must open the new page at its top.
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await page.locator("#nav-group-explore > summary").click();
    await page.locator('.nav-item[data-view="intelligence"]').click();
    await page.locator("#view-intelligence").waitFor({state:"visible",timeout:10000});
    const researchLayout = await page.evaluate(() => ({
      top: window.scrollY,
      explored: document.querySelector("#nav-group-explore")?.open===true,
      ideasOverflow: getComputedStyle(document.querySelector("#intel-ideas")).overflowY,
      sidebarOverflow: getComputedStyle(document.querySelector(".intel-sidebar")).overflowY,
      breadcrumb: document.querySelector("#breadcrumb")?.textContent||""
    }));
    record("research_page_scroll_reset_and_balanced_columns",
      researchLayout.top===0 && researchLayout.explored &&
      researchLayout.ideasOverflow==="auto" &&
      researchLayout.sidebarOverflow==="auto" &&
      researchLayout.breadcrumb.includes("Global Intelligence"),
      "Switching pages resets scroll; independent idea and research panels remain readable");

    await page.locator('.nav-item[data-view="issues"]').click();
    await page.locator("#view-issues").waitFor({state:"visible",timeout:10000});
    const problemsLayout = await page.evaluate(() => {
      const viewport=document.querySelector("#view-issues .hq-issue-workspace .table-wrap");
      const style=viewport?getComputedStyle(viewport):null;
      return {top:window.scrollY,
        region:viewport?.getAttribute("role"),
        scroll:style?.overflowY,
        capped:Number.parseFloat(style?.maxHeight||"0")<=600,
        suggestionsClosed:document.querySelector("#hq-ideas-fold")?.open===false,
        issuesLabel:document.querySelector("#hq-findings-count")!==null};
    });
    record("problems_scroll_inside_panel_with_suggestions_collapsed",
      problemsLayout.top===0 && problemsLayout.region==="region" &&
      problemsLayout.scroll==="auto" && problemsLayout.capped &&
      problemsLayout.suggestionsClosed && problemsLayout.issuesLabel,
      "The problem list scrolls within a capped panel; improvement suggestions start closed");

    await page.locator('.nav-item[data-view="headquarters"]').click();
    await page.locator("#view-headquarters").waitFor({state:"visible",timeout:10000});
    await page.setViewportSize({width:390,height:844});
    const smallScreen = await page.evaluate(() => ({
      width:innerWidth,
      contentWidth:document.documentElement.scrollWidth,
      sidebarHidden:getComputedStyle(document.querySelector(".sidebar")).transform!=="none",
      introWidth:document.querySelector(".founder-command")?.getBoundingClientRect().width||0,
      listWidth:document.querySelector(".owner-console")?.getBoundingClientRect().width||0
    }));
    record("mobile_layout_fits_without_horizontal_page_scroll",
      smallScreen.contentWidth<=smallScreen.width+2 &&
      smallScreen.sidebarHidden &&
      smallScreen.introWidth>0 && smallScreen.introWidth<=smallScreen.width &&
      smallScreen.listWidth>0 && smallScreen.listWidth<=smallScreen.width,
      "Narrow screen keeps navigation tucked away and cards within the viewport");
    await page.setViewportSize({width:1440,height:1000});

    await page.waitForFunction(() => {
      const identity = document.querySelector("#identity")?.textContent?.trim() || "";
      return identity.length > 0 && !identity.includes("Verifying");
    }, null, { timeout: 20000 });
    record("access_identity_resolved", true, "Admin identity resolved after Access authentication");

    const readEndpoints = [
      "/api/admin/headquarters",
      "/api/admin/action-center",
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
      "/api/admin/repair-jobs",
      "/api/admin/yorpmind"
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

    // Human-first owner hierarchy and bounded temporary rights are visible
    // independently of whether the optional security approval is configured.
    const ownerHome = await page.evaluate(() => ({
      heading: document.querySelector("#founder-welcome")?.textContent || "",
      owner: document.querySelector(".founder-you")?.textContent || "",
      assistants: [...document.querySelectorAll(".founder-assistant strong")].map(x=>x.textContent||""),
      connected: typeof window.HQChooseAssistant==="function",
      durationChoices: [...(document.querySelector("#founder-duration")?.options||[])].map(x=>x.value),
      hasConfirm: document.querySelector("#founder-understand")?.required===true
    }));
    record("owner_above_two_equal_assistants",
      ownerHome.owner.includes("Owner") && ownerHome.assistants.length===2 &&
      ownerHome.assistants.some(x=>x.includes("YorpMind")) &&
      ownerHome.assistants.some(x=>x.includes("ChatGPT")),
      "The founder sits above YorpMind and ChatGPT; workers are below them");
    record("human_assistant_choice_and_short_permission",
      ownerHome.connected && ownerHome.hasConfirm &&
      JSON.stringify(ownerHome.durationChoices)===JSON.stringify(["15","30","60"]),
      "Handoff choices are explicit; temporary permissions never run longer than one hour");
    const permReply = await page.request.get(baseUrl+"/api/admin/assistant-permissions",{
      headers: accessHeaders,timeout:20000
    });
    const permBody=await permReply.json().catch(()=>null);
    record("temporary_permissions_fail_closed_or_are_read_only",
      permReply.status()===503 && permBody?.error?.code==="PERMISSIONS_NOT_READY" ||
      permReply.status()===200 && permBody?.owner_is_in_charge===true &&
      permBody?.production_execution_enabled===false,
      "Missing private migration blocks access; when installed, production remains locked");
    const fakeAgent = await page.request.post(baseUrl+"/api/admin/assistant-actions",{
      headers: {...accessHeaders,"content-type":"application/json"},
      data:{request_id:crypto.randomUUID(),action:"create_issue",scope:"website",
        title:"Synthetic request that must be blocked",
        details:"This is a browser-only security test and must never create an issue.",confirm:true},
      timeout:20000
    });
    record("browser_or_ci_cannot_impersonate_assistant",
      fakeAgent.status()===403,
      "Ordinary founder and CI sessions cannot use temporary AI permissions");

    record("founder_action_panel_present", await page.locator("#owner-action-title").count() === 1,
      "Founder decisions are visible on the first Headquarters screen");
    const actionUi = await page.evaluate(async () => {
      if (typeof window.loadOwnerActionCenter !== "function") return { available: false };
      const apiOriginal = window.api;
      window.api = async (path, options) => {
        if (path === "/api/admin/action-center") return {
          name: "Headquarters Founder Action Center",
          scope: "private_d1_evidence_only",
          generated_at: new Date().toISOString(),
          auto_ai_dispatch_enabled: false,
          release_execution_enabled: false,
          recorded_jobs_scanned: 1,
          pending_total_in_window: 1,
          truncated: false,
          actions: [{
            id: "synthetic-failure", urgency: "urgent",
            title: "<img src=x onerror=alert(1)>",
            why: "Synthetic untrusted report text.",
            next_step: "Inspect the failed record; do not deploy.",
            view: "headquarters", target: "failed",
            execution_authorized: false, approval_granted: false
          }]
        };
        return apiOriginal(path, options);
      };
      try {
        await window.loadOwnerActionCenter(true);
        const host = document.querySelector("#owner-actions");
        return {
          available: true,
          untrusted_inert: host?.textContent?.includes("<img src=x onerror=alert(1)>") === true &&
            host.querySelectorAll("img").length === 0,
          button_present: host?.querySelectorAll("button.owner-task-button").length === 1
        };
      } finally { window.api = apiOriginal; }
    });
    record("founder_action_untrusted_html_inert",
      actionUi.available && actionUi.untrusted_inert && actionUi.button_present,
      "HTML-shaped mission content is shown inertly, and review navigation is visible");
    // Return to real authenticated evidence after the browser-local synthetic fixture.
    await page.evaluate(() => window.loadOwnerActionCenter?.(true));

    // Probe the real read-only evidence endpoint using an existing private
    // owner mission if present; never create/dispatch a test job in browser CI.
    const proofMissionsResponse = await page.request.get(baseUrl + "/api/admin/headquarters", {
      headers: accessHeaders, timeout: 20000
    });
    const proofMissions = proofMissionsResponse.ok() ?
      await proofMissionsResponse.json().catch(() => null) : null;
    const proofJob = (proofMissions?.missions || []).find(row =>
      row.job_id && /^[a-f0-9-]{36}$/i.test(row.job_id) &&
      row.status !== "planned");
    if (proofJob) {
      const proofResponse = await page.request.get(baseUrl +
        "/api/admin/mission-proof?job_id=" + encodeURIComponent(proofJob.job_id), {
          headers: accessHeaders, timeout: 20000
        });
      const evidence = proofResponse.ok() ? await proofResponse.json().catch(() => null) : null;
      record("real_staging_mission_receipt_read_only",
        proofResponse.status() === 200 &&
        evidence?.system === "headquarters_mission_proof" &&
        evidence?.proof?.job_id === proofJob.job_id &&
        evidence?.independent_qa_passed === false &&
        evidence?.production_release_permitted === false &&
        evidence?.new_inference_calls === 0,
        "The staging mission record is examined without model calls or approval");
    } else {
      const invalidProof = await page.request.get(baseUrl +
        "/api/admin/mission-proof?job_id=not-a-uuid", {
          headers: accessHeaders, timeout: 20000
        });
      record("mission_proof_validation_without_seeded_mission",
        invalidProof.status() === 400,
        "No existing mission; invalid input is rejected without model calls");
    }

    // Cross-channel repairs share GitHub issues; this authenticated read is
    // intentionally model-free and must never dispatch an agent.
    const sharedInboxResponse = await page.request.get(baseUrl + "/api/admin/repair-inbox", {
      headers: accessHeaders, timeout: 20000
    });
    const sharedInbox = sharedInboxResponse.ok() ?
      await sharedInboxResponse.json().catch(() => null) : null;
    record("private_shared_github_inbox_read_only",
      sharedInboxResponse.status() === 200 &&
      sharedInbox?.repository === "solopreneursid/yorpHives-2.0" &&
      sharedInbox?.read_only === true &&
      sharedInbox?.new_model_calls === 0 &&
      sharedInbox?.production_approved === false &&
      Array.isArray(sharedInbox?.issues) && sharedInbox.issues.length <= 20,
      "Access-protected GitHub issues are observable without AI calls or repair dispatch");
    const sharedMarkdown = await page.request.get(
      baseUrl + "/api/admin/repair-inbox?format=markdown", {
        headers: { ...accessHeaders, accept: "text/markdown" }, timeout: 20000
      });
    const sharedMarkdownText = sharedMarkdown.ok() ? await sharedMarkdown.text() : "";
    record("private_shared_github_inbox_markdown_for_agents",
      sharedMarkdown.status() === 200 &&
      (sharedMarkdown.headers()["content-type"] || "").includes("text/markdown") &&
      sharedMarkdownText.includes("Production release: DISABLED") === false &&
      sharedMarkdownText.includes("Automated production release: DISABLED"),
      "Agent-readable Markdown shares the same untrusted GitHub issues and release boundaries");

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
    const stagingJobs = (proofMissions?.missions || []).filter(mission =>
      mission.origin_type === "staging_rehearsal");
    if (stagingJobs.length) {
      await page.locator("#hq-filter").selectOption("staging");
      const staged = page.locator(".hq-mission-card").filter({ hasText: "[STAGING QA]" }).first();
      await staged.waitFor({ state: "visible", timeout: 10000 });
      const stagedText = await staged.textContent();
      const stagedActions = await staged.locator("button").allTextContents();
      record("synthetic_rehearsal_is_explicitly_labeled",
        stagedText?.includes("STAGING REHEARSAL") === true &&
        stagedText?.includes("not dispatched by you") === true,
        "Synthetic test is not represented as founder dispatch");
      record("synthetic_rehearsal_has_no_owner_approval_buttons",
        !stagedActions.some(text => /Mark brief reviewed|Discard brief|Start AI brief|Cancel/i.test(text)),
        "Rehearsal cannot trigger founder mission approval/discard actions");
      const proofToggle = staged.locator(".hq-proof summary");
      await proofToggle.click();
      await staged.locator(".hq-proof-content").waitFor({ state: "visible", timeout: 15000 });
      const proofText = await staged.locator(".hq-proof-content").textContent();
      record("synthetic_rehearsal_proof_is_read_only",
        proofText?.includes("Staging rehearsal recorded") === true &&
        proofText?.includes("SYNTHETIC TEST") === true &&
        !/Production deployment: APPROVED/i.test(proofText || ""),
        "All five staging records remain distinct from independent QA");
      await page.locator("#hq-filter").selectOption("active");
    }
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
    const privateReleases = await page.request.get(baseUrl + "/api/admin/release-evidence", {
      headers: accessHeaders, timeout: 15000
    });
    const releaseData = await privateReleases.json().catch(() => null);
    record("release_evidence_private_read_only",
      privateReleases.status() === 200 &&
      releaseData?.production_approved === false &&
      releaseData?.production_deployment_enabled === false &&
      Number(releaseData?.counts?.production_authorized) === 0,
      "Staging D1 Release board must provide authenticated read-only, permanently locked evidence: HTTP " + privateReleases.status());

    // Owner delegation read-side verification: the CI identity cannot prepare
    // an approval, cannot satisfy MFA, and never writes real staging release data.
    const ownerDelegationResponse = await page.request.get(baseUrl + "/api/admin/owner-delegations", {
      headers: accessHeaders, timeout: 15000
    });
    const ownerDelegationData = ownerDelegationResponse.ok()
      ? await ownerDelegationResponse.json().catch(() => null) : null;
    record("yorpmind_owner_delegation_schema_and_policy",
      ownerDelegationResponse.status() === 200 &&
      ownerDelegationData?.name === "YorpMind" &&
      ownerDelegationData?.execution_enabled === false &&
      ownerDelegationData?.mechanism === "preview_review_then_owner_mfa_then_scoped_delegation",
      "Private 0026 delegation schema is readable; automatic production execution stays locked: HTTP " + ownerDelegationResponse.status());

    const forbiddenDelegation = await page.request.post(baseUrl + "/api/admin/owner-delegations", {
      headers: { ...accessHeaders, origin: baseUrl, "content-type": "application/json" },
      data: { action: "deploy_verified_release", repair_job_id: "123e4567-e89b-42d3-a456-426614174000" },
      timeout: 15000
    });
    record("yorpmind_ci_cannot_prepare_owner_delegation", forbiddenDelegation.status() === 403,
      "Read-only CI identity denied owner release approval preparation; HTTP " + forbiddenDelegation.status());

    const ciStepUp = await page.request.get(baseUrl + "/api/admin/step-up/owner-delegations?id=123e4567-e89b-42d3-a456-426614174000", {
      headers: accessHeaders, timeout: 15000, maxRedirects: 0
    });
    record("yorpmind_ci_cannot_pass_mfa_step_up",
      [302,303,401,403,503].includes(ciStepUp.status()),
      "Service credentials cannot satisfy founder MFA; disabled policy rejects at runtime: HTTP " + ciStepUp.status());

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
    await page.waitForFunction(() => {
      const label = document.querySelector("#repair-qa-status")?.textContent || "";
      return label.includes("No issue-specific QA") || label.includes("QA is unavailable");
    }, null, { timeout: 10000 });
    record("repair_qa_clear_separate_approval",
      (await page.locator("#repair-qa-dialog").innerText()).includes("This never publishes a release") &&
      (await page.locator("#repair-qa-status").innerText()).includes("No issue-specific QA"),
      "Async QA evidence must settle before interpreting the founder's review state");
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
    record("yorpmind_owner_approval_requires_review_not_otp",
      await page.locator("#owner-delegation-form").isVisible() &&
      (await page.locator("#owner-delegation-form input[type=checkbox]").count()) === 6 &&
      (await page.locator("#owner-delegation-form input[name*=otp]").count()) === 0 &&
      (await page.locator("#owner-delegation-panel").count()) === 0 &&
      (await page.locator(".owner-delegation-notice").innerText()).includes("Do not enter OTP"),
      "Founder sees exact commit and six review requirements without any OTP collection field");
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

    // YorpMind is first-party and private. Exercise its real read-only API with
    // the existing Cloudflare Access service identity, then render synthetic
    // browser-local GET fixtures. Never write memory or approve a skill in CI.
    const realYorpMind = await page.request.get(baseUrl + "/api/admin/yorpmind", {
      headers: accessHeaders, timeout: 15000
    });
    const realYorpMindData = realYorpMind.ok() ? await realYorpMind.json().catch(() => null) : null;
    record("yorpmind_staging_schema_and_private_policy",
      realYorpMind.status() === 200 &&
      realYorpMindData?.name === "YorpMind" &&
      realYorpMindData?.scope === "headquarters" &&
      realYorpMindData?.policy?.public_access_enabled === false &&
      realYorpMindData?.policy?.autonomous_skill_execution_enabled === false &&
      realYorpMindData?.policy?.production_changes_enabled === false,
      "Read-only Access identity sees schema 0024 and an explicitly disabled public/autonomous policy; HTTP " + realYorpMind.status());
    const forbiddenYorpMindWrite = await page.request.post(baseUrl + "/api/admin/yorpmind", {
      headers: { ...accessHeaders, origin: baseUrl, "content-type": "application/json" },
      data: { action: "capture_repair_experience", repair_job_id: "123e4567-e89b-42d3-a456-426614174000",
        title: "Blocked test memory", lesson: "This synthetic lesson must never be written by read-only CI test credentials." },
      timeout: 15000
    });
    record("yorpmind_ci_identity_cannot_modify_memory",
      forbiddenYorpMindWrite.status() === 403,
      "Read-only CI service identity cannot save experiences or approve skills; HTTP " + forbiddenYorpMindWrite.status());

    await page.route("**/api/admin/yorpmind", async route => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          schema_version: 1, name: "YorpMind", scope: "headquarters",
          generated_at: "2026-11-12T14:45:00Z",
          policy: {
            approved_services: ["Cloudflare", "ChatGPT/OpenAI", "GitHub free capabilities"],
            public_access_enabled: false, autonomous_learning_enabled: false,
            autonomous_skill_execution_enabled: false, production_changes_enabled: false
          },
          counts: { experiences: 1, draft_skills: 1, approved_reference_skills: 0, retired_skills: 0 },
          experiences: [{
            experience_id: "123e4567-e89b-42d3-a456-426614174000",
            scope: "headquarters", source_type: "repair_qa",
            source_id: "123e4567-e89b-42d3-a456-426614174000",
            source_commit_sha: "a".repeat(40), title: "Synthetic QR tool lesson",
            lesson: "<img src=x onerror=alert(1)> — this untrusted text must never become executable HTML.",
            evidence_level: "founder_reported_qa", status: "recorded",
            recorded_by: "founder@example.com", created_at: "2026-11-12T14:00:00Z"
          }],
          skills: [{
            skill_id: "8c3e4567-e89b-42d3-a456-426614174000",
            slug: "diagnose-qr-tool", title: "Diagnose QR tool failures",
            purpose: "Investigate reproducible QR output failures without production execution.",
            status: "draft", current_revision: 1, approved_revision: null,
            source_experience_id: "123e4567-e89b-42d3-a456-426614174000",
            steps: ["Reproduce the original issue on an isolated preview.",
              "Collect regression evidence and request independent QA review."],
            created_at: "2026-11-12T14:05:00Z", updated_at: "2026-11-12T14:05:00Z"
          }]
        })
      });
    });
    await page.locator('.nav-item[data-view="yorpmind"]').click();
    await page.locator("#view-yorpmind").waitFor({ state: "visible", timeout: 10000 });
    await page.locator("#ym-experience-list .ym-entry").first().waitFor({ state: "visible", timeout: 10000 });
    record("yorpmind_founder_workspace_renders",
      (await page.locator("#view-yorpmind").innerText()).includes("The intelligence behind YorpHives") &&
      (await page.locator("#ym-experience-list").innerText()).includes("Synthetic QR tool lesson") &&
      (await page.locator("#ym-skill-list").innerText()).includes("Diagnose QR tool failures"),
      "YorpMind displays private memory and draft reference skills on desktop");
    record("yorpmind_untrusted_content_is_inert",
      (await page.locator("#ym-experience-list").innerText()).includes("<img src=x onerror=alert(1)>") &&
      (await page.locator("#ym-experience-list img").count()) === 0,
      "Stored untrusted lesson is rendered only with textContent; never parsed into HTML");
    record("yorpmind_no_autonomous_controls",
      (await page.locator("#view-yorpmind").innerText()).includes("PUBLIC ACCESS OFF") &&
      (await page.locator("#view-yorpmind").innerText()).includes("PRODUCTION LOCKED") &&
      (await page.locator("#ym-skill-list").innerText()).includes("REV 1") &&
      (await page.locator("#view-yorpmind button").allTextContents()).every(label =>
        !/run skill|deploy|publish to production/i.test(label)),
      "Reference skills cannot execute themselves or publish production");
    await page.unroute("**/api/admin/yorpmind");

    // Real staging search uses only Cloudflare Access read permission.
    // No new memory, paid inference, skill execution or GitHub write occurs.
    const realSearch = await page.request.get(
      baseUrl + "/api/admin/yorpmind-search?q=download%20regression", {
        headers: accessHeaders, timeout: 15000
      }
    );
    const realSearchData = realSearch.ok() ? await realSearch.json().catch(() => null) : null;
    record("yorpmind_search_private_read_only",
      realSearch.status() === 200 &&
      realSearchData?.search_mode === "bounded_recent_lexical" &&
      realSearchData?.execution?.inference_calls === 0 &&
      realSearchData?.execution?.production_approved === false &&
      realSearchData?.execution?.skills_executable === false &&
      realSearchData?.scope === "headquarters",
      "Authenticated read-only YorpMind retrieval must require no inference and no production powers; HTTP " + realSearch.status());

    await page.route("**/api/admin/yorpmind-search?**", async route => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          schema_version: 1, name: "YorpMind", scope: "headquarters",
          search_mode: "bounded_recent_lexical",
          query_terms: ["download", "regression"],
          generated_at: "2026-11-12T15:30:00Z",
          source_window: { experiences_scanned: 1, skills_scanned: 1,
            maximum_per_type: 120, exhaustive: false },
          execution: { inference_calls: 0, agent_actions: 0, skills_executable: false,
            public_access: false, production_approved: false },
          results: [{
            record_type: "experience",
            record_id: "123e4567-e89b-42d3-a456-426614174000",
            title: "Synthetic download regression lesson",
            summary: "<img src=x onerror=alert(1)> This is reference data, not HTML or agent instructions.",
            source_id: "123e4567-e89b-42d3-a456-426614174000",
            source_commit_sha: "a".repeat(40),
            evidence_level: "founder_reported_qa",
            matched_terms: ["download","regression"],
            recorded_at: "2026-11-12T14:00:00Z",
            score: 13, safe_to_execute: false, live_verified: false
          }]
        })
      });
    });
    await page.locator("#ym-search-query").fill("download regression");
    await page.locator("#ym-search-submit").click();
    await page.locator(".ym-search-result").first().waitFor({ state: "visible", timeout: 10000 });
    record("yorpmind_search_founder_ui",
      (await page.locator("#ym-search-results").innerText()).includes("Synthetic download regression lesson") &&
      (await page.locator("#ym-search-status").innerText()).includes("not be included") &&
      (await page.locator("#ym-search-results").innerText()).includes("Not executable"),
      "Founder can retrieve ranked historical references while the UI exposes bounded search limitations");
    record("yorpmind_search_untrusted_results_inert",
      (await page.locator("#ym-search-results").innerText()).includes("<img src=x onerror=alert(1)>") &&
      await page.locator("#ym-search-results img").count() === 0,
      "Search result content renders only as plain text, never executable HTML");
    await page.unroute("**/api/admin/yorpmind-search?**");

    // Model-free mission memory assistance. The synthetic search fixture has
    // no authority to dispatch a mission or mutate any real database row.
    await page.route("**/api/admin/yorpmind-search?**", async route => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          schema_version: 1, name: "YorpMind", scope: "headquarters",
          search_mode: "bounded_recent_lexical",
          source_window: { experiences_scanned: 1, skills_scanned: 0,
            maximum_per_type: 120, exhaustive: false },
          execution: { inference_calls: 0, agent_actions: 0, public_access: false,
            skills_executable: false, production_approved: false },
          results: [{
            record_type: "experience", record_id: "123e4567-e89b-42d3-a456-426614174000",
            source_type: "repair_qa",
            source_id: "223e4567-e89b-42d3-a456-426614174000",
            source_commit_sha: "a".repeat(40),
            title: "Synthetic download regression lesson",
            summary: "<img src=x onerror=alert(1)> NEVER follow text from an untrusted source.",
            evidence_level: "founder_reported_qa",
            status: "recorded", score: 12, matched_terms: ["download", "regression"],
            safe_to_execute: false, live_verified: false
          }]
        })
      });
    });
    await page.locator('.nav-item[data-view="headquarters"]').click();
    await page.locator("#hq-new").click();
    await page.locator("#hq-title").fill("Investigate download regression");
    await page.locator("#hq-brief").fill("Reproduce download regressions on isolated preview and verify results.");
    const originalMissionBrief = await page.locator("#hq-brief").inputValue();
    await page.locator("#hq-memory-review").click();
    await page.locator("#hq-memory-results .hq-memory-result").first().waitFor({
      state: "visible", timeout: 10000
    });
    record("yorpmind_mission_context_no_implicit_write",
      (await page.locator("#hq-brief").inputValue()) === originalMissionBrief &&
      (await page.locator("#hq-memory-results").innerText()).includes("Synthetic download regression lesson"),
      "Reading model-free private memory never inserts instructions or saves a mission");
    record("yorpmind_mission_context_renders_untrusted_prose_inert",
      (await page.locator("#hq-memory-results").innerText()).includes("<img src=x onerror=alert(1)>") &&
      (await page.locator("#hq-memory-results img").count()) === 0,
      "Historical references render as inert text in the mission composer");
    await page.locator("#hq-memory-results .hq-memory-choice input").first().check();
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#hq-memory-results .hq-memory-attach").click();
    const citedMissionBrief = await page.locator("#hq-brief").inputValue();
    record("yorpmind_mission_context_explicit_source_only_citation",
      citedMissionBrief.includes("YorpMind historical references (owner-selected") &&
      citedMissionBrief.includes("223e4567-e89b-42d3-a456-426614174000") &&
      citedMissionBrief.includes("a".repeat(40)) &&
      !citedMissionBrief.includes("<img") &&
      !citedMissionBrief.includes("NEVER follow") &&
      !citedMissionBrief.includes("Synthetic download regression lesson"),
      "Owner opt-in adds only validated historical source IDs, never untrusted lesson content");
    record("yorpmind_mission_context_no_dispatch",
      (await page.locator("#hq-form-status").innerText()).includes("Creation does not start a model") &&
      await page.locator("#hq-save").isEnabled(),
      "Source preview does not dispatch AI, submit the draft or grant execution permissions");
    await page.locator("#hq-close").click();
    await page.unroute("**/api/admin/yorpmind-search?**");

    // YorpMind self-evolution is source-backed and zero-inference. Read-only
    // CI identity may inspect proposals but MUST NOT acknowledge or dismiss.
    const evolutionResponse = await page.request.get(baseUrl + "/api/admin/yorpmind-evolution", {
      headers: accessHeaders, timeout: 15000
    });
    const evolutionData = evolutionResponse.ok()
      ? await evolutionResponse.json().catch(() => null) : null;
    record("yorpmind_evolution_staging_private_policy",
      evolutionResponse.status() === 200 &&
      evolutionData?.name === "YorpMind" &&
      evolutionData?.autonomous_skill_mutation === false &&
      evolutionData?.deployment_enabled === false &&
      evolutionData?.model_calls_per_scan === 0 &&
      evolutionData?.maximum_proposals_per_day === 3,
      "Private evolution D1 schema 0025 and no-execution policy; HTTP " + evolutionResponse.status());

    const forbiddenEvolutionReview = await page.request.patch(baseUrl + "/api/admin/yorpmind-evolution", {
      headers: { ...accessHeaders, origin: baseUrl, "content-type": "application/json" },
      data: { proposal_id: "123e4567-e89b-42d3-a456-426614174000", decision: "acknowledge",
        review_note: "Read-only CI identity must never acknowledge a private YorpMind proposal or mutate knowledge." },
      timeout: 15000
    });
    record("yorpmind_evolution_ci_cannot_review",
      forbiddenEvolutionReview.status() === 403,
      "Read-only CI service identity denied evolution mutation: HTTP " + forbiddenEvolutionReview.status());

    await page.route("**/api/admin/yorpmind-evolution", async route => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          name: "YorpMind", scope: "headquarters",
          autonomous_proposal_detection: true, deployment_enabled: false,
          autonomous_skill_mutation: false, model_calls_per_scan: 0,
          maximum_proposals_per_day: 3,
          pending_proposals: 1, reviewed_proposals: 0,
          last_runs: [{ status: "completed", experiences_scanned: 2,
            created_at: "2026-11-12T03:30:00Z", completed_at: "2026-11-12T03:30:05Z" }],
          proposals: [{
            proposal_id: "323e4567-e89b-42d3-a456-426614174000",
            topic_key: "download-image", candidate_type: "new_reference_skill",
            related_skill_id: null, status: "proposed",
            evidence_ids: [
              "123e4567-e89b-42d3-a456-426614174000",
              "223e4567-e89b-42d3-a456-426614174000"
            ],
            evidence_count: 2,
            rationale: "Repeated founder-reported repair topics could justify a reusable reference procedure. Verify source QA independently before drafting a skill.",
            proposed_at: "2026-11-12T03:30:05Z"
          }]
        })
      });
    });
    await page.locator('.nav-item[data-view="yorpmind"]').click();
    // This tab was already loaded earlier in the smoke journey. Explicitly
    // refresh to test the latest browser-local evolution fixture, not cached state.
    await page.locator("#ym-evolution-refresh").click();
    await page.locator(".ym-evolution-item").first().waitFor({ state: "visible", timeout: 10000 });
    record("yorpmind_evolution_founder_proposals_visible",
      (await page.locator("#ym-evolution-proposals").innerText()).includes("download image") &&
      (await page.locator("#ym-evolution-proposals").innerText()).includes("2 separate historical QA observations") &&
      (await page.locator("#ym-evolution-metrics").innerText()).includes("Extra AI calls"),
      "Founder sees daily inferred patterns with explicit historical provenance and zero extra inference");
    record("yorpmind_evolution_no_autoapproval",
      (await page.locator("#view-yorpmind").innerText()).includes("No skill revisions or deployments") &&
      (await page.locator("#ym-evolution-proposals").innerText()).includes("Acknowledge for planning") &&
      (await page.locator("#ym-evolution-proposals button").allTextContents()).every(x =>
        !/deploy|execute|approve skill|publish/i.test(x)),
      "Review-only controls; no automatic skill execution, release or skill revision");
    await page.unroute("**/api/admin/yorpmind-evolution");

    const unauthenticated = await request.newContext({ baseURL: baseUrl, maxRedirects: 0 });
    try {
      const anonymousResponse = await unauthenticated.get("/api/admin/overview", { timeout: 15000 });
      const protectedStatus = [302, 303, 401, 403].includes(anonymousResponse.status());
      record("admin_api_requires_access", protectedStatus, "Unauthenticated HTTP " + anonymousResponse.status());
      const anonymousQa = await unauthenticated.get("/api/admin/repair-qa?job_id=invalid", { timeout: 15000 });
      record("repair_qa_requires_cloudflare_access",
        [302, 303, 401, 403].includes(anonymousQa.status()),
        "Anonymous QA request denied by Access: HTTP " + anonymousQa.status());
      const anonymousYorpMindSearch = await unauthenticated.get(
        "/api/admin/yorpmind-search?q=download", { timeout: 15000 });
      record("yorpmind_search_public_denied",
        [302,303,401,403].includes(anonymousYorpMindSearch.status()),
        "Anonymous users cannot search Headquarters memory; HTTP " + anonymousYorpMindSearch.status());
      const anonymousEvolution = await unauthenticated.get("/api/admin/yorpmind-evolution", { timeout: 15000 });
      record("yorpmind_evolution_public_access_denied",
        [302,303,401,403].includes(anonymousEvolution.status()),
        "Anonymous requests cannot read private self-evolution proposals: HTTP " + anonymousEvolution.status());
      const anonymousYorpMind = await unauthenticated.get("/api/admin/yorpmind", { timeout: 15000 });
      record("yorpmind_public_access_denied",
        [302, 303, 401, 403].includes(anonymousYorpMind.status()),
        "Anonymous requests must not reveal YorpMind private experiences or skills; HTTP " + anonymousYorpMind.status());
      const anonymousDelegations = await unauthenticated.get("/api/admin/owner-delegations", { timeout: 15000 });
      record("yorpmind_owner_delegation_requires_access",
        [302,303,401,403].includes(anonymousDelegations.status()),
        "Anonymous clients must not inspect delegated admin intent: HTTP " + anonymousDelegations.status());
      const anonymousReleases = await unauthenticated.get("/api/admin/release-evidence", { timeout: 15000 });
      record("release_evidence_requires_cloudflare_access",
        [302, 303, 401, 403].includes(anonymousReleases.status()),
        "Anonymous Release evidence must not reveal private operational state: HTTP " + anonymousReleases.status());
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
