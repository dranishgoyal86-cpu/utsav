// Provider verification, Task 5 (Google Business Profile). Confirms a
// business listing EXISTS under a similar name/location -- not ownership
// (that needs Google OAuth, explicitly out of scope). A match is a soft
// positive signal ("Business listing found"), no match is not a penalty --
// a real business might simply be listed under a slightly different name.
//
// Uses Places API (New) Text Search (POST places:searchText), not the
// legacy GET-based Place Search -- current Google docs point at the New
// API as the one being carried forward; the legacy one is still enabled on
// this key as a fallback but not what this calls. A minimal field mask
// (id/displayName/formattedAddress only) keeps this on the cheapest
// pricing tier -- no photos, ratings, hours, or anything else requested.
//
// ONE search per provider, ever -- checked_at is the cache marker, and
// this function refuses to search again once it's set (server-side, so a
// client can't force a re-search by just calling this again). Real usage
// math confirmed live before building: 5 claimed providers today out of
// 27,462 total rows (the other 27,457+ are unclaimed OSM-seeded listings
// with no real "claimed name" to check -- this never runs against them),
// comfortably inside the 10,000/month free tier even as the claimed count
// grows, since volume tracks new claims/month, not database size.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
// No default field list in Places API (New) -- omitting this errors out,
// not returns everything. Kept to exactly what this check needs.
const FIELD_MASK = "places.id,places.displayName,places.formattedAddress";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(jwt);
    if (authError || !user) return json({ error: "Not authenticated" }, 401);

    const { data: provider, error: provErr } = await supabaseAdmin
      .from("providers")
      .select("id, name, city, google_listing_checked_at, google_listing_found, google_listing_name, google_listing_address")
      .eq("user_id", user.id)
      .maybeSingle();
    if (provErr) return json({ error: provErr.message }, 500);
    if (!provider) return json({ error: "No provider profile found for this account." }, 400);

    // Cache hit -- return the stored result, no API call. This is the
    // real enforcement of "one search per provider, ever", not just a
    // client-side nicety.
    if (provider.google_listing_checked_at) {
      return json({
        ok: true, cached: true,
        found: provider.google_listing_found,
        name: provider.google_listing_name,
        address: provider.google_listing_address,
      });
    }

    if (!provider.name || !provider.city) {
      return json({ error: "Your business name and city need to be set before this check can run." }, 400);
    }

    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!apiKey) return json({ error: "Google Places API key is not configured." }, 500);

    const searchRes = await fetch(PLACES_TEXT_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: `${provider.name} ${provider.city}` }),
    });

    if (!searchRes.ok) {
      const errBody = await searchRes.text();
      console.log("Places API error:", searchRes.status, errBody);
      return json({ error: "Could not reach the Google Places API right now. Try again shortly." }, 502);
    }

    const searchData = await searchRes.json();
    const places = searchData.places || [];
    const match = places[0] || null;
    const found = !!match;

    const { error: updateErr } = await supabaseAdmin
      .from("providers")
      .update({
        google_listing_checked_at: new Date().toISOString(),
        google_listing_found: found,
        google_listing_name: match?.displayName?.text || null,
        google_listing_address: match?.formattedAddress || null,
      })
      .eq("id", provider.id);
    if (updateErr) return json({ error: updateErr.message }, 500);

    return json({
      ok: true, cached: false, found,
      name: match?.displayName?.text || null,
      address: match?.formattedAddress || null,
    });
  } catch (err) {
    console.log("verify-google-listing error:", err.message);
    return json({ error: err.message }, 500);
  }
});
