import { requireAdmin, isAdminResponse, type AdminRequestContext } from "../_lib/admin-auth";
import { headquartersResponse, headquartersSnapshot } from "../_lib/headquarters";
export async function onRequest(context: AdminRequestContext): Promise<Response> {
  const identity = await requireAdmin(context);
  if (isAdminResponse(identity)) return identity;
  const url = new URL(context.request.url);
  const accept = context.request.headers.get("accept") || "";
  if ((url.pathname === "/admin/" || url.pathname === "/admin") && context.request.method === "GET" &&
      (accept.includes("text/markdown") || accept.includes("application/json") || ["markdown", "json"].includes(url.searchParams.get("format") || ""))) {
    return headquartersResponse(context.request, await headquartersSnapshot(context.env.DB!));
  }
  return context.next ? context.next() : new Response("Not found", { status: 404 });
}
