import { requireAdmin, isAdminResponse, type AdminRequestContext } from "../_lib/admin-auth";
export async function onRequest(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  return context.next ? context.next() : new Response("Not found", { status: 404 });
}
