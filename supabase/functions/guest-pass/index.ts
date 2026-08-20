import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // Same reasoning as submit-rsvp/index.ts: callEdgeFunction() always sends
  // an Authorization header (even an empty bearer token with no session,
  // which is the normal case for a guest with no Utsav account at all) —
  // omitting "authorization" here breaks the browser CORS preflight outright.
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const PASS_CODE_PATTERN = /^[A-Z0-9]{6}$/;
const CHECKIN_SOURCES = ["proximity_tap", "geofence_auto"];

async function buildPassShape(pass: Record<string, any>) {
  const { data: guest } = await supabaseAdmin
    .from("event_invitees")
    .select("name, phone")
    .eq("id", pass.guest_id)
    .maybeSingle();

  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id, name, event_date, event_time, venue, venue_id, entry_start_time, entry_end_time")
    .eq("id", pass.event_id)
    .maybeSingle();
  if (eventError) throw new Error(eventError.message);
  if (!event) throw new Error("Event not found.");

  // events.venue_lat/venue_lng may not exist yet on this database — that
  // migration is applied separately (see supabase/migrations/
  // venue_coordinates.sql), not automatically. Retry without them rather
  // than 500 the whole pass lookup over a column that's still pending.
  let venueLat: number | null = null;
  let venueLng: number | null = null;
  {
    const { data: coordRow, error: coordError } = await supabaseAdmin
      .from("events")
      .select("venue_lat, venue_lng")
      .eq("id", pass.event_id)
      .maybeSingle();
    if (!coordError && coordRow) {
      venueLat = coordRow.venue_lat ?? null;
      venueLng = coordRow.venue_lng ?? null;
    }
  }

  let venueName: string | null = null;
  let venueAddress: string | null = null;
  if (event.venue_id) {
    const { data: venueRow, error: venueError } = await supabaseAdmin
      .from("venues")
      .select("name, address, latitude, longitude")
      .eq("id", event.venue_id)
      .maybeSingle();
    if (!venueError && venueRow) {
      venueName = venueRow.name || null;
      venueAddress = venueRow.address || null;
      // A booked marketplace venue's own coordinates take priority over
      // whatever (if anything) is on the event row for the free-text path.
      if (venueRow.latitude != null && venueRow.longitude != null) {
        venueLat = venueRow.latitude;
        venueLng = venueRow.longitude;
      }
    }
  }

  return {
    passCode: pass.pass_code,
    guestName: guest?.name || "Guest",
    partySize: pass.party_size || 1,
    status: pass.status,
    checkedInAt: pass.checked_in_at,
    arrivedCount: pass.arrived_count || 0,
    eventName: event.name,
    eventDate: event.event_date,
    eventTime: event.event_time,
    venueName,
    venueAddress: venueAddress || event.venue || null,
    venueLat,
    venueLng,
    entryWindow: event.entry_start_time || event.entry_end_time
      ? `${event.entry_start_time || "—"} to ${event.entry_end_time || "—"}`
      : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // ── get_my_pass: authenticated-only. Resolves the CALLING user's own
    // pass_code for a given event, via event_invitees.user_id — this is
    // what the geofencing opt-in (GuestAccess.js) uses to find which pass
    // to register/auto-check-in, and doubles as the "is this actually this
    // guest's invite" check before the toggle is ever shown. Deliberately
    // separate from the pass_code-only actions below: those trust "whoever
    // holds the code" (same model as submit-rsvp's invite_code), this one
    // trusts a real session instead, since there's no code in hand yet. ──
    if (action === "get_my_pass") {
      const authHeader = req.headers.get("authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!token) return json({ error: "Not signed in." }, 401);

      const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
      if (userError || !userData?.user) return json({ error: "Not signed in." }, 401);

      const eventId = String(body.event_id || "").trim();
      if (!eventId) return json({ error: "event_id required." }, 400);

      // event_invitees.user_id may not exist yet on this database (see
      // supabase/migrations/guest_account_link.sql — printed, not yet
      // applied as of this writing). Report that distinctly rather than a
      // generic 500, since it's an expected pending-migration state, not a
      // real error.
      const { data: invitee, error: inviteeError } = await supabaseAdmin
        .from("event_invitees")
        .select("id")
        .eq("event_id", eventId)
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (inviteeError) {
        return json({ pass: null, reason: "linking_unavailable", detail: inviteeError.message });
      }
      if (!invitee) return json({ pass: null, reason: "not_invited" });

      const { data: passRow, error: passRowError } = await supabaseAdmin
        .from("guest_passes")
        .select("id, event_id, guest_id, pass_code, party_size, status, checked_in_at, arrived_count")
        .eq("event_id", eventId)
        .eq("guest_id", invitee.id)
        .maybeSingle();
      if (passRowError) return json({ error: passRowError.message }, 500);
      if (!passRow) return json({ pass: null, reason: "no_pass_issued" });

      // Includes venueLat/venueLng — GuestAccess.js's geofencing toggle
      // needs them and this avoids a second round-trip via get_pass.
      const passShape = await buildPassShape(passRow);
      return json({ pass: passShape });
    }

    const code = String(body.pass_code || "").trim().toUpperCase();
    if (!PASS_CODE_PATTERN.test(code)) return json({ error: "Invalid pass code." }, 400);

    // Whoever holds the 6-character pass code can read/act on that ONE pass
    // — same trust model as submit-rsvp's invite_code (the code itself is
    // the credential; it's already printed/QR-shown on the physical pass
    // that gets shared over WhatsApp, so nothing new is exposed here that
    // wasn't already implicitly shareable). Never select every pass for the
    // event — that's what lib/passQueue.js's syncPasses() does, and it's
    // deliberately restricted to the host's own authenticated scanner
    // device; reusing it here would leak every other guest's name/phone/
    // pass_code to whichever one guest opened their own link.
    const { data: pass, error: passError } = await supabaseAdmin
      .from("guest_passes")
      .select("id, event_id, guest_id, pass_code, party_size, status, checked_in_at, arrived_count")
      .eq("pass_code", code)
      .maybeSingle();
    if (passError) return json({ error: passError.message }, 500);
    if (!pass) return json({ error: "Pass not found. Check the code and try again." }, 404);

    if (action === "get_pass") {
      const passShape = await buildPassShape(pass);
      return json({ pass: passShape });
    }

    if (action === "self_check_in") {
      if (pass.status === "void") return json({ error: "This pass has been voided." }, 400);

      const requestedCount = Math.max(1, Math.min(pass.party_size || 1, parseInt(String(body.arrived_count ?? pass.party_size ?? 1), 10) || 1));
      const source = CHECKIN_SOURCES.includes(body.source) ? body.source : "proximity_tap";

      // Earliest arrival wins, same rule lib/passQueue.js's recordCheckIn()/
      // syncOneCheckIn() already apply for the scanner path — this is a
      // second (now third, with geofence_auto) independent write path onto
      // the same table, so it must follow the identical merge rule to stay
      // consistent with whichever path lands first.
      const checkedInAt = pass.checked_in_at || new Date().toISOString();
      const mergedArrivedCount = Math.max(pass.arrived_count || 0, requestedCount);

      const patch: Record<string, unknown> = {
        status: "checked_in",
        checked_in_at: checkedInAt,
        arrived_count: mergedArrivedCount,
      };

      // guest_passes.checkin_source may not exist yet either — same
      // defensive retry as before.
      let updateError = (await supabaseAdmin.from("guest_passes")
        .update({ ...patch, checkin_source: source })
        .eq("id", pass.id)).error;
      if (updateError) {
        updateError = (await supabaseAdmin.from("guest_passes")
          .update(patch)
          .eq("id", pass.id)).error;
      }
      if (updateError) return json({ error: updateError.message }, 500);

      const passShape = await buildPassShape({ ...pass, ...patch });
      return json({ pass: passShape });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error." }, 500);
  }
});
