require("dotenv").config();
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

async function test() {
  console.log("\n========================================");
  console.log("  Quick Debug Test");
  console.log("========================================\n");

  // ── 1. Check .env ──────────────────────────────────────────────────────────
  console.log("[ 1 ] Checking .env...");
  console.log(`  SUPABASE_URL         : ${process.env.SUPABASE_URL || "MISSING"}`);
  console.log(`  SUPABASE_SERVICE_KEY : ${process.env.SUPABASE_SERVICE_KEY ? process.env.SUPABASE_SERVICE_KEY.slice(0,10) + "..." : "MISSING"}`);

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error("\n  ✗ .env values missing. Check your .env file.\n");
    process.exit(1);
  }

  // ── 2. Test Supabase ───────────────────────────────────────────────────────
  console.log("\n[ 2 ] Testing Supabase...");
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { data, error } = await supabase.from("providers").select("id").limit(1);
  if (error) {
    console.error(`  ✗ Supabase error: ${error.message}`);
    console.error("  → Make sure 01-schema.sql was run in Supabase SQL Editor");
  } else {
    console.log("  ✓ Supabase connected, providers table exists");
  }

  // ── 3. Test OSM fetch ──────────────────────────────────────────────────────
  console.log("\n[ 3 ] Testing Overpass API (OSM)...");
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"="banquet_hall"](28.40,76.84,28.88,77.35);
      way["amenity"="banquet_hall"](28.40,76.84,28.88,77.35);
    );
    out center tags;
  `;
  try {
    const res = await axios.post(
      "https://overpass-api.de/api/interpreter",
      new URLSearchParams({ data: query }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 30000 }
    );
    const elements = res.data.elements || [];
    console.log(`  ✓ OSM responded — ${elements.length} banquet halls found in Delhi`);
    if (elements.length > 0) {
      const first = elements[0];
      console.log(`  First result: "${first.tags?.name || "(no name)"}" at ${first.lat || first.center?.lat}, ${first.lon || first.center?.lon}`);
    }
  } catch (err) {
    console.error(`  ✗ OSM fetch failed: ${err.message}`);
  }

  // ── 4. Try inserting one test row ──────────────────────────────────────────
  console.log("\n[ 4 ] Testing Supabase insert...");
  const testRecord = {
    name:            "Test Provider",
    city:            "Delhi",
    address:         "Test Address, Delhi",
    google_place_id: "test_osm_debug_001",
    source:          "test",
    is_verified:     false,
    is_claimed:      false,
  };

  const { error: insertError } = await supabase
    .from("providers")
    .upsert(testRecord, { onConflict: "google_place_id", ignoreDuplicates: true });

  if (insertError) {
    console.error(`  ✗ Insert failed: ${insertError.message}`);
    console.error("  → This is likely why seed-osm.js saved 0 rows");
    console.error("  → Most common fix: run 01-schema.sql in Supabase SQL Editor");
  } else {
    console.log("  ✓ Test row inserted successfully!");
    console.log("  → Supabase writes are working");
    console.log("  → The issue was OSM returning 0 named results");
    console.log("  → Cleaning up test row...");
    await supabase.from("providers").delete().eq("google_place_id", "test_osm_debug_001");
    console.log("  ✓ Test row cleaned up");
  }

  console.log("\n========================================");
  console.log("  Paste the full output above to Claude");
  console.log("========================================\n");
}

test().catch(console.error);