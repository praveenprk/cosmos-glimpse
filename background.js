const WORKER_URL    = "https://cosmosglimpse-worker.cosmosglimpse.workers.dev";
const NASA_IMAGE_API = "https://images-api.nasa.gov";
const BATCH_SIZE = 25;
const REFETCH_THRESHOLD = 5;
const BATCH_STALE_HOURS = 24;

const GALAXY_TERMS = [
  "nebula", "galaxy", "supernova", "pulsar",
  "quasar", "star cluster", "andromeda galaxy", "milky way galaxy",
  "planetary nebula", "globular cluster", "deep space hubble",
  "james webb telescope", "aurora borealis from space", "solar flare",
  "neutron star", "cosmic dust", "exoplanet", "gamma ray burst",
  "magnetar", "protostar", "spiral galaxy", "elliptical galaxy",
  "barred spiral galaxy", "binary star system", "hubble space telescope",
  "crab nebula", "orion nebula", "pillars of creation", "black hole",
  "saturn rings", "jupiter storm", "mars surface", "earth from space"
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDateBetween(start, end) {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const d = new Date(s + Math.random() * (e - s));
  return d.toISOString().split("T")[0];
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

async function fetchTodayAPOD() {
  const date = new Date().toISOString().split("T")[0];
  const url = `${WORKER_URL}/apod?date=${date}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`APOD today fetch failed: ${res.status}`);
  const data = await res.json();
  if (data.media_type !== "image") return null;
  return {
    id: `apod-${date}`,
    title: data.title,
    url: data.hdurl || data.url,
    date: data.date,
    explanation: data.explanation,
    source: `https://apod.nasa.gov/apod/ap${date.replace(/-/g, "").slice(2)}.html`,
    credit: data.copyright || "NASA / APOD",
    api: "APOD"
  };
}

async function fetchAPOD() {
  // Random date between APOD launch and today
  const date = randomDateBetween("1995-06-16", new Date().toISOString().split("T")[0]);
  const url = `${WORKER_URL}/apod?date=${date}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`APOD fetch failed: ${res.status}`);
  const data = await res.json();

  // Only accept images, not videos
  if (data.media_type !== "image") return null;

  return {
    id: `apod-${date}`,
    title: data.title,
    url: data.hdurl || data.url,
    date: data.date,
    explanation: data.explanation,
    source: `https://apod.nasa.gov/apod/ap${date.replace(/-/g, "").slice(2)}.html`,
    credit: data.copyright || "NASA / APOD",
    api: "APOD"
  };
}

async function fetchNASALibrary(term) {
  const url = `${WORKER_URL}/library?q=${encodeURIComponent(term)}&year_start=2000&page=${Math.floor(Math.random() * 5) + 1}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Library fetch failed: ${res.status}`);
  const data = await res.json();

  const items = data.collection?.items;
  if (!items || items.length === 0) return null;

  const item = randomItem(items);
  const meta = item.data?.[0];
  const imageUrl = item.links?.[0]?.href;

  if (!meta || !imageUrl) return null;

  // Sanitize title — NASA IDs look like "iss062e102390", "jsc2020e012345" etc.
  const rawTitle = meta.title || "";
  const isNasaId = /^[a-z]{2,6}\d{4,}[a-z0-9]*$/i.test(rawTitle.trim());
  const title = isNasaId
    ? (meta.description || "").split(".")[0].slice(0, 80) || rawTitle
    : rawTitle;

  return {
    id: `lib-${meta.nasa_id || Date.now()}`,
    title: title,
    url: imageUrl,
    date: meta.date_created?.split("T")[0] || "",
    explanation: meta.description || "",
    source: `https://images.nasa.gov/details-${meta.nasa_id}`,
    credit: meta.photographer || meta.secondary_creator || "NASA Image Library",
    api: "NASA Library"
  };
}

// ─── Batch Builder ────────────────────────────────────────────────────────────

