# Revenue Architecture

Subscriptions are optional. Monetization is modeled as independent offers attached to capabilities, content, placements, or provider transactions.

## Revenue channels

1. Advertising on suitable free discovery and editorial pages.
2. Affiliate referrals with explicit disclosure and relevance-based ranking.
3. One-time purchases for individual outcomes.
4. Prepaid credit bundles for occasional users.
5. Pay-per-successful-execution for metered capabilities.
6. Sponsorships and clearly labeled sponsored placements.
7. Editorial partnerships and paid technical contributions subject to editorial review.
8. Qualified lead referrals with explicit user consent.
9. Business licensing, embedded capabilities, and private deployments.
10. Third-party provider marketplace commissions.
11. Original content, data, benchmarks, and workflow licensing where usage can be measured and licensed.

## Shared commerce domain

Future entities:
- Offer: what is sold and under which terms.
- Price: amount, currency, unit, tax treatment, effective period.
- Entitlement: what a principal is allowed to consume.
- Usage event: authoritative record of execution and billable units.
- Reservation: budget reserved before a potentially paid execution.
- Order and payment: external payment provider state.
- Credit ledger: append-only grants, debits, reversals, expirations.
- Attribution: source, campaign, affiliate, sponsor, referral.
- Provider settlement: provider share, platform fee, payout state.

## Non-negotiable economics

- Show price and billable unit before execution.
- Charge only from server-authoritative success events.
- Define failed, retried, cancelled, and partial execution billing behavior.
- Use idempotent payment and usage events.
- Keep financial ledgers append-only and reconcile with payment provider records.
- Disclose sponsorships and affiliate relationships.
- Never sell personal data or share lead data without consent.
- Track gross margin by capability: revenue minus compute, provider, storage, and payment fees.
- Do not add a marketplace until provider demand and platform demand exist.

## Initial release

No payments or ads are wired into the first vertical slice. The first release validates useful execution and discovery. Monetization is introduced only after usage, conversion, and unit economics can be measured.
