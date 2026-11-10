import { authenticate, failure, success } from "../../../_lib/platform.js";

export async function onRequestGet({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return auth.response;
  if (!auth.principal) return failure("AUTHENTICATION_REQUIRED", "Supply an API credential to identify this caller.", 401, request);
  if (!auth.principal.scopes.includes("identity:read")) return failure("INSUFFICIENT_SCOPE", "This credential cannot read identity details.", 403, request, { required_scope: "identity:read" });
  return success({ id: auth.principal.id, kind: auth.principal.kind, display_name: auth.principal.display_name, scopes: auth.principal.scopes });
}