async function buildBatch() {
  const batch = [];
  const errors = [];

  // Always lead with today's APOD
  try {
    const today = await fetchTodayAPOD();
    if (today) batch.push(today);
  } catch (e) {
    errors.push(e.message);
  }

  // 70% APOD (curated, high quality), 30% Library (variety)
  const apodTarget = Math.floor(BATCH_SIZE * 0.7);
  const libTarget = BATCH_SIZE - apodTarget;

  // Fetch APOD images
  let apodAttempts = 0;
  while (batch.filter(i => i.api === "APOD").length < apodTarget && apodAttempts < apodTarget * 3) {
    apodAttempts++;
    try {
      const img = await fetchAPOD();
      if (img) batch.push(img);
    } catch (e) {
      errors.push(e.message);
    }
  }

  // Fetch Library images
  let libAttempts = 0;
  while (batch.filter(i => i.api === "NASA Library").length < libTarget && libAttempts < libTarget * 2) {
    libAttempts++;
    try {
      const term = randomItem(GALAXY_TERMS);
      const img = await fetchNASALibrary(term);
      if (img) batch.push(img);
    } catch (e) {
      errors.push(e.message);
    }
  }

  // Deduplicate by id
  const seen = new Set();
  const unique = batch.filter(img => {
    if (seen.has(img.id)) return false;
    seen.add(img.id);
    return true;
  });

  // Shuffle
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }

  return unique;
}

// ─── Storage ─────────────────────────────────────────────────────────────────

async function saveBatch(batch) {
  return new Promise((resolve) => {
    chrome.storage.local.set({
      imageBatch: batch,
      batchIndex: 0,
      batchFetchedAt: Date.now()
    }, resolve);
  });
}

async function getStorageState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["imageBatch", "batchIndex", "batchFetchedAt"], resolve);
  });
}

async function isBatchStale(fetchedAt) {
  const ageMs = Date.now() - (fetchedAt || 0);
  return ageMs > BATCH_STALE_HOURS * 60 * 60 * 1000;
}

// ─── Priority mini-fetch: 3 images fast on install ───────────────────────────

async function fetchMini() {
  const batch = [];
  // Today first
  try {
    const today = await fetchTodayAPOD();
    if (today) batch.push(today);
  } catch (e) {}
  // Fill 2 more random
  let attempts = 0;
  while (batch.length < 3 && attempts < 10) {
    attempts++;
    try {
      const img = await fetchAPOD();
      if (img) batch.push(img);
    } catch (e) {}
  }
  return batch;
}

// ─── Main: ensure batch is ready ─────────────────────────────────────────────

async function ensureBatch(force = false) {
  const state = await getStorageState();
  const { imageBatch, batchIndex, batchFetchedAt } = state;

  const remaining = imageBatch ? imageBatch.length - (batchIndex || 0) : 0;
  const stale = await isBatchStale(batchFetchedAt);

  if (force || !imageBatch || stale || remaining < REFETCH_THRESHOLD) {
    console.log("[CosmosGlimpse] Fetching new batch...");
    try {
      const batch = await buildBatch();
      if (batch.length > 0) {
        await saveBatch(batch);
        console.log(`[CosmosGlimpse] Batch ready: ${batch.length} images`);
      }
    } catch (e) {
      console.error("[CosmosGlimpse] Batch fetch error:", e);
    }
  }
}

// ─── Events ──────────────────────────────────────────────────────────────────

// On install — fetch 3 images fast, then full batch async
chrome.runtime.onInstalled.addListener(async () => {
  const state = await getStorageState();
  if (!state.imageBatch || state.imageBatch.length === 0) {
    console.log("[CosmosGlimpse] Mini fetch starting...");
    const mini = await fetchMini();
    if (mini.length > 0) {
      await saveBatch(mini);
      console.log(`[CosmosGlimpse] Mini batch ready: ${mini.length} images`);
    }
  }
  ensureBatch(true);
});

// On browser start
chrome.runtime.onStartup.addListener(() => {
  ensureBatch();
});

// Alarm: proactive refresh every 12h
chrome.alarms.create("batchRefresh", { periodInMinutes: 720 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "batchRefresh") ensureBatch();
});

// Message from newtab: request next image
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "GET_IMAGE") {
    getStorageState().then(async (state) => {
      let { imageBatch, batchIndex } = state;
      batchIndex = batchIndex || 0;

      if (!imageBatch || imageBatch.length === 0) {
        sendResponse({ error: "no_batch" });
        return;
      }

      if (batchIndex >= imageBatch.length) batchIndex = 0;

      const image = imageBatch[batchIndex];
      const nextIndex = batchIndex + 1;

      chrome.storage.local.set({ batchIndex: nextIndex });

      // Trigger background refetch if running low
      const remaining = imageBatch.length - nextIndex;
      if (remaining < REFETCH_THRESHOLD) ensureBatch();

      sendResponse({ image });
    });
    return true; // keep channel open for async
  }
});