# Preview Secret Configuration

Configure secrets on the **Preview** environment of Cloudflare Pages project \`yorphives-2-preview\` only.

Cloudflare Dashboard → Workers & Pages → \`yorphives-2-preview\` → Settings → Variables and Secrets → Preview.

Do not paste secret values into GitHub, source files, the browser bundle, issue comments, or public chat.

## Required before principal provisioning

Add \`YH_BOOTSTRAP_SECRET\` as an encrypted Preview secret. Generate a high-entropy value locally, for example:

\`\`\`bash
openssl rand -base64 48
\`\`\`

Then provision the first developer/operator principal by calling:

\`\`\`http
POST /api/v1/identity/provision
Content-Type: application/json
X-YorpHives-Bootstrap: <your bootstrap secret>
\`\`\`

Example request body (choose the actual display name and limits before sending):

\`\`\`json
{
  "kind": "developer",
  "display_name": "YorpHives Operator",
  "scopes": [
    "identity:read",
    "capability:execute",
    "usage:read",
    "credits:read",
    "keys:manage",
    "commerce:checkout",
    "commerce:orders:read",
    "capabilities:grant"
  ],
  "daily_spending_limit_minor": 0,
  "monthly_spending_limit_minor": 0
}
\`\`\`

The API key in the response is shown once. Store it in a password manager or secret store immediately. Do not put it in frontend JavaScript. The zero spending ceilings are deliberate until paid capabilities and prices have been reviewed.

## Required before Stripe test checkout

Use a Stripe **test-mode** account first. Add these as encrypted Preview secrets:

- \`STRIPE_SECRET_KEY\` — test-mode secret key.
- \`STRIPE_WEBHOOK_SECRET\` — signing secret for the preview webhook endpoint.
- \`YH_COMMERCE_RECONCILE_SECRET\` — separate random operator secret for manual reconciliation.

Add \`YH_CREDIT_PACKS_JSON\` as a Preview variable (not a secret). It must be a JSON array of server-defined packs with this shape:

\`\`\`json
[
  {
    "id": "your-pack-id",
    "credits": 100,
    "amount_minor": 0,
    "currency": "INR"
  }
]
\`\`\`

Replace \`amount_minor\` with a deliberately chosen non-zero test price in the currency's minor units. Do not copy a guessed price into production. The API ignores client-supplied prices and only accepts a configured \`pack_id\`.

Configure the Stripe test webhook to send:
- \`checkout.session.completed\`
- \`checkout.session.async_payment_succeeded\`

Endpoint: \`https://build-trust-commerce-foundat.yorphives-2-preview.pages.dev/api/webhooks/stripe\`

The checkout endpoint remains disabled until all required test-mode configuration is present. The webhook does not issue credits until signature, payment status, session ID, order ID, principal ID, amount and currency all match.

## Before any live payment

Do not replace test keys with live keys until refunds, disputes, tax/invoice treatment, provider payout reconciliation, scheduled reconciliation, backup/restore, customer support and legal disclosures are complete and reviewed. Configure production secrets separately on a separate production D1 database; never reuse preview credentials or preview data.
