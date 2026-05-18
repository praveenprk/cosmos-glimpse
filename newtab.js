// ─── Elements ─────────────────────────────────────────────────────────────────

const bg            = document.getElementById("bg");
const loader        = document.getElementById("loader");
const errorState    = document.getElementById("error-state");
const retryBtn      = document.getElementById("retry-btn");
const infoPanel     = document.getElementById("info-panel");
const infoDate      = document.getElementById("info-date");
const infoTitle     = document.getElementById("info-title");
const infoCredit    = document.getElementById("info-credit");
const infoSource    = document.getElementById("info-source");
const infoSourceUrl = document.getElementById("info-source-url");
const expandBtn     = document.getElementById("expand-btn");
const drawer        = document.getElementById("explanation-drawer");
const closeDrawer   = document.getElementById("close-drawer");
const explanationTx = document.getElementById("explanation-text");
const apiBadge      = document.getElementById("api-badge");

// ─── State ────────────────────────────────────────────────────────────────────

let currentImage = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-US", {
    year:  "numeric",
    month: "long",
    day:   "numeric"
  }).toUpperCase();
}

function truncateUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname + u.pathname.slice(0, 36) + (u.pathname.length > 36 ? "…" : "");
  } catch {
    return url.slice(0, 48) + (url.length > 48 ? "…" : "");
  }
}

function showError() {
  loader.classList.add("fade-out");
  setTimeout(() => loader.classList.add("hidden"), 700);
  errorState.classList.remove("hidden");
}

function showImage(image) {
  // Preload image before displaying
  const img = new Image();

  img.onload = () => {
    // Set background
    bg.style.backgroundImage = `url(${JSON.stringify(image.url)})`;

    // Populate info
    infoDate.textContent   = formatDate(image.date);
    infoTitle.textContent  = image.title || "Unknown";
    infoCredit.textContent = image.credit || "NASA";

    infoSource.href              = image.source || "#";
    infoSourceUrl.textContent    = truncateUrl(image.source || "");

    explanationTx.textContent = image.explanation || "No description available.";
    apiBadge.textContent      = `via ${image.api || "NASA"}`;

    // Reveal — slight stagger
    requestAnimationFrame(() => {
      // Fade loader out
      loader.classList.add("fade-out");
      setTimeout(() => loader.classList.add("hidden"), 700);

      // Trigger bg Ken Burns
      bg.classList.add("loaded");

      // Reveal UI after image starts appearing
      setTimeout(() => {
        infoPanel.classList.remove("hidden");
        expandBtn.classList.remove("hidden");
        apiBadge.classList.remove("hidden");

        requestAnimationFrame(() => {
          infoPanel.classList.add("visible");
          expandBtn.classList.add("visible");
          apiBadge.classList.add("visible");
        });
      }, 400);
    });
  };

  img.onerror = () => {
    // Image URL broken — show error
    showError();
  };

  img.src = image.url;
}

// ─── Fetch image from background ──────────────────────────────────────────────

let pollTimer = null;
const MAX_POLLS = 40;
const POLL_INTERVAL = 500;

function requestImage(pollCount = 0) {
  chrome.runtime.sendMessage({ type: "GET_IMAGE" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("[CosmosGlimpse] Runtime error:", chrome.runtime.lastError.message);
      showError();
      return;
    }

    if (!response || response.error === "no_batch") {
      // Batch still building — poll until ready
      if (pollCount < MAX_POLLS) {
        pollTimer = setTimeout(() => requestImage(pollCount + 1), POLL_INTERVAL);
      } else {
        showError();
      }
      return;
    }

    if (!response.image) {
      showError();
      return;
    }

    currentImage = response.image;
    showImage(currentImage);
  });
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

expandBtn.addEventListener("click", () => {
  drawer.classList.remove("hidden");
  requestAnimationFrame(() => drawer.classList.add("open"));
});

closeDrawer.addEventListener("click", () => {
  drawer.classList.remove("open");
  drawer.addEventListener("transitionend", () => {
    drawer.classList.add("hidden");
  }, { once: true });
});

// Close drawer on outside click
document.addEventListener("click", (e) => {
  if (
    drawer.classList.contains("open") &&
    !drawer.contains(e.target) &&
    e.target !== expandBtn
  ) {
    drawer.classList.remove("open");
    drawer.addEventListener("transitionend", () => {
      drawer.classList.add("hidden");
    }, { once: true });
  }
});

// ─── Retry ────────────────────────────────────────────────────────────────────

retryBtn.addEventListener("click", () => {
  if (pollTimer) clearTimeout(pollTimer);
  errorState.classList.add("hidden");
  loader.classList.remove("hidden", "fade-out");
  bg.classList.remove("loaded");
  bg.style.backgroundImage = "";
  infoPanel.classList.remove("visible");
  expandBtn.classList.remove("visible");
  apiBadge.classList.remove("visible");
  requestImage();
});

// ─── Init ─────────────────────────────────────────────────────────────────────

requestImage();