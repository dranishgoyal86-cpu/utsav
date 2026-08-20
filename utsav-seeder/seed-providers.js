// Node 20's @supabase/supabase-js pulls in realtime-js, which requires a
// global WebSocket implementation even though this script never subscribes
// to anything — polyfill it so the client can construct without crashing.
global.WebSocket = require("../node_modules/ws");

require("dotenv").config();
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

// ─── Supabase client ───────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GOOGLE_KEY = process.env.GOOGLE_MAPS_KEY;

// ─── Cities to seed ────────────────────────────────────────────────────────────
const CITIES = [
  "Delhi",
  "Mumbai",
  "Bangalore",
  "Hyderabad",
  "Chennai",
  "Kolkata",
  "Pune",
  "Ahmedabad",
];

// ─── Service categories → Utsav SUBCATEGORY (never the parent Category) ──────
// Values are exact strings from vendorTaxonomy.js's VENDOR_TAXONOMY. Kept as a
// deliberate flat list here (not cross-imported from the ES-module taxonomy
// file) matching the same self-contained-copy decision made for the MCP
// server — see project_utsav_mcp_server memory.
const CATEGORIES = [
  // Weddings
  { query: "wedding decorator",           category: "Event Decorators" },
  { query: "wedding caterer",             category: "Caterers" },
  { query: "wedding photographer",        category: "Wedding Photography" },
  { query: "wedding videographer",        category: "Cinematic Videography" },
  { query: "mehndi artist bridal",        category: "Mehendi Artists" },
  { query: "bridal makeup artist",        category: "Bridal Makeup Artists" },
  { query: "wedding DJ",                  category: "DJs" },
  { query: "wedding band music",          category: "Live Bands" },
  { query: "pandit priest wedding",       category: "Pandits/Priests" },
  { query: "tent house wedding rental",   category: "Tent & Shamiana" },
  { query: "wedding venue banquet hall",  category: "Banquet Halls" },
  { query: "wedding card printing",       category: "Wedding Cards" },
  { query: "wedding cake bakery",         category: "Bakery & Cakes" },
  { query: "baraat horse doli wedding",   category: null }, // no matching subcategory exists — left uncategorized rather than guessing wrong
  // Birthdays & parties
  { query: "birthday party decorator",    category: "Event Decorators" },
  { query: "birthday party caterer",      category: "Caterers" },
  { query: "birthday party photographer", category: "Event Photography" },
  { query: "birthday cake bakery",        category: "Bakery & Cakes" },
  { query: "balloon decoration party",    category: "Balloon Decor" },
  // Puja & religious
  { query: "housewarming griha pravesh puja", category: "Pandits/Priests" },
  { query: "naming ceremony namkaran puja",   category: "Pandits/Priests" },
  { query: "mundan ceremony pandit",          category: "Pandits/Priests" },
  { query: "satyanarayan puja pandit",        category: "Pandits/Priests" },
  // Pre-wedding & engagement
  { query: "engagement decorator",        category: "Event Decorators" },
  { query: "pre-wedding photographer",    category: "Pre-wedding Shoots" },
  { query: "engagement caterer",          category: "Caterers" },
  // Baby shower & maternity
  { query: "baby shower planner decorator", category: "Event Decorators" },
  { query: "maternity photographer",        category: "Event Photography" },
  // Corporate & other
  { query: "corporate event caterer",     category: "Caterers" },
  { query: "corporate event decorator",   category: "Event Decorators" },
  { query: "anniversary decorator",       category: "Event Decorators" },
];

// ─── Google Places Text Search ─────────────────────────────────────────────────
async function searchPlaces(query, city) {
  const url = "https://maps.googleapis.com/maps/api/place/textsearch/json";
  const params = {
    query: `${query} in ${city} India`,
    key: GOOGLE_KEY,
    language: "en",
    region: "in",
  };

  try {
    const res = await axios.get(url, { params });
    if (res.data.status === "OK" || res.data.status === "ZERO_RESULTS") {
      return res.data.results || [];
    } else {
      console.warn(`  [warn] Places API status: ${res.data.status} for "${query}" in ${city}`);
      return [];
    }
  } catch (err) {
    console.error(`  [error] HTTP error for "${query}" in ${city}:`, err.message);
    return [];
  }
}

// ─── Upsert provider into Supabase ────────────────────────────────────────────
async function upsertProvider(place, city, category) {
  const record = {
    name: place.name,
    city: city,
    category: category,
    address: place.formatted_address || null,
    rating: place.rating || null,
    total_reviews: place.user_ratings_total || 0,
    google_place_id: place.place_id,
    lat: place.geometry?.location?.lat || null,
    lng: place.geometry?.location?.lng || null,
    is_verified: false,
    source: "google_places",
  };

  const { error } = await supabase
    .from("providers")
    .upsert(record, { onConflict: "google_place_id", ignoreDuplicates: false });

  if (error) {
    // Skip duplicate key errors silently, log real errors
    if (!error.message.includes("duplicate")) {
      console.error(`  [db error] ${place.name}: ${error.message}`);
    }
    return false;
  }
  return true;
}

// ─── Sleep helper (rate limiting) ─────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Main seeder ──────────────────────────────────────────────────────────────
async function seed() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║     Utsav Provider Seeder — Starting     ║");
  console.log("╚══════════════════════════════════════════╝\n");
  console.log(`Cities : ${CITIES.length}`);
  console.log(`Categories: ${CATEGORIES.length}`);
  console.log(`Total API calls: ~${CITIES.length * CATEGORIES.length}\n`);

  const stats = {};
  let totalInserted = 0;
  let totalFound = 0;

  for (const city of CITIES) {
    stats[city] = { found: 0, inserted: 0 };
    console.log(`\n📍 ${city}`);
    console.log("─".repeat(40));

    for (const { query, category } of CATEGORIES) {
      process.stdout.write(`  Searching: ${query}... `);

      const places = await searchPlaces(query, city);
      let insertedCount = 0;

      for (const place of places) {
        const ok = await upsertProvider(place, city, category);
        if (ok) insertedCount++;
      }

      console.log(`${places.length} found, ${insertedCount} saved`);
      stats[city].found += places.length;
      stats[city].inserted += insertedCount;
      totalFound += places.length;
      totalInserted += insertedCount;

      // Rate limiting: wait 500ms between requests to avoid hitting API limits
      await sleep(500);
    }

    console.log(`  ✓ ${city} done: ${stats[city].inserted} providers saved`);
  }

  // ─── Final summary ──────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║              Seeding Complete            ║");
  console.log("╚══════════════════════════════════════════╝\n");
  console.log("Results by city:");
  console.log("─".repeat(40));
  for (const city of CITIES) {
    const pad = city.padEnd(14);
    console.log(`  ${pad} ${stats[city].inserted} saved  (${stats[city].found} found)`);
  }
  console.log("─".repeat(40));
  console.log(`  ${"TOTAL".padEnd(14)} ${totalInserted} saved  (${totalFound} found)`);
  console.log("\nDone! Open your Supabase dashboard to review.\n");
}

seed().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});