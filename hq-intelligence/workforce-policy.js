/**
 * First-party YorpMind workforce policy and versioned component registry.
 *
 * This module grants NO runtime privileges. Authorization gateways must
 * separately enforce network, storage, repository and deployment boundaries.
 * Immutable inventory entries represent planned ownership, NOT installed bots.
 */
export const WORKFORCE_POLICY_VERSION = "1.0.0";
export const WORKFORCE_POLICY = Object.freeze({
  mode: "monitor_research_recommend",
  control_plane: "first_party_internal_only",
  mcp_enabled: false,
  external_ai_apis_enabled: false,
  automatic_code_changes: false,
  repository_writes: false,
  infrastructure_mutations: false,
  agent_deployments: false,
  automatic_approvals: false,
  internal_evidence_writes: true,
  founder_implements_changes: true,
  founder_preview_and_otp_required: true
});

const DENIED_OPERATIONS = new Set([
  "modify_code", "write_repository", "create_pull_request", "merge",
  "deploy", "publish", "release", "change_infrastructure",
  "change_secrets", "grant_permissions", "execute_shell",
  "dispatch_repair", "install_package", "approve_release",
  "request_otp", "invoke_external_ai", "connect_mcp"
]);
const PERMITTED_OPERATIONS = new Set([
  "read_evidence", "record_evidence", "monitor", "research",
  "analyze", "recommend", "track_versions", "review_findings",
  "record_founder_feedback"
]);

/** Fail-closed policy decision. Never infer permission from a role label. */
export function authorizeYorpMindOperation(operation) {
  if (typeof operation !== "string" || !PERMITTED_OPERATIONS.has(operation)) {
    return Object.freeze({
      allowed: false,
      code: DENIED_OPERATIONS.has(operation) ? "MONITOR_ONLY" : "UNRECOGNIZED_OPERATION",
      policy_version: WORKFORCE_POLICY_VERSION
    });
  }
  return Object.freeze({ allowed: true, policy_version: WORKFORCE_POLICY_VERSION });
}

const bot = (id,domain,source) => Object.freeze({
  id, domain, ownership:"yorphives_first_party",
  state:"planned", version:"0.0.0",
  upstream_reference:source, upstream_revision:null, upstream_license:null,
  source_audit:"required_before_adaptation",
  privileges:Object.freeze(["observe","record_evidence","recommend"])
});

/** Source references are research candidates, not dependencies or endorsements. */
export const OWNED_BOT_REGISTRY = Object.freeze([
  bot("yorp-health","availability","Uptime Kuma"),
  bot("yorp-bug","error_detection","GlitchTip"),
  bot("yorp-browser","synthetic_checks","Playwright"),
  bot("yorp-shield","passive_security","Nuclei / OWASP ZAP"),
  bot("yorp-dependency","supply_chain","Trivy"),
  bot("yorp-tech-watch","open_source_research","public source repositories"),
  bot("yorp-market","market_intelligence","public permitted sources"),
  bot("yorp-growth","growth_intelligence","internal analytics"),
  bot("yorp-revenue","verified_revenue","owner-authorized reports")
]);

export function registrySummary(entries = OWNED_BOT_REGISTRY) {
  if (!Array.isArray(entries)) throw new TypeError("Registry must be an array");
  const seen = new Set();
  return entries.map(item => {
    if (!item || typeof item.id !== "string" || !/^[a-z0-9-]{3,64}$/.test(item.id) ||
        seen.has(item.id) || !/^(planned|experimental|active|retired)$/.test(item.state) ||
        !/^\d+\.\d+\.\d+$/.test(item.version) ||
        item.ownership !== "yorphives_first_party" ||
        !Array.isArray(item.privileges) ||
        item.privileges.some(p => !["observe","record_evidence","recommend"].includes(p))) {
      throw new Error("Invalid or privileged registry entry");
    }
    seen.add(item.id);
    return Object.freeze({
      id:item.id,domain:item.domain,state:item.state,version:item.version,
      upstream_reference:item.upstream_reference,
      upstream_revision:item.upstream_revision,upstream_license:item.upstream_license,
      source_audit:item.source_audit
    });
  });
}
