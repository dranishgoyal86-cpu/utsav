// geocode-search
//
// Server-side proxy to Google's Geocoding API. The app never talks to
// Google directly and never holds the API key — it calls this edge
// function with a free-text address, and this function calls Google
// using a key stored as a Supabase secret (GOOGLE_MAPS_API_KEY),
// never committed to the repo and never shipped inside the app bundle.
//
// Request:  POST { query: string }
// Response: { results: [{ address: string, lat: number, lng: number }] }
//
// Shaped to match components/LocationAutocomplete.js's existing
// Nominatim response handling (address + lat/lng per candidate), so it
// can be swapped in as a drop-in alternative source without changing
// how the picker UI consumes results.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!apiKey) {
      return json({ error: "GOOGLE_MAPS_API_KEY is not configured" }, 500);
    }

    const { query } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length < 3) {
      return json({ results: [] });
    }

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", query.trim());
    url.searchParams.set("region", "in");
    url.searchParams.set("components", "country:IN");
    url.searchParams.set("key", apiKey);

    const resp = await fetch(url.toString());
    const data = await resp.json();

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.log("geocode-search: Google error", data.status, data.error_message);
      return json({ error: data.error_message || data.status || "Geocoding failed" }, 502);
    }

    const results = (data.results || []).slice(0, 5).map((r: any) => ({
      address: r.formatted_address,
      lat: r.geometry?.location?.lat,
      lng: r.geometry?.location?.lng,
    })).filter((r: any) => r.lat != null && r.lng != null);

    return json({ results });
  } catch (err) {
    console.log("geocode-search error:", err?.message || err);
    return json({ error: "geocode-search failed" }, 500);
  }
});
