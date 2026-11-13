/**
 * Decides whether the isolated repair bot can safely take a finding.
 * It can change only selected end-user HTML/CSS/JS files. Documentation,
 * API definitions, security headers and monitoring rules are not writable
 * through its restricted repair path policy.
 *
 * This is a cost and authority preflight, not permission to deploy.
 */
const MACHINE_PATHS = Object.freeze([
  "/free-tools/manifest.json", "/llms.txt", "/robots.txt",
  "/openapi.yaml", "/sitemap.xml", "/.well-known/yorphives.json",
  "/api/v1/free-tools"
]);

export function assessRepairIntake(finding) {
  if (!finding || typeof finding !== "object") {
    return { permitted: false, code: "FINDING_REQUIRED",
      explanation: "Select a recorded problem before requesting an automated repair." };
  }
  const status = String(finding.status || "");
  if (!["open", "investigating", "awaiting_approval"].includes(status)) {
    return { permitted: false, code: "FINDING_NOT_ACTIVE",
      explanation: "This finding is no longer active. Recheck the website before starting another repair." };
  }
  if (finding.finding_source === "monitor") {
    return { permitted: true, code: "REVIEWABLE_MONITOR_FINDING",
      explanation: "A limited draft repair may be prepared; no release is authorized." };
  }
  if (finding.finding_source !== "asset") {
    return { permitted: false, code: "UNKNOWN_FINDING_SOURCE",
      explanation: "Headquarters could not identify the monitored problem." };
  }
  let path = "";
  try { path = new URL(String(finding.asset_url || "")).pathname; }
  catch { return { permitted: false, code: "INVALID_ASSET_URL",
      explanation: "The affected website address cannot be checked safely." }; }
  const machineFile = MACHINE_PATHS.includes(path) ||
    /\.(?:json|ya?ml|xml|txt)$/i.test(path);
  if (machineFile || finding.asset_type === "api") {
    return {
      permitted: false, code: "SPECIALIST_REVIEW_REQUIRED",
      explanation: "This issue concerns an API or AI discovery file. The page-repair bot cannot edit its code safely. Review it with ChatGPT or YorpMind first, then prepare a tested change through the normal development process.",
      handoff: "chatgpt_or_yorpmind", spending_started: false
    };
  }
  const category = String(finding.category || "");
  const findingKey = String(finding.finding_key || "");
  if (category === "security" ||
      /^(missing-hsts|missing-clickjacking-protection)$/.test(findingKey)) {
    return {
      permitted: false, code: "SECURITY_SPECIALIST_REQUIRED",
      explanation: "This needs a security review, possibly including Cloudflare settings. The page-repair bot cannot make that change. Review the evidence and proposed settings before any update.",
      handoff: "chatgpt_or_yorpmind", spending_started: false
    };
  }
  if (category === "change" || findingKey === "content-changed") {
    return {
      permitted: false, code: "CHANGE_REVIEW_REQUIRED",
      explanation: "A changed page is not automatically broken. Compare it with the approved release and confirm an actual problem first.",
      handoff: "chatgpt_or_yorpmind", spending_started: false
    };
  }
  return {
    permitted: true, code: "REVIEWABLE_SITE_REPAIR",
    explanation: "An isolated draft proposal may be prepared and must pass independent testing before the founder reviews it."
  };
}
