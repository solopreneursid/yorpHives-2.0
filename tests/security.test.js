import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createApiSecret, sha256Hex, constantTimeEqual, verifyStripeSignature } from "../functions/_lib/security.js";

test("API credentials are high entropy, prefixed and hashable", async () => {
  const { secret, prefix } = createApiSecret();
  assert.match(secret, /^yh_live_[A-Za-z0-9_-]{43}$/);
  assert.equal(prefix, secret.slice(0, 16));
  assert.equal((await sha256Hex(secret)).length, 64);
  assert.notEqual(await sha256Hex(secret), secret);
});

test("constant-time comparison handles equal and unequal lengths", () => {
  assert.equal(constantTimeEqual("same-value", "same-value"), true);
  assert.equal(constantTimeEqual("same-value", "different"), false);
  assert.equal(constantTimeEqual("a", "longer"), false);
});

test("Stripe signatures are verified with timestamp tolerance", async () => {
  const payload = JSON.stringify({ id: "evt_test", type: "checkout.session.completed" });
  const secret = "whsec_test_secret";
  const timestamp = 1794330000;
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  assert.equal(await verifyStripeSignature(payload, `t=${timestamp},v1=${signature}`, secret, timestamp * 1000), true);
  assert.equal(await verifyStripeSignature(payload, `t=${timestamp - 600},v1=${signature}`, secret, timestamp * 1000), false);
  assert.equal(await verifyStripeSignature(payload, `t=${timestamp},v1=bad`, secret, timestamp * 1000), false);
});
