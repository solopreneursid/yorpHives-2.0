/**
 * Bounded provider-reported token accounting.
 * This is not a Cloudflare billing invoice, cost estimate or authorization.
 * Omitted/invalid usage is unknown, never zero.
 */
export function normalizeModelUsage(result) {
  const usage = result?.usage ?? result?.result?.usage;
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;
  const good = n => Number.isSafeInteger(n) && n >= 0 && n <= 10000000;
  const input = usage.prompt_tokens, output = usage.completion_tokens;
  if (!good(input) || !good(output)) return null;
  const total = usage.total_tokens;
  if (total !== undefined && total !== null && (!good(total) || total < input + output))
    return null;
  return {
    input_tokens: input,
    output_tokens: output,
    total_tokens: good(total) ? total : input + output,
    source: "provider_response",
    billing_verified: false,
    actual_cost_usd: null
  };
}
