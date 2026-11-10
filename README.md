# YorpHives 2.0

**An open capability platform for people and agents.**

YorpHives helps humans and AI agents discover, understand, invoke, and compose useful software capabilities—with explicit permissions, transparent economics, and verifiable execution.

## Product principles

1. **Outcome-first discovery:** organize around what people want to accomplish, not a directory of buzzwords.
2. **One capability, multiple interfaces:** human UI, HTTP API, and agent protocols share one canonical capability contract.
3. **Readable, discoverable, callable, payable:** machine interfaces are product surfaces, not documentation afterthoughts.
4. **Trust before autonomy:** explicit identity, scopes, budgets, idempotency, auditability, and approval boundaries.
5. **Economics by design:** free access, advertising, affiliate referrals, sponsorships, one-time purchases, credits, usage pricing, licensing, and marketplace fees can coexist.
6. **Portable core:** provider-specific infrastructure stays behind adapters and deployment boundaries.
7. **Solo-founder economics:** deterministic execution first; add expensive AI and infrastructure only when demand proves the need.

## Initial implementation

The first vertical slice is deliberately small:
- Premium, responsive capability discovery experience.
- Canonical capability catalog served as machine-readable JSON.
- Deterministic text-analysis capability with human and agent execution paths.
- Versioned HTTP API and OpenAPI contract.
- Agent discovery resources.
- Structured errors, input limits, CORS policy, and request identifiers.
- Deployment and verification gates.

## Architecture

The initial deployment target is Cloudflare Pages + Pages Functions as a low-cost first slice. The production domain and existing processing Worker are not modified by this repository's initial rollout. The domain can move only after preview validation and an explicit cutover plan.

See:
- [Architecture](docs/ARCHITECTURE.md)
- [Capability contract](docs/CAPABILITY-CONTRACT.md)
- [Security model](docs/SECURITY.md)
- [Revenue architecture](docs/REVENUE-ARCHITECTURE.md)
- [Delivery roadmap](docs/ROADMAP.md)

## Local development

Requirements: Node.js 20+.

```bash
npm install
npm run dev
npm run test
npm run build
```

## Deployment

The intended preview deployment is a separate Cloudflare Pages project connected to this repository. Production DNS and the existing `yorphives.com` Pages project remain untouched until a deliberate migration decision.

## Status

Early foundation. No claim of production or agentic readiness is made until the acceptance gates in the roadmap pass against deployed infrastructure.
