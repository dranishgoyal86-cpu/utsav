import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // Same reasoning as submit-rsvp/index.ts: callEdgeFunction() always sends
  // an Authorization header (even an empty bearer token with no session,
  // which is the normal case for a guest with no Utsav account at all) —
  // omitting "authorization" here breaks the browser CORS preflight outright.
  // "apikey" added for Wave 1's marketing-site invite page (FunctionRsvps.tsx)
  // — a genuinely cross-origin browser fetch (theutsavapp.com calling
  // supabase.co), unlike the mobile app's supabase-js client or this repo's
  // own server-side fetches, both of which aren't subject to CORS at all.
  // Confirmed live: the preflight was rejecting "apikey" before this fix,
  // silently blocking every submit_function_rsvp call from a real browser.
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
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

// ── Rate limiting (Wave 1, Task 5) — failed attempts only, never total
// traffic. Dozens of real wedding guests on shared venue/hotel wifi share
// one public IP; a volume limiter would lock out a room full of legitimate
// guests, not stop an attacker. Someone guessing pass_codes generates many
// *failures* from one source — that's the signal throttled on. Scoped per
// action so guessing against get_pass doesn't share a budget with normal
// submit_function_rsvp traffic. get_my_pass is deliberately excluded — it
// requires a real Supabase Auth JWT, and Auth's own login-rate-limiting
// already covers that credential; adding a second layer here is redundant,
// not "consistent." ──
const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_THRESHOLD = 15;
const RATE_LIMIT_SALT = Deno.env.get("RATE_LIMIT_SALT") || "";

function getClientIp(req: Request): string {
  // cf-connecting-ip: set directly by Cloudflare (Supabase's edge runs
  // behind it), never client-influenced — preferred when present.
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  // x-forwarded-for: Supabase's edge APPENDS the true client IP rather than
  // overwriting whatever the client sent, so a spoofed header arrives as
  // "attacker-value,real-ip" — the LAST entry is trustworthy, not the
  // first (confirmed against Supabase's own current docs/discussions
  // before writing this, not assumed from memory).
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "unknown";
}

