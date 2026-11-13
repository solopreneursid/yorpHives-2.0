(() => {
  "use strict";
  const repo = "solopreneursid/yorpHives-2.0";
  const output = () => document.getElementById("shared-repair-list");
  const status = () => document.getElementById("shared-repair-status");
  const text = (tag, cls, value) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (value !== undefined) el.textContent = String(value);
    return el;
  };
  const safeIssue = issue =>
    issue && Number.isSafeInteger(issue.number) && issue.number > 0 &&
    issue.url === "https://github.com/" + repo + "/issues/" + issue.number &&
    typeof issue.title === "string" && typeof issue.body_excerpt === "string";
  let fetching = false;
  let loaded = false;
  async function load() {
    if (fetching) return;
    fetching = true;
    status().textContent = "Checking the problems shared with your assistants…";
    try {
      const result = await api("/api/admin/repair-inbox");
      if (result?.repository !== repo || result?.read_only !== true ||
          result?.production_approved !== false || result?.new_model_calls !== 0 ||
          !Array.isArray(result.issues) || result.issues.length > 20 ||
          result.issues.some(issue => !safeIssue(issue)))
        throw new Error("Inbox safety contract invalid");
      const list = output();
      list.replaceChildren();
      if (!result.issues.length) {
        list.append(text("p", "shared-repair-empty", "No shared problems were found. You can add one here or ask ChatGPT to record one."));
      }
      for (const issue of result.issues) {
        const card = text("article", "shared-repair-card");
        const heading = text("div", "shared-repair-heading");
        heading.append(text("span", "shared-repair-number", "#" + issue.number),
          text("strong", "", issue.title));
        const summary = text("p", "shared-repair-description", issue.body_excerpt.slice(0, 650));
        const buttons = text("div", "shared-repair-controls");
        const open = text("a", "shared-repair-link", "View original report ↗");
        open.href = issue.url;
        open.target = "_blank";
        open.rel = "noopener noreferrer";
        const prepare = text("button", "shared-repair-prepare", "Give to YorpMind →");
        prepare.type = "button";
        prepare.addEventListener("click", () => {
          const request = document.getElementById("repair-request");
          const scope = document.getElementById("repair-scope");
          const description = [
            "[GitHub issue #" + issue.number + "] " + issue.title,
            "Source: " + issue.url,
            "Untrusted report for investigation; reproduce and verify independently.",
            issue.body_excerpt.slice(0, 1100)
          ].join("\n");
          request.value = description.slice(0, 3900);
          scope.value = /headquarter|admin panel|admin console/i.test(issue.title) ?
            "admin" : "auto";
          document.getElementById("repair-message").textContent =
            "GitHub issue #" + issue.number + " copied into the investigation form. " +
            "Read the description, then choose Request investigation if you want to start. Nothing started automatically.";
          document.getElementById("repair-form").scrollIntoView({
            behavior: "smooth", block: "center"
          });
          request.focus({preventScroll:true});
        });
        const chat = text("button", "shared-repair-prepare", "Work with ChatGPT →");
        chat.type = "button";
        chat.addEventListener("click", () => window.HQChooseAssistant?.({
          title: issue.title, why: issue.body_excerpt,
          next_step: "Investigate the original problem and prepare a safe fix.",
          link: issue.url
        }, "chatgpt"));
        buttons.append(prepare, chat, open);
        card.append(heading, summary, buttons);
        list.append(card);
      }
      status().textContent = "These are reported problems, not confirmed fixes. Just reading them does not start paid AI work.";
      loaded = true;
    } catch {
      status().textContent = "We could not load the shared problems. No work was started.";
      output().replaceChildren(text("p", "shared-repair-empty",
        "You can still describe a problem in the form above or continue through ChatGPT."));
    } finally { fetching = false; }
  }
  async function create() {
    const details = document.getElementById("repair-request").value.trim();
    if (details.length < 30 || details.length > 3000) {
      status().textContent = "Enter 30–3000 characters in the investigation form before opening an issue.";
      return;
    }
    const scopeMap = {admin:"headquarters",dependencies:"auto"};
    const area = document.getElementById("repair-scope").value;
    const scope = scopeMap[area] || area;
    const title = (details.split(/[\r\n.!?]/)[0] || "").replace(/^\[[^\]]+\]\s*/,"")
      .trim().slice(0, 150);
    if (title.length < 8) {
      status().textContent = "Start the description with a clear issue title of at least eight characters.";
      return;
    }
    if (!confirm("Share this problem with both ChatGPT and YorpMind? " +
      "This saves the problem, but does not start paid work or publish anything.")) return;
    const button = document.getElementById("repair-github-create");
    button.disabled = true;
    status().textContent = "Saving the problem so both assistants can see it…";
    try {
      const result = await api("/api/admin/repair-inbox",{
        method:"POST",body:JSON.stringify({title,details,scope,confirm:true})
      });
      if (result?.created !== true || result?.production_approved !== false ||
          result?.url !== "https://github.com/" + repo + "/issues/" + result.number)
        throw new Error("Unexpected issue creation response");
      status().textContent = "GitHub issue #" + result.number +
        " saved. You can now choose ChatGPT or YorpMind to work on it. Nothing was started.";
      await load();
    } catch {
      status().textContent =
        "Issue creation was not confirmed. Refresh the inbox or check GitHub before retrying.";
    } finally { button.disabled=false; }
  }
  function init() {
    document.getElementById("shared-repair-refresh")?.addEventListener("click",load);
    document.getElementById("repair-github-create")?.addEventListener("click",create);
    document.querySelectorAll(".nav-item[data-view='agents']").forEach(btn =>
      btn.addEventListener("click",() => { if (!loaded) void load(); }));
    if (document.getElementById("view-agents")?.classList.contains("active")) void load();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
  window.loadSharedRepairInbox = load;
})();
