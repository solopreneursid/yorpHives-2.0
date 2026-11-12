(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const node = (tag, cls, value) => {
    const item = document.createElement(tag);
    if (cls) item.className = cls;
    if (value !== undefined) item.textContent = String(value);
    return item;
  };
  const formatDate = value => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "Not recorded" : parsed.toLocaleString();
  };
  const linesToSteps = text => text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const state = { snapshot: null, loading: false };

  function status(id, message, kind = "neutral") {
    const target = $(id);
    target.textContent = message;
    target.dataset.kind = kind;
  }

  function stat(label, count, hint) {
    const item = node("article", "ym-stat");
    item.append(node("span", "ym-stat-name", label),
      node("strong", "ym-stat-number", count),
      node("small", "ym-stat-hint", hint));
    return item;
  }

  function renderExperienceList(experiences) {
    const container = $("ym-experience-list");
    container.replaceChildren();
    if (!experiences.length) {
      container.append(node("p", "ym-empty", "No founder-recorded QA lessons yet. Capture one from a reviewed repair above."));
      return;
    }
    for (const item of experiences) {
      const card = node("article", "ym-entry");
      const top = node("div", "ym-entry-head");
      top.append(node("strong", "", item.title), node("span", "ym-badge ym-badge-private", "PRIVATE · QA RECORDED"));
      card.append(top,
        node("p", "ym-entry-summary", item.lesson),
        node("small", "ym-source", "Repair " + item.source_id.slice(0, 8) + " · Commit " +
          item.source_commit_sha.slice(0, 12) + " · " + formatDate(item.created_at))
      );
      container.append(card);
    }
  }

  function makeSourceSelect(selected) {
    const select = node("select", "ym-inline-select");
    select.setAttribute("aria-label", "Evidence source for this skill revision");
    for (const experience of (state.snapshot?.experiences || []).filter(x => x.status === "recorded")) {
      const option = node("option", "", experience.title);
      option.value = experience.experience_id;
      select.append(option);
    }
    if (selected) select.value = selected;
    return select;
  }

  async function mutate(payload, button, messageId) {
    button.disabled = true;
    status(messageId, "Saving a private, audited change…");
    try {
      await api("/api/admin/yorpmind", { method: "POST", body: JSON.stringify(payload) });
      status(messageId, "Saved. Reloading verified records…", "success");
      await window.loadYorpMind();
      return true;
    } catch (error) {
      status(messageId, error instanceof Error ? error.message : "Could not save this change.", "error");
      return false;
    } finally {
      button.disabled = false;
    }
  }

  function renderSkillList(skills) {
    const container = $("ym-skill-list");
    container.replaceChildren();
    if (!skills.length) {
      container.append(node("p", "ym-empty", "No skills yet. Start with a recorded experience and propose a reference procedure."));
      return;
    }
    for (const skill of skills) {
      const card = node("article", "ym-entry ym-skill-entry");
      const header = node("div", "ym-entry-head");
      header.append(node("strong", "", skill.title),
        node("span", "ym-badge " + (skill.status === "approved" ? "ym-badge-approved" : "ym-badge-draft"),
          skill.status.toUpperCase() + " · REV " + skill.current_revision));
      card.append(header, node("p", "ym-entry-summary", skill.purpose));
      const details = node("details", "ym-procedure");
      details.append(node("summary", "", "Read versioned procedure · " + skill.steps.length + " steps"));
      const order = node("ol");
      for (const step of skill.steps) order.append(node("li", "", step));
      details.append(order);
      card.append(details, node("small", "ym-source",
        "Skill " + skill.slug + " · Source " + skill.source_experience_id.slice(0, 8) +
        " · Updated " + formatDate(skill.updated_at)));
      if (skill.status === "draft") {
        const review = node("div", "ym-review");
        const label = node("label", "", "Founder review note (minimum 40 characters)");
        const note = node("textarea");
        note.placeholder = "Describe the test evidence, limits and why this procedure is or is not useful.";
        note.minLength = 40;
        note.maxLength = 1200;
        note.rows = 3;
        label.append(note);
        const actions = node("div", "ym-inline-actions");
        const approve = node("button", "button primary", "Approve reference skill");
        const reject = node("button", "button", "Reject");
        approve.type = reject.type = "button";
        const result = node("p", "ym-form-status");
        const submit = decision => async () => {
          const text = note.value.trim();
          if (text.length < 40 || text.length > 1200) {
            result.textContent = "Write 40–1200 characters explaining the review.";
            return;
          }
          if (decision === "approve" && !confirm(
            "Approve this versioned skill as reference text? This does not authorize AI execution, code edits or production release."
          )) return;
          const button = decision === "approve" ? approve : reject;
          await mutate({
            action: "review_skill",
            skill_id: skill.skill_id,
            expected_revision: skill.current_revision,
            decision,
            review_note: text
          }, button, result.id);
        };
        result.id = "ym-result-" + skill.skill_id;
        approve.addEventListener("click", submit("approve"));
        reject.addEventListener("click", submit("reject"));
        actions.append(approve, reject);
        review.append(label, actions, result);
        card.append(review);
      }
      if (skill.status !== "retired") {
        const revision = node("details", "ym-revise");
        revision.append(node("summary", "", "Propose revised steps (resets approval)"));
        const form = node("form", "ym-form");
        const sourceLabel = node("label", "", "New revision evidence");
        const source = makeSourceSelect(skill.source_experience_id);
        source.required = true;
        sourceLabel.append(source);
        const stepLabel = node("label", "", "Revised procedure · one step per line");
        const steps = node("textarea");
        steps.value = skill.steps.join("\n");
        steps.rows = 5;
        steps.required = true;
        stepLabel.append(steps);
        const submit = node("button", "button", "Save new draft revision");
        submit.type = "submit";
        const result = node("p", "ym-form-status");
        result.id = "ym-revision-" + skill.skill_id;
        form.append(sourceLabel, stepLabel, submit, result);
        form.addEventListener("submit", async event => {
          event.preventDefault();
          await mutate({
            action: "revise_skill", skill_id: skill.skill_id,
            expected_revision: skill.current_revision,
            source_experience_id: source.value,
            steps: linesToSteps(steps.value)
          }, submit, result.id);
        });
        revision.append(form);
        card.append(revision);
      }
      container.append(card);
    }
  }

  function render(snapshot) {
    state.snapshot = snapshot;
    $("ym-updated").textContent =
      "Private knowledge loaded · " + formatDate(snapshot.generated_at) +
      " · recent 30 items per category · all procedures are non-executable";
    $("ym-stats").replaceChildren(
      stat("Recorded experiences", snapshot.counts.experiences, "Founder-reported QA evidence"),
      stat("Draft skills", snapshot.counts.draft_skills, "Founder review required"),
      stat("Approved reference skills", snapshot.counts.approved_reference_skills, "Documentation only"),
      stat("Agent execution", "OFF", "No public access or production writes")
    );
    const select = $("ym-skill-source");
    const previous = select.value;
    select.replaceChildren();
    const eligible = snapshot.experiences.filter(x => x.status === "recorded");
    if (!eligible.length) {
      const option = node("option", "", "Record a reviewed experience first");
      option.value = "";
      select.append(option);
    } else {
      for (const experience of eligible) {
        const option = node("option", "", experience.title + " · " + experience.source_commit_sha.slice(0, 8));
        option.value = experience.experience_id;
        select.append(option);
      }
      if (eligible.some(x => x.experience_id === previous)) select.value = previous;
    }
    $("ym-propose-skill").disabled = eligible.length === 0;
    renderExperienceList(snapshot.experiences);
    renderSkillList(snapshot.skills);
  }

  window.loadYorpMind = async () => {
    if (state.loading) return;
    state.loading = true;
    $("ym-updated").textContent = "Verifying private YorpMind knowledge…";
    try {
      const data = await api("/api/admin/yorpmind");
      if (data.name !== "YorpMind" || data.scope !== "headquarters" ||
          data.policy?.public_access_enabled !== false ||
          data.policy?.autonomous_skill_execution_enabled !== false ||
          data.policy?.production_changes_enabled !== false) {
        throw new Error("YorpMind policy integrity could not be verified.");
      }
      render(data);
    } catch (error) {
      $("ym-updated").textContent = error instanceof Error ? error.message : "YorpMind is temporarily unavailable.";
      $("ym-stats").replaceChildren();
      $("ym-experience-list").replaceChildren(node("p", "ym-empty", "No verified knowledge loaded. Retry after checking private D1 migration 0024."));
      $("ym-skill-list").replaceChildren(node("p", "ym-empty", "The skill registry is unavailable."));
      throw error;
    } finally {
      state.loading = false;
    }
  };

  function bind() {
    $("ym-refresh").addEventListener("click", () => window.loadYorpMind().catch(() => {}));
    $("ym-memory-form").addEventListener("submit", async event => {
      event.preventDefault();
      const button = $("ym-save-memory");
      const saved = await mutate({
        action: "capture_repair_experience",
        repair_job_id: $("ym-repair-id").value.trim(),
        title: $("ym-memory-title-input").value.trim(),
        lesson: $("ym-memory-lesson").value.trim()
      }, button, "ym-memory-status");
      if (saved) $("ym-memory-form").reset();
    });
    $("ym-skill-form").addEventListener("submit", async event => {
      event.preventDefault();
      const button = $("ym-propose-skill");
      const saved = await mutate({
        action: "propose_skill",
        source_experience_id: $("ym-skill-source").value,
        slug: $("ym-skill-slug").value.trim(),
        title: $("ym-skill-title").value.trim(),
        purpose: $("ym-skill-purpose").value.trim(),
        steps: linesToSteps($("ym-skill-steps").value)
      }, button, "ym-skill-status");
      if (saved) $("ym-skill-form").reset();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
})();
