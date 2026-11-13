// Request identities exist only in this Node process after successful session
// verification. Headers, cookies supplied directly to an API module, environment
// strings and Cloudflare JWT assertions cannot manufacture an owner identity.
const identities = new WeakMap();
export function authorizeOwnerRequest(request, identity) {
  identities.set(request, Object.freeze({ ...identity }));
}
export async function verifyAdminAccess(request) {
  return identities.get(request) || null;
}
export async function requireAdmin(context) {
  if (!context.env.DB) return adminJson({ error: { code: 'ADMIN_DATABASE_UNAVAILABLE', message: 'The private SQLite database is unavailable.' } }, 503);
  const identity = identities.get(context.request);
  return identity || adminJson({ error: { code: 'ADMIN_AUTH_REQUIRED', message: 'Sign in with your private owner session.' } }, 401);
}
export async function requireOwnerStepUp() {
  return adminJson({ error: { code: 'STEP_UP_NOT_CONFIGURED', message: 'An independent approval provider has not been connected to this self-hosted runtime.' } }, 503);
}
export async function verifyTemporaryAssistantAccess() { return null; }
export function isAdminResponse(value) { return value instanceof Response; }
export function adminJson(data, status = 200) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' } });
}
