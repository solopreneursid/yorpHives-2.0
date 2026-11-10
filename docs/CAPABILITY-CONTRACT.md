# Capability Contract

Every published capability must define the following before its status can become `available`.

## Required fields

- Stable `id` and semantic `version`
- Human name, concise summary, description, category, tags
- Lifecycle status: planned, testing, available, maintenance, retired
- Supported interfaces and canonical invocation path
- JSON Schema input and output contracts
- Authentication and authorization requirements
- Pricing model, unit, currency, and pre-execution cost disclosure
- Execution timeout, input limits, synchronous/asynchronous semantics
- Idempotency and retry semantics
- Data retention, processing, training-use, and deletion behavior
- External side effects and human-approval requirements
- Compatibility and deprecation policy

## Invocation envelope

```json
{
  "capability": "text.analyze",
  "version": "1.0.0",
  "input": { "text": "Example input" }
}
```

## Success envelope

```json
{
  "status": "succeeded",
  "request_id": "opaque-request-id",
  "capability": { "id": "text.analyze", "version": "1.0.0" },
  "data": {},
  "usage": { "billable": false, "units": 1, "pricing_model": "free" },
  "data_handling": { "persisted": false, "retention": "none" }
}
```

## Error envelope

```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "Provide input.text as a string.",
    "retryable": false,
    "request_id": "opaque-request-id",
    "details": { "field": "input.text", "expected": "string" }
  }
}
```

## Rules

1. Never silently change a published contract.
2. Unknown versions return `CAPABILITY_NOT_FOUND` with a discovery hint.
3. Validate input at the gateway and again inside the handler where necessary.
4. Retries must not duplicate billable side effects.
5. Billing must be driven by authoritative execution events, not client claims.
6. Never expose a capability as available until its runtime and contract tests pass.
7. Human UI, HTTP, and MCP must share the same handler and output semantics.
