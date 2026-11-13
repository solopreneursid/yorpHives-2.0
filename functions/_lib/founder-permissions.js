/**
 * Human-governed, time-limited permission checks.
 * Never converts an AI model's claimed identity or text into account rights.
 */
export const ASSISTANTS = Object.freeze(["yorpmind","chatgpt"]);
export const GRANT_SCOPES = Object.freeze(["website","headquarters","both"]);
export const GRANT_LEVELS = Object.freeze(["review_findings","prepare_fixes","manage_staging"]);
export const GRANT_MINUTES = Object.freeze([15,30,60]);
export const GRANT_MAX_ACTIONS = 3;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validGrantInput(value) {
  if (!value || typeof value!=="object" || Array.isArray(value) ||
      !ASSISTANTS.includes(value.assistant) ||
      !GRANT_SCOPES.includes(value.scope) ||
      !GRANT_LEVELS.includes(value.permission) ||
      !GRANT_MINUTES.includes(value.duration_minutes) ||
      value.confirm!==true || typeof value.purpose!=="string") return null;
  const purpose=value.purpose.trim();
  if (purpose.length<40 || purpose.length>700 ||
      /[\u0000-\u001f\u007f]/.test(purpose))return null;
  return {assistant:value.assistant,scope:value.scope,permission:value.permission,
    duration_minutes:value.duration_minutes,purpose};
}
export function permissionLabels(row) {
  const names={yorpmind:"YorpMind",chatgpt:"ChatGPT"};
  const levels={
    review_findings:"Review information and suggest what to do",
    prepare_fixes:"Prepare an issue and suggest a fix",
    manage_staging:"Prepare work for the test version"
  };
  const scopes={
    website:"YorpHives website",headquarters:"Headquarters",both:"Website and Headquarters"
  };
  return {assistant:names[row.assistant]||"Unknown",
    permission:levels[row.permission]||"Unknown",
    scope:scopes[row.scope]||"Unknown"};
}

/**
 * This stage connects only one low-impact agent action: open a GitHub issue.
 * No agent may edit releases, merge PRs, trigger paid AI, or change admin rights.
 * Do not infer an executable capability from the display name of a grant.
 */
export function grantAllows(row,actor,action,target,now=new Date()) {
  if(!row || row.state!=="active" || row.assistant!==actor ||
      !ASSISTANTS.includes(actor) || !uuid.test(String(row.grant_id||"")) ||
      !GRANT_SCOPES.includes(row.scope) || !GRANT_LEVELS.includes(row.permission) ||
      row.owner_email?.length<3 || !Number.isSafeInteger(Number(row.max_actions)) ||
      Number(row.max_actions)<1 || Number(row.max_actions)>GRANT_MAX_ACTIONS ||
      !Number.isSafeInteger(Number(row.used_actions)) ||
      Number(row.used_actions)>=Number(row.max_actions) ||
      typeof row.active_expires_at!=="string" ||
      !Number.isFinite(Date.parse(row.active_expires_at)) ||
      Date.parse(row.active_expires_at)<=now.getTime() ||
      !["website","headquarters"].includes(target) ||
      (row.scope!=="both" && row.scope!==target))return false;
  return action==="create_issue" &&
    ["prepare_fixes","manage_staging"].includes(row.permission);
}
export function grantDisplayState(row,now=new Date()) {
  if(!row || !["awaiting_mfa","active","revoked","expired"].includes(row.state))
    return "unavailable";
  if(row.state==="revoked")return "revoked";
  if(row.state==="expired")return "expired";
  if(row.state==="awaiting_mfa")
    return Number.isFinite(Date.parse(row.request_expires_at)) &&
      Date.parse(row.request_expires_at)>now.getTime() ?
      "awaiting_security_check":"expired";
  return Number.isFinite(Date.parse(row.active_expires_at)) &&
    Date.parse(row.active_expires_at)>now.getTime() ?
      "active":"expired";
}
export function securityReady(env) {
  const step=String(env?.CF_ACCESS_STEP_UP_AUD||"").trim();
  const base=new Set(String(env?.CF_ACCESS_AUD||"").split(",").map(x=>x.trim()));
  const agents=new Set(String(env?.CF_ACCESS_AGENT_AUD||"").split(",").map(x=>x.trim()));
  return Boolean(step && !base.has(step) && !agents.has(step) &&
    env?.CF_ACCESS_STEP_UP_MFA_POLICY_CONFIRMED==="yes");
}
