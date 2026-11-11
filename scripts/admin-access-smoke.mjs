const targets = [
  {
    origin: "https://admin-staging.yorphives.com",
    label: "custom Admin hostname"
  },
  {
    origin: "https://yorphives-admin-staging.pages.dev",
    label: "Pages project hostname"
  },
  {
    origin: "https://a872393c.yorphives-admin-staging.pages.dev",
    label: "deployment-specific Pages hostname"
  }
];

const protectedPaths = ["/admin/", "/api/admin/overview"];

async function assertDenied(origin, path, label) {
  const url = new URL(path, origin);
  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: {
      accept: "application/json, text/html",
      "cache-control": "no-cache"
    }
  });

  const location = response.headers.get("location") || "";
  const accessRedirect =
    response.status === 302 &&
    (location.includes("/cdn-cgi/access/login") ||
      location.includes("cloudflareaccess.com"));
  const edgeDenied =
    (response.status === 401 || response.status === 403) &&
    Boolean(response.headers.get("cf-ray"));
  if (!accessRedirect && !edgeDenied) {
    const body = (await response.text()).slice(0, 240);
    throw new Error(
      `Anonymous access was not denied for ${label} (${url.href}): HTTP ${response.status}; location=${location}; body=${body}`
    );
  }
  console.log(`PASS anonymous request denied: ${label} ${path} (HTTP ${response.status})`);
}

for (const target of targets) {
  for (const path of protectedPaths) {
    await assertDenied(target.origin, path, target.label);
  }
}
