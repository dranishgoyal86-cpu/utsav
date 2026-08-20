require("dotenv").config();
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

const GOOGLE_KEY = process.env.GOOGLE_MAPS_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function diagnose() {
  console.log("\n========================================");
  console.log("  Utsav Seeder — Diagnostics");
  console.log("========================================\n");

  // ── 1. Check .env values loaded ─────────────────────────────────────────────
  console.log("[ 1 ] Checking .env values...");
  const missingKeys = [];
  if (!GOOGLE_KEY)          missingKeys.push("GOOGLE_MAPS_KEY");
  if (!SUPABASE_URL)        missingKeys.push("SUPABASE_URL");
  if (!SUPABASE_SERVICE_KEY) missingKeys.push("SUPABASE_SERVICE_KEY");

  if (missingKeys.length > 0) {
    console.error(`  ✗ Missing in .env: ${missingKeys.join(", ")}`);
    console.error("  → Make sure your .env file is in the SAME folder as this script.");
    console.error("  → The file must be named exactly  .env  (not .env.example)\n");
    process.exit(1);
  }
  console.log("  ✓ All 3 env vars found");
  console.log(`  GOOGLE_MAPS_KEY      : ${GOOGLE_KEY.slice(0, 8)}...${GOOGLE_KEY.slice(-4)}`);
  console.log(`  SUPABASE_URL         : ${SUPABASE_URL}`);
  console.log(`  SUPABASE_SERVICE_KEY : ${SUPABASE_SERVICE_KEY.slice(0, 8)}...${SUPABASE_SERVICE_KEY.slice(-4)}\n`);


  // ── 2. Test Google Places API ────────────────────────────────────────────────
  console.log("[ 2 ] Testing Google Places API...");
  const testQuery = "wedding decorator in Delhi India";
  let placesOk = false;
  try {
    const res = await axios.get(
      "https://maps.googleapis.com/maps/api/place/textsearch/json",
      { params: { query: testQuery, key: GOOGLE_KEY, language: "en", region: "in" } }
    );
    const status = res.data.status;
    const count  = (res.data.results || []).length;

    if (status === "OK") {
      console.log(`  ✓ API responded OK — ${count} results for "${testQuery}"`);
      if (count > 0) {
        const p = res.data.results[0];
        console.log(`  ✓ First result: "${p.name}" (${p.formatted_address})`);
      }
      placesOk = true;
    } else if (status === "REQUEST_DENIED") {
      console.error("  ✗ REQUEST_DENIED — most common causes:");
      console.error("    a) Places API is NOT enabled in Google Cloud Console");
      console.error("       → Go to console.cloud.google.com → APIs & Services → Enable APIs");
      console.error("       → Search for 'Places API' and click Enable");
      console.error("    b) API key has restrictions that block this request");
      console.error("       → Go to Credentials → Edit your key → Remove all restrictions temporarily");
      console.error(`  Error message from Google: ${res.data.error_message || "(none)"}`);
    } else if (status === "INVALID_REQUEST") {
      console.error("  ✗ INVALID_REQUEST — the API key or query is malformed");
      console.error(`  Raw response: ${JSON.stringify(res.data)}`);
    } else if (status === "OVER_QUERY_LIMIT") {
      console.error("  ✗ OVER_QUERY_LIMIT — you've exceeded the free tier quota");
      console.error("    → Check your billing in Google Cloud Console");
    } else if (status === "ZERO_RESULTS") {
      console.warn(`  ⚠ ZERO_RESULTS — API is working but found nothing for this query`);
      console.warn("    This is unusual for 'wedding decorator in Delhi India'");
      console.warn("    → Check if billing is enabled (Places API requires it even for free tier)");
      placesOk = true;
    } else {
      console.error(`  ✗ Unexpected status: ${status}`);
      console.error(`  Full response: ${JSON.stringify(res.data)}`);
    }
  } catch (err) {
    if (err.code === "ENOTFOUND") {
      console.error("  ✗ Network error — cannot reach maps.googleapis.com");
      console.error("    → Check your internet connection");
    } else {
      console.error(`  ✗ Request failed: ${err.message}`);
    }
  }
  console.log();


  // ── 3. Test Supabase connection ──────────────────────────────────────────────
  console.log("[ 3 ] Testing Supabase connection...");
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data, error } = await supabase.from("providers").select("id").limit(1);
    if (error) {
      if (error.message.includes("does not exist")) {
        console.error("  ✗ Table 'providers' does not exist in Supabase");
        console.error("    → Run 01-schema.sql in your Supabase SQL Editor first");
      } else if (error.message.includes("Invalid API key")) {
        console.error("  ✗ Invalid Supabase key — make sure you're using the service_role key");
        console.error("    → Go to Supabase → Project Settings → API → service_role (not anon)");
      } else {
        console.error(`  ✗ Supabase error: ${error.message}`);
      }
    } else {
      console.log(`  ✓ Supabase connected — providers table exists`);
      console.log(`  ✓ Current row count in providers: ${data?.length ?? 0} (limited to 1 for check)`);

      // Check if google_place_id column exists
      const { error: colErr } = await supabase
        .from("providers")
        .select("google_place_id")
        .limit(1);
      if (colErr && colErr.message.includes("google_place_id")) {
        console.warn("  ⚠ Column 'google_place_id' missing from providers table");
        console.warn("    → Re-run 01-schema.sql to add the new columns");
      } else {
        console.log("  ✓ google_place_id column exists");
      }
    }
  } catch (err) {
    console.error(`  ✗ Failed to connect to Supabase: ${err.message}`);
  }
  console.log();


  // ── 4. Summary ───────────────────────────────────────────────────────────────
  console.log("========================================");
  if (placesOk) {
    console.log("  Places API: WORKING ✓");
    console.log("  → If the main seeder still shows 0 results,");
    console.log("     the issue is in how results are being written to Supabase.");
    console.log("     Share the console output and we'll fix it.");
  } else {
    console.log("  Places API: FAILING ✗");
    console.log("  → Fix the Places API issue above first.");
    console.log("  → Most likely: billing not enabled OR Places API not enabled.");
    console.log("\n  How to enable billing (required even for free tier):");
    console.log("  1. console.cloud.google.com → Billing → Link a billing account");
    console.log("  2. You won't be charged — Google gives $200 free credit/month");
    console.log("  3. Places API won't work at all without billing linked");
  }
  console.log("========================================\n");
}

diagnose().catch(console.error);