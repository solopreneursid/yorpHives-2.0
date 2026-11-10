# Identity and Authorization

## Principal model

YorpHives distinguishes four principal types: human, developer, agent, and service. A principal is a durable identity; an API key is a revocable credential belonging to that identity. Never use an API key itself as the principal identifier.

The first provisioning path is intentionally operator-controlled through `POST /api/v1/identity/provision`. It requires the `YH_BOOTSTRAP_SECRET` runtime secret. This is a bootstrap mechanism, not public signup or an OAuth authorization server.

## API credentials

- Bearer format: `yh_live_<base64url-encoded-256-bit-secret>`.
- Only SHA-256 hashes and short prefixes are stored. The secret is returned once.
- Credentials have labels, scopes, optional expiry, last-used time, and revocation time.
- Revoke with `DELETE /api/v1/identity/keys?id=<key-id>`.
- Create and list keys with `/api/v1/identity/keys`.
- A new key cannot receive scopes its parent credential does not possess.

## Scopes

- `identity:read`
- `capability:execute`
- `usage:read`
- `credits:read`
- `keys:manage`
- `commerce:checkout`

Never issue an ambient all-powerful key to an agent. Create separate keys for each agent, environment, and purpose. Do not expose a server-side key in a browser bundle.

## Capability grants

A valid principal and API key are not sufficient authorization for every capability. Execution requires `capability:execute`, and non-public capabilities additionally require an enabled row in `capability_grants`. Public free capabilities are explicitly allowlisted in the gateway.

## Bootstrap setup

Set `YH_BOOTSTRAP_SECRET` as an encrypted secret on the isolated Cloudflare Pages project before provisioning the first owner/developer principal. Send the secret only in the `X-YorpHives-Bootstrap` header. Do not commit it or put it in frontend code.

## Deferred identity work

This phase does not yet implement email verification, passwordless login, OAuth 2.1 authorization-code + PKCE, external identity federation, agent delegation tokens, or workload identity federation. Those require explicit provider selection, callback/domain configuration, account recovery and consent UX. API-key identity is the first service identity layer, not a complete consumer login system.
