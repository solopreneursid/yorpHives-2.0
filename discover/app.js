const form = document.querySelector("#search-form");
const queryInput = document.querySelector("#query");
const typeInput = document.querySelector("#type");
const audienceInput = document.querySelector("#audience");
const resultsNode = document.querySelector("#results");
const resultCount = document.querySelector("#result-count");
const emptyState = document.querySelector("#empty-state");
const errorState = document.querySelector("#error-state");
const errorMessage = document.querySelector("#error-message");
const loadMoreButton = document.querySelector("#load-more");
const clearButton = document.querySelector("#clear-filters");
const retryButton = document.querySelector("#retry");

const state = { offset: 0, limit: 20, count: 0, loading: false, requestId: 0 };
const labels = {
  tool: "Tool",
  application: "Application",
  service: "Service",
  opportunity: "Opportunity",
  capability: "Agent capability",
};

function applyUrlFilters() {
  const params = new URLSearchParams(window.location.search);
  queryInput.value = params.get("q") || "";
  typeInput.value = params.get("type") || "";
  audienceInput.value = params.get("audience") || "";
}

function updateUrl() {
  const params = new URLSearchParams();
  if (queryInput.value.trim()) params.set("q", queryInput.value.trim());
  if (typeInput.value) params.set("type", typeInput.value);
  if (audienceInput.value) params.set("audience", audienceInput.value);
  const query = params.toString();
  history.replaceState(null, "", query ? "/discover/?" + query : "/discover/");
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function createListingCard(listing) {
  const card = document.createElement("article");
  card.className = "listing-card";

  const meta = document.createElement("div");
  meta.className = "listing-meta";
  const type = document.createElement("span");
  type.className = "listing-type";
  type.textContent = labels[listing.listing_type] || "Listing";
  meta.append(type);

  if (listing.category?.name) {
    const category = document.createElement("span");
    category.className = "listing-category";
    category.textContent = listing.category.name;
    meta.append(category);
  }

  const title = document.createElement("h3");
  title.textContent = listing.title;
  const summary = document.createElement("p");
  summary.textContent = listing.summary;

  const bottom = document.createElement("div");
  bottom.className = "listing-bottom";
  const access = document.createElement("span");
  access.className = "listing-access";
  access.textContent = listing.access?.model || "Access details unavailable";

  const detail = document.createElement("a");
  detail.className = "listing-open";
  detail.href = "/listing/?slug=" + encodeURIComponent(listing.slug);
  detail.textContent = "View details";
  const arrow = document.createElement("span");
  arrow.textContent = "↗";
  detail.append(arrow);

  bottom.append(access, detail);
  card.append(meta, title, summary, bottom);
  return card;
}

async function loadListings(append = false) {
  if (state.loading) return;
  state.loading = true;
  const requestId = ++state.requestId;
  errorState.hidden = true;
  emptyState.hidden = true;
  loadMoreButton.hidden = true;
  resultsNode.setAttribute("aria-busy", "true");
  resultCount.textContent = "Loading verified listings…";

  if (!append) {
    state.offset = 0;
    resultsNode.replaceChildren();
  }

  const params = new URLSearchParams({
    limit: String(state.limit),
    offset: String(state.offset),
  });
  if (queryInput.value.trim()) params.set("q", queryInput.value.trim());
  if (typeInput.value) params.set("type", typeInput.value);
  if (audienceInput.value) params.set("audience", audienceInput.value);
  updateUrl();

  try {
    const response = await fetch("/api/v1/catalogue?" + params.toString(), {
      headers: { accept: "application/json" },
      credentials: "same-origin",
    });
    const payload = await response.json();
    if (requestId !== state.requestId) return;
    if (!response.ok) {
      throw new Error(payload?.error?.message || "The catalogue could not be loaded.");
    }

    const listings = Array.isArray(payload.data) ? payload.data : [];
    state.count = Number(payload.pagination?.count || 0);
    for (const listing of listings) resultsNode.append(createListingCard(listing));

    if (state.offset === 0 && listings.length === 0) {
      emptyState.hidden = false;
      resultCount.textContent = "No verified listings found";
    } else {
      resultCount.textContent = state.count + (state.count === 1 ? " verified listing" : " verified listings");
    }

    state.offset += listings.length;
    loadMoreButton.hidden = state.offset >= state.count || listings.length === 0;
  } catch (error) {
    if (requestId !== state.requestId) return;
    errorMessage.textContent = error instanceof Error ? error.message : "Please try again in a moment.";
    errorState.hidden = false;
    resultCount.textContent = "Catalogue unavailable";
  } finally {
    if (requestId === state.requestId) {
      state.loading = false;
      resultsNode.setAttribute("aria-busy", "false");
    }
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  loadListings(false);
});
loadMoreButton.addEventListener("click", () => loadListings(true));
clearButton.addEventListener("click", () => {
  queryInput.value = "";
  typeInput.value = "";
  audienceInput.value = "";
  loadListings(false);
});
retryButton.addEventListener("click", () => loadListings(false));

applyUrlFilters();
loadListings(false);