async function hashIdentifier(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`${RATE_LIMIT_SALT}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function isRateLimited(req: Request, action: string): Promise<{ identifier: string; blocked: boolean }> {
  const identifier = await hashIdentifier(getClientIp(req));
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("guest_code_attempts")
    .select("id", { count: "exact", head: true })
    .eq("identifier", identifier)
    .eq("action", action)
    .eq("succeeded", false)
    .gte("created_at", windowStart);
  return { identifier, blocked: (count || 0) >= RATE_LIMIT_THRESHOLD };
}

function recordAttempt(identifier: string, action: string, succeeded: boolean) {
  // Fire-and-forget — never block the real response on this write.
  supabaseAdmin.from("guest_code_attempts").insert({ identifier, action, succeeded })
    .then(({ error }) => { if (error) console.log("recordAttempt failed:", error.message); });
}

async function buildPassShape(pass: Record<string, any>) {
  const { data: guest } = await supabaseAdmin
    .from("event_invitees")
    .select("name, phone")
    .eq("id", pass.guest_id)
    .maybeSingle();

  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id, name, event_date, event_time, venue, venue_id, entry_start_time, entry_end_time, maps_link")
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
    mapsLink: event.maps_link || null,
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

    // Bucket unrecognized action strings into one shared "other" key rather
    // than trusting the caller's raw value as the identifier — otherwise a
    // caller could vary `action` freely (action=x1, x2, x3, ...) to always
    // land in a fresh, empty bucket and bypass the limiter entirely.
    const RATE_LIMITED_ACTIONS = new Set(["get_pass", "get_invite", "submit_function_rsvp", "self_check_in", "get_wishes", "submit_wish", "submit_travel_details"]);
    const rateLimitAction = RATE_LIMITED_ACTIONS.has(action) ? action : "other";
    const { identifier, blocked } = await isRateLimited(req, rateLimitAction);
    if (blocked) {
      return json({ error: "Too many attempts. Please wait a few minutes and try again." }, 429);
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
    if (!pass) {
      recordAttempt(identifier, rateLimitAction, false);
      return json({ error: "Pass not found. Check the code and try again." }, 404);
    }
    recordAttempt(identifier, rateLimitAction, true);

    if (action === "get_pass") {
      const passShape = await buildPassShape(pass);
      return json({ pass: passShape });
    }

    // ── get_invite: Wave 1's guest invite page. Same pass_code trust model
    // as get_pass above — deliberately a NEW action rather than widening
    // get_pass's own response shape, so nothing already calling get_pass
    // today (PassCard.js, PassScanner.js) is affected. Adds invitee_id
    // (needed so the client can write into event_invitee_function_rsvps)
    // and the guest's scoped functions with their current RSVP status. ──
    if (action === "get_invite") {
      const passShape = await buildPassShape(pass);

      const { data: scoped, error: scopedError } = await supabaseAdmin
        .from("event_invitee_functions")
        .select("function_id")
        .eq("invitee_id", pass.guest_id);
      if (scopedError) return json({ error: scopedError.message }, 500);

      const functionIds = (scoped || []).map((r) => r.function_id);
      let functions: Record<string, any>[] = [];
      if (functionIds.length > 0) {
        // Two separate queries combined in JS, not a nested join — this
        // project's established Supabase convention.
        const { data: functionRows, error: functionsError } = await supabaseAdmin
          .from("event_functions")
          .select("id, name, date, time, sort_order")
          .in("id", functionIds)
          .order("sort_order", { ascending: true });
        if (functionsError) return json({ error: functionsError.message }, 500);

        const { data: rsvpRows, error: rsvpError } = await supabaseAdmin
          .from("event_invitee_function_rsvps")
          .select("function_id, status")
          .eq("invitee_id", pass.guest_id)
          .in("function_id", functionIds);
        if (rsvpError) return json({ error: rsvpError.message }, 500);

        const statusByFunctionId = new Map((rsvpRows || []).map((r) => [r.function_id, r.status]));
        functions = (functionRows || []).map((f) => ({
          id: f.id,
          name: f.name,
          date: f.date,
          time: f.time,
          status: statusByFunctionId.get(f.id) || "pending",
        }));
      }

      // event_invite_content may not exist yet on this database (printed
      // migration, not applied automatically) — same defensive shape as
      // every other migration-ahead-of-schema read in this project. Falls
      // through to null (ToranCover/page.tsx's existing eventName fallback)
      // rather than 500ing the whole invite over a table that's still
      // pending.
      let partner1: string | null = null;
      let partner2: string | null = null;
      let hostedBy: string | null = null;
      let couplePhotoUrl: string | null = null;
      let coupleQuote: string | null = null;
      const { data: contentRow, error: contentError } = await supabaseAdmin
        .from("event_invite_content")
        .select("partner_1_name, partner_2_name, hosted_by, couple_photo_url, couple_quote")
        .eq("event_id", pass.event_id)
        .maybeSingle();
      if (!contentError && contentRow) {
        partner1 = contentRow.partner_1_name || null;
        partner2 = contentRow.partner_2_name || null;
        hostedBy = contentRow.hosted_by || null;
        couplePhotoUrl = contentRow.couple_photo_url || null;
        coupleQuote = contentRow.couple_quote || null;
      }

      // has_outstation_guests gates whether the travel form is worth
      // showing at all (Wave 3, Task 3) — confirmed live to exist on
      // events. Guest's own current travel values are returned too so the
      // form pre-fills on a return visit rather than always starting blank.
      const { data: eventFlags } = await supabaseAdmin
        .from("events").select("has_outstation_guests").eq("id", pass.event_id).maybeSingle();

      const { data: travelRow } = await supabaseAdmin
        .from("event_invitees")
        .select("is_outstation, arrival_date, arrival_time, departure_date, departure_time, pickup_needed")
        .eq("id", pass.guest_id).maybeSingle();

      return json({
        invite: {
          ...passShape,
          invitee_id: pass.guest_id,
          functions,
          partner1Name: partner1,
          partner2Name: partner2,
          hostedBy,
          couplePhotoUrl,
          coupleQuote,
          hasOutstationGuests: !!eventFlags?.has_outstation_guests,
          travel: travelRow || null,
        },
      });
    }

    // ── get_wishes / submit_wish: Wave 2's Wishing Wall. Explicitly
    // guest-visible (a real, confirmed decision, not assumed) — this is
    // the first guest-facing READ of other guests' content anywhere in
    // this codebase. Same pass_code trust model as everything else here:
    // whoever holds ANY ONE guest's pass_code can read every wish for
    // that event, not just their own — a meaningfully different exposure
    // shape than a guest-scoped read, flagged rather than glossed over.
    // Display name is joined through event_invitees.name at READ time,
    // never stored on the wish — so a wish shows "Guest" automatically
    // after anonymization, no cleanup code needed. Avatar initials are
    // computed client-side from that name, not stored either. ──
    if (action === "get_wishes") {
      const { data: wishRows, error: wishError } = await supabaseAdmin
        .from("event_wishes")
        .select("id, invitee_id, message, created_at")
        .eq("event_id", pass.event_id)
        .order("created_at", { ascending: false });
      if (wishError) return json({ error: wishError.message }, 500);

      const invIds = [...new Set((wishRows || []).map((w) => w.invitee_id))];
      let namesById = new Map<string, string>();
      if (invIds.length > 0) {
        const { data: nameRows } = await supabaseAdmin
          .from("event_invitees").select("id, name").in("id", invIds);
        namesById = new Map((nameRows || []).map((r) => [r.id, r.name || "Guest"]));
      }

      const wishes = (wishRows || []).map((w) => ({
        id: w.id,
        guestName: namesById.get(w.invitee_id) || "Guest",
        message: w.message,
        createdAt: w.created_at,
      }));
      return json({ wishes });
    }

    if (action === "submit_wish") {
      const message = String(body.message || "").trim().slice(0, 500);
      if (!message) return json({ error: "Message required." }, 400);

      const { error: wishInsertError } = await supabaseAdmin
        .from("event_wishes")
        .insert({ event_id: pass.event_id, invitee_id: pass.guest_id, message });
      if (wishInsertError) return json({ error: wishInsertError.message }, 500);

      return json({ ok: true });
    }

    // ── submit_travel_details: Wave 3, Task 3. Only the guest-writable
    // travel columns — accommodation_id/room_number/pickup_notes are
    // deliberately excluded, matching submit-rsvp/index.ts's own existing
    // precedent for this exact same table ("those are host-only decisions
    // ... only ever written from GuestDetailModal.js"), not a fresh call. ──
    if (action === "submit_travel_details") {
      const isOutstation = !!body.is_outstation;
      const cleanDate = (d: unknown) =>
        (isOutstation && typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) ? d : null;

      const patch = {
        is_outstation: isOutstation,
        arrival_date: cleanDate(body.arrival_date),
        arrival_time: isOutstation ? (String(body.arrival_time || "").trim() || null) : null,
        departure_date: cleanDate(body.departure_date),
        departure_time: isOutstation ? (String(body.departure_time || "").trim() || null) : null,
        pickup_needed: isOutstation && !!body.pickup_needed,
      };

      const { error: travelError } = await supabaseAdmin
        .from("event_invitees").update(patch).eq("id", pass.guest_id);
      if (travelError) return json({ error: travelError.message }, 500);

      return json({ ok: true });
    }

    if (action === "submit_function_rsvp") {
      const functionId = String(body.function_id || "").trim();
      const status = String(body.status || "").trim();
      if (!functionId) return json({ error: "function_id required." }, 400);
      if (!["yes", "no"].includes(status)) return json({ error: "status must be yes or no." }, 400);

      // A guest can only RSVP to a function they're actually scoped to —
      // reject even if they somehow obtained a real function_id for a
      // function they weren't invited to (e.g. guessed, or copied from
      // another guest's page source).
      const { data: scopeRow, error: scopeError } = await supabaseAdmin
        .from("event_invitee_functions")
        .select("function_id")
        .eq("invitee_id", pass.guest_id)
        .eq("function_id", functionId)
        .maybeSingle();
      if (scopeError) return json({ error: scopeError.message }, 500);
      if (!scopeRow) return json({ error: "You're not invited to this function." }, 403);

      const { error: upsertError } = await supabaseAdmin
        .from("event_invitee_function_rsvps")
        .upsert(
          {
            invitee_id: pass.guest_id,
            function_id: functionId,
            status,
            responded_at: new Date().toISOString(),
            rsvp_source: "guest_self",
          },
          { onConflict: "invitee_id,function_id" }
        );
      if (upsertError) return json({ error: upsertError.message }, 500);

      return json({ ok: true, function_id: functionId, status });
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
