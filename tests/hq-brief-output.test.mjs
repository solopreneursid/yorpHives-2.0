import test from "node:test";
import assert from "node:assert/strict";
import { readModelAnswer, parseMissionBrief, MissionBriefContractError } from "../hq-engine/brief-output.js";

const sample = () => ({
  summary: "Check the QR generator before release.",
  recommended_approach: "Reproduce, patch in isolation, and run regression tests.",
  actions: ["Reproduce the defect", "Propose a testable patch"],
  risks: ["Mobile layout could regress"],
  assumptions: ["A defect is still present"],
  verification_needed: ["Check desktop and mobile preview"]
});
test("AI brief parser accepts bounded objects, choices, text arrays and fenced JSON", () => {
  const text = JSON.stringify(sample());
  const fence = String.fromCharCode(96).repeat(3);
  const variants = [
    text, { response: text }, { result: { response: text } },
    { choices: [{ message: { content: text } }] },
    { response: [{ type: "text", text }] },
    fence + "json\n" + text + "\n" + fence,
    "<think>Reason about the result.</think>\nResult:\n" + text
  ];
  for (const variant of variants)
    assert.deepEqual(parseMissionBrief(variant), sample());
  assert.equal(typeof readModelAnswer({ response: text }), "string");
});
test("parser handles narrative containing complete JSON without guessing missing fields", () => {
  const report = sample();
  report.summary = 'Check a value containing { braces } and "quotes".';
  const output = "The model said: " + JSON.stringify(report) + "\nAll done.";
  assert.equal(parseMissionBrief(output).summary, report.summary);
});
test("malformed, empty, fabricated and oversized model output is blocked", () => {
  const rejects = [
    ["not json", "BRIEF_JSON_INVALID"],
    ['{"summary":"truncated"', "BRIEF_JSON_INVALID"],
    [{ response: 123 }, "BRIEF_RESPONSE_MISSING"],
    ["x".repeat(20001), "BRIEF_RESPONSE_TOO_LARGE"],
    [JSON.stringify({ summary: "Too little" }), "BRIEF_REQUIRED_FIELDS_MISSING"],
    [JSON.stringify({ ...sample(), verification_needed: [] }), "BRIEF_REQUIRED_FIELDS_MISSING"]
  ];
  for (const [input, code] of rejects) {
    assert.throws(() => parseMissionBrief(input), error =>
      error instanceof MissionBriefContractError && error.code === code);
  }
});
test("model prose stays inert and cannot set release authorization fields", () => {
  const sampleText = "<img src=x onerror=alert(1)>";
  const output = { ...sample(), summary: sampleText, actions: Array.from({ length: 20 }, (_, i) => "Task " + i) };
  const result = parseMissionBrief(output);
  assert.equal(result.summary, sampleText);
  assert.equal(result.actions.length, 8);
  assert.equal("verified" in result, false);
  assert.equal("production_approved" in result, false);
});
