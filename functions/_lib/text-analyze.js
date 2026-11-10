const STOP_WORDS = new Set(("a an and are as at be been but by can could did do does for from had has have he her hers him his how i if in into is it its may me might more most my no not of on one or our ours out over she should so some such than that the their theirs them then there these they this those through to too under up us very was we were what when where which while who will with would you your yours").split(" "));

export function analyzeText(input) {
  if (!input || typeof input.text !== "string") {
    return { ok: false, code: "INVALID_INPUT", message: "Provide input.text as a string.", details: { field: "input.text", expected: "string" } };
  }
  const text = input.text;
  if (text.length > 20000) {
    return { ok: false, code: "INPUT_TOO_LARGE", message: "Text must be 20,000 characters or fewer.", details: { field: "input.text", max_length: 20000 } };
  }
  if (!text.trim()) {
    return { ok: false, code: "EMPTY_INPUT", message: "Provide non-empty text to analyze.", details: { field: "input.text" } };
  }

  const words = text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [];
  const sentences = text.trim().split(/[.!?。！？]+(?:\s|$)/u).filter(part => part.trim().length > 0);
  const frequencies = new Map();
  for (const raw of words) {
    const term = raw.toLocaleLowerCase("en");
    if (term.length < 3 || STOP_WORDS.has(term)) continue;
    frequencies.set(term, (frequencies.get(term) || 0) + 1);
  }
  const topTerms = [...frequencies.entries()]
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, 5);

  return {
    ok: true,
    data: {
      word_count: words.length,
      character_count: [...text].length,
      character_count_without_spaces: [...text].filter(char => !/\s/u.test(char)).length,
      sentence_count: sentences.length,
      paragraph_count: text.split(/\n\s*\n/u).filter(part => part.trim()).length,
      estimated_reading_minutes: Math.max(1, Math.ceil(words.length / 225)),
      top_terms: topTerms,
      language_hint: "und",
      processed_at: new Date().toISOString()
    }
  };
}
