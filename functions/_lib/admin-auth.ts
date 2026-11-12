export interface AdminD1Statement {
  bind(...values: unknown[]): AdminD1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[]; success: boolean }>;
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
}
export interface AdminD1Database {
  prepare(query: string): AdminD1Statement;
  batch<T = unknown>(statements: AdminD1Statement[]): Promise<T[]>;
}
export interface AdminEnv {
  DB?: AdminD1Database;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  ADMIN_ALLOWED_EMAILS?: string;
  ADMIN_CI_SERVICE_TOKEN_IDS?: string;
}
export interface AdminIdentity {
  email: string;
  serviceToken?: boolean;
}
export interface AdminRequestContext {
  request: Request;
  env: AdminEnv;
  next?: () => Promise<Response>;
  params?: Record<string, string>;
}
export interface AccessClaims {
  aud: string | string[];
  exp: number;
  iat?: number;
  iss: string;
  email?: string;
  sub?: string;
  common_name?: string;
  service_token_id?: string;
  service_token_status?: boolean;
}
interface AccessJwkSet { keys: JsonWebKey[]; }
let cachedKeys: { expiresAt: number; keys: JsonWebKey[] } | null = null;

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
function decodeJsonPart<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}
async function getAccessKeys(teamDomain: string): Promise<JsonWebKey[]> {
  const now = Date.now();
  if (cachedKeys && cachedKeys.expiresAt > now) return cachedKeys.keys;
  const response = await fetch("https://" + teamDomain + "/cdn-cgi/access/certs", {
    headers: { accept: "application/json" }, signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Cloudflare Access signing keys are unavailable.");
  const data = await response.json() as AccessJwkSet;
  if (!Array.isArray(data.keys) || data.keys.length === 0) throw new Error("Cloudflare Access returned no signing keys.");
  cachedKeys = { keys: data.keys, expiresAt: now + 5 * 60 * 1000 };
  return data.keys;
}
export async function verifyAdminAccess(request: Request, env: AdminEnv): Promise<AdminIdentity | null> {
  let teamDomain = (env.CF_ACCESS_TEAM_DOMAIN || "").trim();
  if (teamDomain.startsWith("https://")) teamDomain = teamDomain.slice(8);
  if (teamDomain.startsWith("http://")) teamDomain = teamDomain.slice(7);
  teamDomain = teamDomain.replace(/\/$/, "");
  const expectedAudiences = new Set((env.CF_ACCESS_AUD || "").split(",").map((value) => value.trim()).filter(Boolean));
  const allowedEmails = new Set((env.ADMIN_ALLOWED_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
  const allowedServiceTokenIds = new Set((env.ADMIN_CI_SERVICE_TOKEN_IDS || "").split(",").map((value) => value.trim()).filter(Boolean));
  if (!teamDomain || expectedAudiences.size === 0 || (allowedEmails.size === 0 && allowedServiceTokenIds.size === 0)) return null;
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = decodeJsonPart<{ alg?: string; kid?: string }>(parts[0]);
    const claims = decodeJsonPart<AccessClaims>(parts[1]);
    if (header.alg !== "RS256" || !header.kid) return null;
    if (claims.iss !== "https://" + teamDomain || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    const tokenAudiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!tokenAudiences.some((audience) => expectedAudiences.has(audience))) return null;
    const serviceTokenId = (claims.service_token_id || claims.common_name || "").trim();
    const serviceTokenClaim = claims.service_token_status === true || (serviceTokenId.length > 0 && claims.sub === "");
    const isAllowedServiceToken = serviceTokenClaim && serviceTokenId.length > 0 && allowedServiceTokenIds.has(serviceTokenId);
    const email = (claims.email || "").trim().toLowerCase();
    if (serviceTokenClaim ? !isAllowedServiceToken : (!email || !allowedEmails.has(email))) return null;
    const keys = await getAccessKeys(teamDomain);
    const jwk = keys.find((key) => key.kid === header.kid);
    if (!jwk) return null;
    const publicKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const signedContent = new TextEncoder().encode(parts[0] + "." + parts[1]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, decodeBase64Url(parts[2]), signedContent);
    if (!valid) return null;
    return isAllowedServiceToken
      ? { email: "github-actions@yorphives.internal", serviceToken: true }
      : { email };
  } catch { return null; }
}
export async function requireAdmin(context: AdminRequestContext): Promise<AdminIdentity | Response> {
  if (!context.env.DB) return Response.json({ error: { code: "ADMIN_DATABASE_UNAVAILABLE", message: "The admin database is not configured." } }, { status: 503, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  const identity = await verifyAdminAccess(context.request, context.env);
  if (!identity) return Response.json({ error: { code: "ADMIN_AUTH_REQUIRED", message: "A valid, allowlisted Cloudflare Access session is required." } }, { status: 401, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  if (identity.serviceToken && !["GET", "HEAD"].includes(context.request.method.toUpperCase())) {
    return Response.json(
      { error: { code: "ADMIN_CI_READ_ONLY", message: "CI service identities are restricted to read-only Admin endpoints." } },
      { status: 403, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }
    );
  }
  return identity;
}
export function isAdminResponse(value: AdminIdentity | Response): value is Response { return value instanceof Response; }
export function adminJson(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } });
}
