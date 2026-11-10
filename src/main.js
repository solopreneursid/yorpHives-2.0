import "./styles.css";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const searchForm = $("#intent-search");
const searchInput = $("#intent-input");
const cards = $$(".capability-card");
const sampleText = $("#sample-text");
const analyzeButton = $("#analyze-button");
const resultPanel = $("#result-panel");
const charCount = $("#char-count");

function announce(message) {
  const status = document.createElement("div");
  status.className = "sr-only";
  status.setAttribute("role", "status");
  status.textContent = message;
  document.body.append(status);
  setTimeout(() => status.remove(), 2500);
}

function filterCapabilities(query) {
  const normalized = query.toLowerCase().trim();
  let visible = 0;
  cards.forEach(card => {
    const text = card.textContent.toLowerCase();
    const category = card.dataset.category;
    const categoryMatch = !normalized || normalized === "all" || category === normalized;
    const termMatch = !normalized || normalized === "all" || text.includes(normalized) ||
      (normalized.includes("text") && card.querySelector("h3")?.textContent.toLowerCase().includes("text")) ||
      (normalized.includes("document") && category === "transform") ||
      (normalized.includes("workflow") && category === "automate");
    const show = categoryMatch || termMatch;
    card.hidden = !show;
    if (show) visible++;
  });
  if (!visible) announce("No matching capabilities yet. Try another search.");
}

searchForm.addEventListener("submit", event => {
  event.preventDefault();
  const query = searchInput.value.trim();
  filterCapabilities(query);
  $("#explore").scrollIntoView({ behavior: "smooth" });
});

$$("[data-prompt]").forEach(button => button.addEventListener("click", () => {
  searchInput.value = button.dataset.prompt;
  searchForm.requestSubmit();
}));

$$(".filter").forEach(button => button.addEventListener("click", () => {
  $$(".filter").forEach(item => item.classList.toggle("active", item === button));
  const category = button.dataset.filter;
  cards.forEach(card => { card.hidden = category !== "all" && card.dataset.category !== category; });
}));

function updateCount() {
  charCount.textContent = `${sampleText.value.length.toLocaleString()} / 20,000`;
}
sampleText.addEventListener("input", updateCount);
updateCount();

function renderResult(data) {
  resultPanel.replaceChildren();
  const stats = [
    ["WORDS", data.word_count],
    ["CHARACTERS", data.character_count],
    ["SENTENCES", data.sentence_count],
    ["READ TIME", `${data.estimated_reading_minutes} min`]
  ];
  const grid = document.createElement("div");
  grid.className = "result-grid";
  stats.forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "result-stat";
    const number = document.createElement("strong");
    number.textContent = value;
    const caption = document.createElement("span");
    caption.textContent = label;
    item.append(number, caption);
    grid.append(item);
  });
  const keywords = document.createElement("div");
  keywords.className = "keyword-row";
  const title = document.createElement("span");
  title.textContent = "FREQUENT TERMS";
  keywords.append(title);
  data.top_terms.forEach(term => {
    const chip = document.createElement("span");
    chip.className = "keyword";
    chip.textContent = `${term.term} · ${term.count}`;
    keywords.append(chip);
  });
  const foot = document.createElement("div");
  foot.className = "result-foot";
  foot.textContent = "✓ Processed in memory · Text is not stored";
  resultPanel.append(grid, keywords, foot);
}

async function analyze() {
  const text = sampleText.value;
  if (!text.trim()) {
    resultPanel.textContent = "Add some text to analyze.";
    sampleText.focus();
    return;
  }
  analyzeButton.disabled = true;
  resultPanel.dataset.state = "running";
  analyzeButton.innerHTML = "Analyzing <span class='spinner'></span>";
  try {
    const response = await fetch("/api/v1/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ capability: "text.analyze", version: "1.0.0", input: { text } })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "The capability could not complete this request.");
    renderResult(payload.data);
    resultPanel.dataset.state = "succeeded";
  } catch (error) {
    resultPanel.textContent = error.message || "Something went wrong. Please try again.";
    resultPanel.dataset.state = "failed";
  } finally {
    analyzeButton.disabled = false;
    analyzeButton.innerHTML = "Analyze text <span>↗</span>";
  }
}
analyzeButton.addEventListener("click", analyze);

$$("[data-open='text.analyze']").forEach(button => button.addEventListener("click", () => {
  $("#live-demo").scrollIntoView({ behavior: "smooth" });
  setTimeout(() => sampleText.focus(), 450);
}));

const mobileMenu = $(".mobile-menu");
mobileMenu.addEventListener("click", () => {
  const open = mobileMenu.getAttribute("aria-expanded") === "true";
  mobileMenu.setAttribute("aria-expanded", String(!open));
  $(".main-nav").classList.toggle("nav-open", !open);
});
$$(".main-nav a").forEach(link => link.addEventListener("click", () => {
  $(".main-nav").classList.remove("nav-open");
  mobileMenu.setAttribute("aria-expanded", "false");
}));

async function hydrateCapabilityCatalog() {
  const root = $("#capability-grid");
  root.dataset.state = "loading";
  try {
    const response = await fetch("/api/v1/capabilities", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Capability catalog is unavailable.");
    const payload = await response.json();
    const capabilities = payload.data?.capabilities || [];
    const available = capabilities.filter(item => item.status === "available");
    available.forEach(capability => {
      const selector = '[data-capability-id="' + CSS.escape(capability.id) + '"]';
      const card = root.querySelector(selector);
      if (!card) return;
      card.dataset.capabilityVersion = capability.version;
      card.dataset.capabilityStatus = capability.status;
      card.dataset.category = capability.category;
      card.querySelector(".card-index").textContent = "CAP / " + capability.id;
      card.querySelector(".card-category").textContent =
        capability.category.toUpperCase() + " · " + (capability.tags?.[0] || "UTILITY").toUpperCase();
      card.querySelector(".card-content h3").textContent = capability.name;
      card.querySelector(".card-content p").textContent = capability.summary;
      const price = capability.pricing?.model === "free"
        ? "FREE · NO SIGN-UP"
        : String(capability.pricing?.model || "PAID").toUpperCase() + " · SEE TERMS";
      card.querySelector(".card-bottom span").textContent = price;
      card.querySelector(".availability").setAttribute("aria-label", "Status: " + capability.status);
      card.querySelector(".availability").lastChild.textContent = " LIVE";
    });
    root.dataset.state = "available";
    document.documentElement.dataset.catalogStatus = "available";
    root.dataset.catalogVersion = payload.data?.schema_version || "unknown";
  } catch (error) {
    root.dataset.state = "unavailable";
    document.documentElement.dataset.catalogStatus = "unavailable";
    announce(error.message || "Capability catalog is unavailable.");
  }
}
hydrateCapabilityCatalog();
