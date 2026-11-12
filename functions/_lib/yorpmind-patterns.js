/**
 * Pure, deterministic YorpMind evolution signal analysis.
 * Source evidence is founder-reported QA; NOT verified current correctness.
 * No models, prompts, network or code execution are used by this module.
 */
const IGNORED = new Set([
  "about","after","again","also","and","are","been","before","between",
  "broken","check","does","error","errors","failure","failures","fix","fixed",
  "from","have","issue","issues","more","problem","problems","repair","repairs",
  "some","that","their","them","these","this","those","tool","tools",
  "when","where","which","with","your"
]);
const WORD = /^[a-z0-9]{3,28}$/;

export function patternTerms(title) {
  if (typeof title !== "string" || title.length > 180) return [];
  return [...new Set((title.normalize("NFKC").toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter(word => WORD.test(word) && !IGNORED.has(word)))].sort().slice(0, 10);
}

export function detectYorpMindPatterns(experiences, skills, maxProposals = 3) {
  if (!Array.isArray(experiences) || !Array.isArray(skills)) return [];
  const observed = experiences.filter(row =>
    row.scope === "headquarters" && row.status === "recorded" &&
    row.evidence_level === "founder_reported_qa" &&
    row.source_type === "repair_qa" &&
    typeof row.experience_id === "string" && typeof row.source_id === "string" &&
    typeof row.title === "string"
  ).slice(0, 100).map(row => ({ ...row, terms: patternTerms(row.title) }));
  const patterns = new Map();
  for (let i = 0; i < observed.length; i++) {
    for (let j = i + 1; j < observed.length; j++) {
      const a = observed[i], b = observed[j];
      if (a.source_id === b.source_id) continue;
      const shared = a.terms.filter(term => b.terms.includes(term));
      if (shared.length < 2) continue;
      const key = shared.slice(0, 2).join("-");
      if (key.length < 7 || key.length > 80) continue;
      const group = patterns.get(key) || new Map();
      group.set(a.source_id, a);
      group.set(b.source_id, b);
      patterns.set(key, group);
    }
  }

  const candidates = [];
  for (const [topicKey, items] of patterns) {
    const records = [...items.values()].sort((a,b) =>
      String(b.created_at).localeCompare(String(a.created_at)) ||
      a.experience_id.localeCompare(b.experience_id)).slice(0, 5);
    if (records.length < 2) continue;
    const topicTerms = topicKey.split("-");
    const related = skills.find(s =>
      s.status === "approved" && s.approved_revision === s.current_revision &&
      topicTerms.every(term => patternTerms(s.title + " " + s.purpose).includes(term))
    );
    const candidateType = related ? "review_reference_skill" : "new_reference_skill";
    // Never carry arbitrary lesson contents into system-generated proposals.
    const rationale = related
      ? "Repeated founder-reported repair topics overlap an existing reference skill. Review its relevance and regression evidence; no change has been made."
      : "Repeated founder-reported repair topics could justify a reusable reference procedure. Verify source QA independently before drafting a skill.";
    candidates.push({
      topic_key: topicKey,
      candidate_type: candidateType,
      related_skill_id: related?.skill_id || null,
      evidence_ids: records.map(row => row.experience_id),
      evidence_count: records.length,
      rationale,
      analysis_method: "deterministic_title_overlap_v1",
      independently_verified: false,
      skill_executable: false,
      proposed_for_owner_review: true
    });
  }
  candidates.sort((a,b) =>
    b.evidence_count - a.evidence_count ||
    a.topic_key.localeCompare(b.topic_key));
  return candidates.slice(0, Math.min(3, Math.max(0, Number.isInteger(maxProposals) ? maxProposals : 3)));
}
