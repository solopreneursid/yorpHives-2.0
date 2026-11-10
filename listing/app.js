const loading = document.querySelector("#listing-loading");
const errorState = document.querySelector("#listing-error");
const errorMessage = document.querySelector("#listing-error-message");
const content = document.querySelector("#listing-content");
const labels = { tool: "Tool", application: "Application", service: "Service", opportunity: "Opportunity", capability: "Agent capability" };

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function addFact(list, label, value) {
  const row = document.createElement("div");
  const term = document.createElement("dt");
  const detail = document.createElement("dd");
  term.textContent = label;
  detail.textContent = value;
  row.append(term, detail);
  list.append(row);
}

function addListItems(target, values, emptyText) {
  target.replaceChildren();
  const items = Array.isArray(values) && values.length ? values : [emptyText];
  for (const value of items) {
    const item = document.createElement("li");
    item.textContent = value;
    target.append(item);
  }
}

async function loadListing() {
  const slug = new URLSearchParams(window.location.search).get("slug");
  if (!slug) {
    loading.hidden = true;
    errorState.hidden = false;
    errorMessage.textContent = "This page needs a listing slug. Return to discovery to choose a listing.";
    return;
  }

  try {
    const response = await fetch("/api/v1/catalogue/" + encodeURIComponent(slug), {
      headers: { accept: "application/json" },
      credentials: "same-origin",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || "This listing could not be found.");
    const listing = payload.data;
    if (!listing) throw new Error("The catalogue returned an empty listing.");

    const meta = document.querySelector("#listing-meta");
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

    document.querySelector("#listing-title").textContent = listing.title;
    document.querySelector("#listing-summary").textContent = listing.summary;
    document.querySelector("#listing-description").textContent = listing.description || "No additional description has been provided.";
    document.title = listing.title + " — YorpHives";

    const destination = safeHttpUrl(listing.destination_url);
    if (!destination) throw new Error("This listing has an invalid destination and cannot be opened.");
    const destinationLink = document.querySelector("#listing-destination");
    destinationLink.href = destination;
    destinationLink.addEventListener("click", () => {
      fetch("/api/v1/catalogue/" + encodeURIComponent(slug) + "/usage", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        credentials: "same-origin",
        keepalive: true,
        body: JSON.stringify({ event: "launch" }),
      }).catch(() => {});
    });

    const viewKey = "yorphives:catalogue-view:" + slug;
    try {
      if (!sessionStorage.getItem(viewKey)) {
        sessionStorage.setItem(viewKey, "1");
        fetch("/api/v1/catalogue/" + encodeURIComponent(slug) + "/usage", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          credentials: "same-origin",
          keepalive: true,
          body: JSON.stringify({ event: "detail_view" }),
        }).catch(() => {});
      }
    } catch {
      // Private browsing storage restrictions should never block the listing.
    }

    const machineLink = document.querySelector("#machine-link");
    const machineUrl = listing.machine_readable_url ? safeHttpUrl(listing.machine_readable_url) : null;
    if (machineUrl) {
      machineLink.href = machineUrl;
      machineLink.hidden = false;
    }

    const facts = document.querySelector("#listing-facts");
    addFact(facts, "Access", listing.access?.model || "Unknown");
    if (listing.access?.price_minor !== null && listing.access?.price_minor !== undefined) {
      const amount = (listing.access.price_minor / 100).toFixed(2) + " " + (listing.access.currency || "");
      addFact(facts, "Price", amount.trim());
    }
    addFact(facts, "Audience", (listing.audiences || []).join(", ") || "Not specified");
    addFact(facts, "Authentication", listing.requires_auth ? "Required" : "Not required");
    addFact(facts, "Published", listing.published_at ? new Date(listing.published_at).toLocaleDateString() : "Not specified");

    if (listing.listing_type === "capability" || listing.requires_auth || (listing.required_scopes || []).length || (listing.side_effects || []).length) {
      document.querySelector("#execution-details").hidden = false;
      addListItems(document.querySelector("#required-scopes"), listing.required_scopes, "No additional scopes declared");
      addListItems(document.querySelector("#side-effects"), listing.side_effects, "No side effects declared");
    }

    loading.hidden = true;
    content.hidden = false;
  } catch (error) {
    loading.hidden = true;
    errorState.hidden = false;
    errorMessage.textContent = error instanceof Error ? error.message : "Please try again in a moment.";
  }
}

loadListing();
