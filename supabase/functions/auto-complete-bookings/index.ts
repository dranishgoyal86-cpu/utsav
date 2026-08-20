import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-cron-secret",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const CRON_SECRET = Deno.env.get("CRON_SECRET");

// The safety-net window — how many days past event_date a still-'confirmed'
// booking sits before it auto-completes if nobody confirmed and nobody
// disputed. Change this single constant to adjust it; nothing else in this
// file (or the pg_cron schedule, which just triggers this function once a
// day) needs to change alongside it. Mirrored in lib/bookingLifecycle.js's
// own SAFETY_NET_DAYS (used by the app + its verify script) — Deno edge
// functions deploy standalone and can't import from there, so keep the two
// numbers in sync by hand if this ever changes.
const SAFETY_NET_DAYS = 6;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Triggered daily by pg_cron (see the cron.schedule job in the booking-
// lifecycle migration) — not called by the app itself. This is the safety
// net for the mutual-confirmation flow (BookingsScreen.js / ProviderERP.js):
// if neither side (or only one side) ever taps "Confirm service delivered",
// and nobody raised a dispute, the booking still completes on its own once
// enough time has passed since the event. A raised dispute permanently
// blocks this — it never un-blocks itself, only an admin resolving it
// (utsav-admin's Disputes tab) can move the booking forward again.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
      return json({ error: "Unauthorized" }, 401);
    }

    const cutoff = new Date(Date.now() - SAFETY_NET_DAYS * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    // Only an OPEN dispute ('raised') blocks auto-completion — a 'resolved'
    // one (an admin already sorted it out via utsav-admin's Disputes tab)
    // should not permanently exclude the booking. In practice resolving a
    // dispute already writes status directly (completed/cancelled), so this
    // mostly guards a booking that's still 'confirmed' with an old resolved
    // dispute attached from some other path — matches lib/bookingLifecycle.js's
    // isDisputeBlocking(), which only treats 'raised' as blocking.
    const { data: dueBookings, error: fetchError } = await supabaseAdmin
      .from("bookings")
      .select("id")
      .eq("status", "confirmed")
      .lt("event_date", cutoff)
      .or("dispute_status.is.null,dispute_status.eq.resolved");

    if (fetchError) throw fetchError;
    if (!dueBookings || dueBookings.length === 0) {
      return json({ completed: 0 });
    }

    const ids = dueBookings.map((b) => b.id);
    const { error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .in("id", ids);

    if (updateError) throw updateError;

    return json({ completed: ids.length, bookingIds: ids });
  } catch (err) {
    console.log("auto-complete-bookings error:", err.message);
    return json({ error: err.message }, 500);
  }
});
