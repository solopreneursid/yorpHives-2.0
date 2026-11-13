# Cloudflare Access service-token isolation during authenticated staging QA

The previous browser smoke suite attached service credentials to every browser request through `extraHTTPHeaders`. That creates credential exfiltration risk if an untrusted preview loads a third-party resource or redirects outside Cloudflare Access.

The staging browser smoke now treats preview code as untrusted: credentials are used only by a Playwright route proxy whose URL is checked against the exact eight-hex deployment host under `*.yorphives-admin-staging.pages.dev`. Requests outside that origin are blocked. The proxy performs `route.fetch({ maxRedirects: 0 })` and sends credentials only with that single origin-bound request; browser redirects are rechecked by the route. Service workers and WebSocket connections are disabled to prevent alternate browser egress. Tests confirm these invariants without requiring real secrets.

The CI job continues to use separately scoped Access service tokens; it never gives tokens or founder administrator privileges to YorpMind. Authenticated live browser QA must still run and pass against the exact preview before the actual release gate is marked ready.
