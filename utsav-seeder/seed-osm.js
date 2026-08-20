// Node 20's @supabase/supabase-js pulls in realtime-js, which requires a
// global WebSocket implementation even though this script never subscribes
// to anything — polyfill it so the client can construct without crashing.
global.WebSocket = require("../node_modules/ws");

require("dotenv").config();
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Cities with bounding boxes (south, west, north, east) ─────────────────────
const CITIES = [
  { name: "Delhi",     bbox: "28.40,76.84,28.88,77.35" },
  { name: "Mumbai",    bbox: "18.87,72.77,19.27,73.00" },
  { name: "Bangalore", bbox: "12.83,77.46,13.14,77.78" },
  { name: "Hyderabad", bbox: "17.27,78.31,17.57,78.63" },
  { name: "Chennai",   bbox: "12.90,80.17,13.23,80.31" },
  { name: "Kolkata",   bbox: "22.45,88.27,22.70,88.47" },
  { name: "Pune",      bbox: "18.42,73.74,18.63,73.96" },
  { name: "Ahmedabad", bbox: "22.95,72.49,23.13,72.68" },
];

// ── OSM tags that match event service providers ───────────────────────────────
// Each tag maps directly to a valid SUBCATEGORY string from vendorTaxonomy.js
// (never a parent Category — providers.category always stores the subcategory).
// OSM only has reliable tag coverage for physical, mappable business types, so
// this deliberately does not attempt all 30 categories — categories like
// "Event Technology" or "Licensing & Compliance" describe services with no
// distinct OSM POI tag and can't be sourced this way.
const SEARCH_TAGS = [
  // Food & Beverages
  { key: "catering",  value: "yes",           category: "Caterers" },
  { key: "amenity",   value: "restaurant",    category: "Caterers" },
  { key: "amenity",   value: "cafe",          category: "Caterers" },
  { key: "amenity",   value: "fast_food",     category: "Caterers" },
  { key: "shop",      value: "bakery",        category: "Bakery & Cakes" },
  { key: "shop",      value: "confectionery", category: "Chocolatiers" },
  // Venues
  { key: "amenity",   value: "banquet_hall",   category: "Banquet Halls" },
  { key: "amenity",   value: "events_venue",   category: "Banquet Halls" },
  { key: "leisure",   value: "wedding_venue",  category: "Banquet Halls" },
  { key: "amenity",   value: "community_centre", category: "Community Halls" },
  { key: "tourism",   value: "hotel",          category: "Hotels & Resorts" },
  // Photography & Videography
  { key: "shop",      value: "photo",         category: "Event Photography" },
  { key: "craft",     value: "photographer",  category: "Event Photography" },
  // Beauty & Wellness
  { key: "shop",      value: "beauty",       category: "Makeup Artists" },
  { key: "shop",      value: "hairdresser",  category: "Hair Stylists" },
  // Entertainment
  { key: "amenity",   value: "music_school",       category: "Live Bands" },
  { key: "shop",      value: "musical_instrument", category: "Instrumentalists" },
  // Florists
  { key: "shop",      value: "florist", category: "Fresh Flowers" },
  // Invitations & Printing
  { key: "shop",      value: "printing", category: "Wedding Cards" },
  // Religious & Cultural Services (via Wedding Services' combined subcategory)
  { key: "amenity",   value: "place_of_worship", category: "Pandits/Priests" },
  // Event Rentals
  { key: "shop",      value: "rental", category: "Tent & Shamiana" },
  // Event Planning & Management
  { key: "office",    value: "event_management", category: "Event Coordinator" },
  // Decoration & Styling
  { key: "shop",      value: "party", category: "Balloon Decor" },
  // Logistics & Transport
  { key: "amenity",   value: "car_rental", category: "Wedding Cars" },
  // Wedding Services
  { key: "shop",      value: "jewelry", category: "Jewellery Rentals" },
  // Accommodation
  { key: "tourism",   value: "guest_house", category: "Homestays" },
  // Destination Wedding Services
  { key: "shop",      value: "travel_agency", category: "Travel Planning" },
  // Security & Safety
  { key: "office",    value: "security", category: "Security Guards" },
];

