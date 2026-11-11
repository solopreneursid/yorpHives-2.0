const menuButton = document.querySelector(".menu-toggle");
const mobileNav = document.querySelector("#mobile-nav");

if (menuButton && mobileNav) {
  menuButton.addEventListener("click", () => {
    const open = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!open));
    menuButton.setAttribute("aria-label", open ? "Open navigation" : "Close navigation");
    mobileNav.hidden = open;
  });
  mobileNav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Open navigation");
    mobileNav.hidden = true;
  }));
}

const year = document.querySelector("#year");
if (year) year.textContent = String(new Date().getFullYear());

function makeListingCard(item, badge) {
  const card = document.createElement("article");
  card.className = "listing-card";
  const label = document.createElement("small");
  label.textContent = badge;
  const title = document.createElement("h3");
  title.textContent = item.title;
  const description = document.createElement("p");
  description.textContent = item.summary;
  const meta = document.createElement("div");
  meta.className = "listing-card-meta";
  const date = document.createElement("span");
  date.textContent = item.published_at ? new Date(item.published_at).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  }) : "Recently published";
  meta.append(date);
  const link = document.createElement("a");
  link.href = "/listing/?slug=" + encodeURIComponent(item.slug);
  link.textContent = "View details ↗";
  card.append(label, title, description, meta, link);
  return card;
}

function makeEmptyState(title, description, linkHref, linkText) {
  const state = document.createElement("div");
  state.className = "data-state compact";
  const copy = document.createElement("div");
  const heading = document.createElement("h3");
  heading.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = description;
  copy.append(heading, paragraph);
  state.append(copy);
  if (linkHref && linkText) {
    const link = document.createElement("a");
    link.className = "section-link";
    link.href = linkHref;
    link.textContent = linkText;
    state.append(link);
  }
  return state;
}

async function loadTrending() {
  const target = document.querySelector("#trending-state");
  if (!target) return;

  try {
    const response = await fetch("/api/v1/trending", {
      headers: { accept: "application/json" },
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error("Trending analytics are unavailable.");
    const payload = await response.json();
    const items = Array.isArray(payload.data) ? payload.data : [];

    if (!items.length) {
      target.replaceWith(makeEmptyState(
        "No trending tools yet",
        "There is not enough verified activity in the last 7 days to rank tools. Rankings appear after real usage is recorded.",
        "/free-tools/",
        "Explore free tools ↗",
      ));
      return;
    }

    const grid = document.createElement("div");
    grid.className = "listing-grid trending-grid";
    for (const item of items) {
      const card = makeListingCard(item, "TRENDING TOOL · 7 DAYS");
      const metrics = document.createElement("div");
      metrics.className = "activity-metrics";
      const views = document.createElement("span");
      views.textContent = item.detail_views + " detail views";
      const launches = document.createElement("span");
      launches.textContent = item.launches + " launches";
      metrics.append(views, launches);
      card.insertBefore(metrics, card.lastElementChild);
      grid.append(card);
    }
    target.replaceWith(grid);
  } catch {
    target.replaceWith(makeEmptyState(
      "Trending data is temporarily unavailable",
      "We could not load the verified usage totals. Please try again shortly.",
      null,
      null,
    ));
  }
}

async function loadRecent() {
  const target = document.querySelector("#recent-listings");
  if (!target) return;

  try {
    const [toolsResponse, appsResponse] = await Promise.all([
      fetch("/api/v1/catalogue?type=tool&limit=6", { headers: { accept: "application/json" } }),
      fetch("/api/v1/catalogue?type=application&limit=6", { headers: { accept: "application/json" } }),
    ]);
    if (!toolsResponse.ok || !appsResponse.ok) throw new Error("Catalogue unavailable.");

    const [toolsPayload, appsPayload] = await Promise.all([
      toolsResponse.json(),
      appsResponse.json(),
    ]);
    const tools = Array.isArray(toolsPayload.data) ? toolsPayload.data : [];
    const apps = Array.isArray(appsPayload.data) ? appsPayload.data : [];
    const items = [...tools, ...apps]
      .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
      .slice(0, 3);

    if (!items.length) {
      target.replaceChildren(makeEmptyState(
        "No new releases just yet",
        "Newly reviewed tools and YorpHives-built applications will appear here as they launch.",
        "/explore/",
        "Explore applications ↗",
      ));
      return;
    }

    target.replaceChildren(...items.map((item) => makeListingCard(
      item,
      item.listing_type === "application" ? "YORPHIVES APPLICATION" : "NEW TOOL",
    )));
  } catch {
    target.replaceChildren(makeEmptyState(
      "New releases are temporarily unavailable",
      "We could not reach the verified catalogue. Please check again soon.",
      "/explore/",
      "Explore applications ↗",
    ));
  }
}

loadTrending();
loadRecent();

const form = document.querySelector("#build-request-form");
if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const subject = encodeURIComponent("YorpHives build request: " + String(data.get("requestType") || "New project"));
    const body = encodeURIComponent([
      "Name: " + data.get("name"),
      "Email: " + data.get("email"),
      "Organization: " + (data.get("organization") || "Not provided"),
      "Request type: " + data.get("requestType"),
      "Project details:",
      data.get("details"),
    ].join("\n"));
    window.location.href = "mailto:connect@yorphives.com?subject=" + subject + "&body=" + body;
  });
}
