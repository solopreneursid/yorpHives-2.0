import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/_middleware.js";

test("global preflight allows Bearer authorization and key revocation methods", async () => {
  const response = await onRequest({
    request: new Request("https://yorphives.test/api/v1/identity/keys", { method: "OPTIONS" }),
    next: async () => new Response("unexpected")
  });
  assert.equal(response.status, 204);
  assert.match(response.headers.get("Access-Control-Allow-Headers"), /Authorization/i);
  assert.match(response.headers.get("Access-Control-Allow-Methods"), /DELETE/);
});