// ── Build Overpass query ──────────────────────────────────────────────────────
function buildQuery(tag, bbox) {
  const [s, w, n, e] = bbox.split(",");
  const box = `(${s},${w},${n},${e})`;
  return `
    [out:json][timeout:25];
    (
      node["${tag.key}"="${tag.value}"]${box};
      way["${tag.key}"="${tag.value}"]${box};
    );
    out center tags;
  `;
}

// ── Fetch from Overpass API ───────────────────────────────────────────────────
// Using the openstreetmap.fr mirror — the default overpass-api.de endpoint
// (and the kumi.systems/openstreetmap.ru mirrors) refused every connection
// from this machine's IP during testing, while this mirror responded
// instantly. Likely IP-based rate-limiting/blocking on those specific hosts
// from earlier debugging sessions, not a local network issue.
const OVERPASS_ENDPOINT = "https://overpass.openstreetmap.fr/api/interpreter";

async function fetchOSM(tag, city) {
  const query = buildQuery(tag, city.bbox);
  try {
    const res = await axios.post(
      OVERPASS_ENDPOINT,
      new URLSearchParams({ data: query }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // This mirror 403s requests without a descriptive User-Agent.
          "User-Agent": "UtsavApp-Seeder/1.0 (contact: dranishgoyal86@gmail.com)",
        },
        timeout: 30000,
      }
    );
    return res.data.elements || [];
  } catch (err) {
    if (err.response?.status === 429) {
      console.warn("  [rate limit] Overpass — waiting 10s...");
      await sleep(10000);
      return [];
    }
    console.error(`  [error] ${tag.key}=${tag.value} in ${city.name}: ${err.message}`);
    return [];
  }
}

// ── Upsert into Supabase ──────────────────────────────────────────────────────
async function upsertProvider(element, city, category) {
  const tags = element.tags || {};
  const name = tags.name || tags["name:en"] || tags.brand;
  if (!name) return false; // skip unnamed places

  const lat = element.lat || element.center?.lat;
  const lng = element.lon || element.center?.lon;
  const osmId = `osm_${element.type}_${element.id}`;

  const record = {
    name,
    category,
    city:            city.name,
    address:         [tags["addr:street"], tags["addr:suburb"], tags["addr:city"]]
                       .filter(Boolean).join(", ") || null,
    phone:           tags.phone || tags["contact:phone"] || null,
    website:         tags.website || tags["contact:website"] || null,
    rating:          null,
    total_reviews:   0,
    lat,
    lng,
    google_place_id: osmId,   // reusing the unique key column for OSM id
    source:          "openstreetmap",
    is_verified:     false,
    is_claimed:      false,
  };

  const { error } = await supabase
    .from("providers")
    .upsert(record, { onConflict: "google_place_id", ignoreDuplicates: true });

  if (error && !error.message.includes("duplicate")) {
    console.error(`  [db] ${name}: ${error.message}`);
    return false;
  }
  return true;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Main ──────────────────────────────────────────────────────────────────────
async function seed() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║  Utsav OSM Seeder — 100% Free            ║");
  console.log("║  No API key · No billing · No limits     ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const stats = {};
  let grandTotal = 0;

  for (const city of CITIES) {
    stats[city.name] = 0;
    console.log(`\n📍  ${city.name}`);
    console.log("─".repeat(44));

    for (const tag of SEARCH_TAGS) {
      const label = `${tag.key}=${tag.value}`;
      process.stdout.write(`  ${label.padEnd(36)}`);

      const elements = await fetchOSM(tag, city);
      let saved = 0;

      for (const el of elements) {
        const ok = await upsertProvider(el, city, tag.category);
        if (ok) saved++;
      }

      console.log(`${String(elements.length).padStart(3)} found  ${String(saved).padStart(3)} saved`);
      stats[city.name] += saved;
      grandTotal += saved;

      await sleep(1500); // Overpass asks for polite rate limiting
    }

    console.log(`\n  ✓ ${city.name}: ${stats[city.name]} providers saved`);
  }

  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║  Seeding complete                        ║");
  console.log("╚══════════════════════════════════════════╝\n");
  for (const city of CITIES) {
    console.log(`  ${city.name.padEnd(16)} ${stats[city.name]} providers`);
  }
  console.log(`  ${"─".repeat(28)}`);
  console.log(`  ${"TOTAL".padEnd(16)} ${grandTotal} providers\n`);
}

seed().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});