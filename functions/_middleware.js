const OVERVIEW = `# YorpHives

YorpHives connects five audiences:

- People discover practical tools and resources.
- Businesses discover pathways to build solutions.
- Developers and creators discover opportunities to create, contribute, publish, and earn.
- Users discover and adopt applications.
- AI agents discover structured capabilities and execute permitted actions.

YorpHives is building one connected ecosystem with clear discovery, trustworthy listings, explicit permissions, and human- and machine-readable interfaces.

Payments and subscriptions use Dodo Payments. Paid access is granted only after server-side verification of provider webhooks and reconciliation into YorpHives entitlements. Browser redirects do not grant access.

Contact: connect@yorphives.com
Website: https://yorphives.com/
`;

/** Only an isolated Headquarters Pages deployment should open on /admin/.
 * The shared repository also serves the public website, so never redirect
 * arbitrary hosts, the live site, API routes, or its markdown overview.
 */
export function isHeadquartersPreviewRoot(url, method, wantsMarkdown = false) {
  return (method === "GET" || method === "HEAD") &&
    url.pathname === "/" && !wantsMarkdown &&
    /^[0-9a-f]{8}\.yorphives-admin-staging\.pages\.dev$/i.test(url.hostname) &&
    url.protocol === "https:";
}

function applyTransportSecurity(response) {
  const headers = new Headers(response.headers);
  headers.set("Strict-Transport-Security", "max-age=31536000");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const accept = request.headers.get("accept") || "";
  const wantsMarkdown =
    url.pathname === "/" &&
    (url.searchParams.get("format") === "markdown" ||
      accept.includes("text/markdown"));

  if (isHeadquartersPreviewRoot(url, request.method, wantsMarkdown)) {
    // Relative location prevents cross-origin redirects, and drops tracking
    // query parameters rather than forwarding them into private Headquarters.
    return applyTransportSecurity(new Response(null, {
      status: 302,
      headers: {
        "location": "/admin/",
        "cache-control": "no-store, private",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer"
      }
    }));
  }

  if (wantsMarkdown && request.method === "GET") {
    return applyTransportSecurity(new Response(OVERVIEW, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "cache-control": "public, max-age=300",
        "x-content-type-options": "nosniff",
        "vary": "Accept",
      },
    }));
  }

  return applyTransportSecurity(await next());
}
