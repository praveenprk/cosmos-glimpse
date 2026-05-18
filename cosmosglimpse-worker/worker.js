const ALLOWED_ORIGIN = "*"; // lock to your extension ID in production
const NASA_APOD     = "https://api.nasa.gov/planetary/apod";
const NASA_LIBRARY  = "https://images-api.nasa.gov/search";

const CORS = {
  "Access-Control-Allow-Origin":  ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: CORS });
    }

    try {
      let upstream;

      // ── /apod?date=YYYY-MM-DD ──────────────────────────────────────────────
      if (url.pathname === "/apod") {
        const date = url.searchParams.get("date");
        const params = new URLSearchParams({ api_key: env.NASA_API_KEY });
        if (date) params.set("date", date);
        upstream = await fetch(`${NASA_APOD}?${params}`);

      // ── /library?q=term&page=N&year_start=YYYY ────────────────────────────
      } else if (url.pathname === "/library") {
        const q          = url.searchParams.get("q")          || "nebula";
        const page       = url.searchParams.get("page")       || "1";
        const year_start = url.searchParams.get("year_start") || "2000";
        const params = new URLSearchParams({
          q,
          page,
          year_start,
          media_type: "image"
        });
        upstream = await fetch(`${NASA_LIBRARY}?${params}`);

      } else {
        return new Response("Not found", { status: 404, headers: CORS });
      }

      const body = await upstream.text();
      return new Response(body, {
        status:  upstream.status,
        headers: {
          ...CORS,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600", // cache 1h at edge
        }
      });

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status:  500,
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }
  }
};
