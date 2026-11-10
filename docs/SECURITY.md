# Security and Trust Baseline

## Initial public surface

The initial text capability is public, deterministic, and has no external side effects. It does not require accounts or persist user text. It is not intended for secrets or sensitive personal data.

## Current controls

- JSON-only execution requests.
- 32 KiB request body limit.
- 20,000 character capability input limit.
- Explicit capability and version allowlist.
- No dynamic code execution, arbitrary URL fetching, or provider calls.
- Structured errors without stack traces.
- Request identifiers and no-store execution responses.
- Public read-only catalog and OpenAPI metadata.
- Cross-origin access is public and unauthenticated for this free capability only.

## Required before paid or stateful capabilities

- Identity provider and verified principal model.
- Scoped API keys / OAuth grants; no shared master credentials.
- Capability-level authorization and tenant isolation.
- Server-side budget reservation and spending ceilings.
- Idempotency keys bound to principal + capability + canonical request hash.
- Rate limiting and abuse detection at edge and principal level.
- Per-capability timeout, concurrency, payload, and output limits.
- SSRF controls and strict egress allowlists for network-capable capabilities.
- Malware scanning and content validation for file uploads.
- Audit events for authorization, execution, billing, and administrative actions.
- Human approval for irreversible, external, or high-impact actions.
- Secrets management; no credentials in source, browser bundles, logs, or capability outputs.
- Retention and deletion policy for every data class.
- Security review and abuse tests before publishing a new capability.

## Agent-specific threat model

Treat agent input, tool arguments, retrieved documents, and third-party capability output as untrusted. Never let instructions embedded in content override system policy. Do not grant agents ambient authority. Require explicit scopes, declared cost ceilings, and human approval for consequential side effects.

## Production release blockers

No paid execution, user data persistence, external provider integration, third-party code execution, or autonomous payment is enabled in the initial slice. These remain blocked until the controls above are implemented and tested.
