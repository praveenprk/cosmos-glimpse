const grid  = document.getElementById("grid");
const empty = document.getElementById("empty");
const count = document.getElementById("count");

function render(saved) {
  grid.innerHTML = "";
  count.textContent = saved.length ? `${saved.length} image${saved.length > 1 ? "s" : ""}` : "";

  if (!saved.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  saved.forEach((img) => {
    const card = document.createElement("div");
    card.className = "card";

    const image = document.createElement("img");
    image.src = img.url;
    image.alt = img.title || "";
    image.loading = "lazy";

    const overlay = document.createElement("div");
    overlay.className = "card-overlay";

    const title = document.createElement("p");
    title.className = "card-title";
    title.textContent = img.title || "Untitled";

    const credit = document.createElement("p");
    credit.className = "card-credit";
    credit.textContent = img.credit || "NASA";

    const removeBtn = document.createElement("button");
    removeBtn.className = "card-remove";
    removeBtn.textContent = "✕";
    removeBtn.title = "Remove";

    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      chrome.storage.local.get("savedImages", (data) => {
        const updated = (data.savedImages || []).filter(i => i.id !== img.id);
        chrome.storage.local.set({ savedImages: updated }, () => render(updated));
      });
    });

    card.addEventListener("click", () => {
      window.open(img.source || img.url, "_blank");
    });

    overlay.appendChild(title);
    overlay.appendChild(credit);
    card.appendChild(image);
    card.appendChild(overlay);
    card.appendChild(removeBtn);
    grid.appendChild(card);
  });
}

chrome.storage.local.get("savedImages", (data) => {
  render(data.savedImages || []);
});