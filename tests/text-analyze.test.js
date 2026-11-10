import test from "node:test";
import assert from "node:assert/strict";
import { analyzeText } from "../functions/_lib/text-analyze.js";

test("counts words, characters, sentences and paragraphs", () => {
  const result = analyzeText({ text: "Hello world. Hello agent!\n\nBuild useful things." });
  assert.equal(result.ok, true);
  assert.equal(result.data.word_count, 7);
  assert.equal(result.data.sentence_count, 3);
  assert.equal(result.data.paragraph_count, 2);
  assert.equal(result.data.top_terms[0].term, "hello");
  assert.equal(result.data.top_terms[0].count, 2);
});

test("counts Unicode words and code points", () => {
  const result = analyzeText({ text: "Café 東京 42 don't" });
  assert.equal(result.ok, true);
  assert.equal(result.data.word_count, 4);
  assert.equal(result.data.character_count, [..."Café 東京 42 don't"].length);
});

test("rejects missing and empty text with structured codes", () => {
  assert.equal(analyzeText({}).code, "INVALID_INPUT");
  assert.equal(analyzeText({ text: "  " }).code, "EMPTY_INPUT");
});

test("rejects text above the declared maximum", () => {
  const result = analyzeText({ text: "x".repeat(20001) });
  assert.equal(result.ok, false);
  assert.equal(result.code, "INPUT_TOO_LARGE");
});

test("does not mutate input", () => {
  const input = { text: "A small immutable input." };
  const before = structuredClone(input);
  analyzeText(input);
  assert.deepEqual(input, before);
});
