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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Triggered daily by pg_cron (see the anonymize-guests-daily cron.schedule
// job in supabase/migrations/guest_data_retention.sql), not called by the
// app itself — same shape as birthday-wishes/rsvp-reminders. Anonymizes
// every event_invitees row whose event happened more than 90 days ago and
// hasn't been anonymized yet, by calling the one shared
// anonymize_guest_row() RPC per row (not a bulk UPDATE here) so the actual
// field list only has to be maintained in that single function, reused
// identically by both guest self-service paths.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
      return json({ error: "Unauthorized" }, 401);
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffDate = cutoff.toISOString().slice(0, 10); // events.event_date is a plain date column

    // No direct FK-join filter available via PostgREST's .eq on a joined
    // table's column here without an explicit relationship select, so this
    // fetches candidate events first (small, one row per past event), then
    // the invitee ids for those — same "fetch broadly, filter/loop in JS"
    // shape the other reminder functions already use.
    const { data: pastEvents, error: eventsError } = await supabaseAdmin
      .from("events")
      .select("id")
      .not("event_date", "is", null)
      .lt("event_date", cutoffDate);
    if (eventsError) return json({ error: eventsError.message }, 500);

    const eventIds = (pastEvents || []).map((e) => e.id);
    if (eventIds.length === 0) {
      return json({ ok: true, candidates_checked: 0, anonymized: 0 });
    }

    const { data: candidates, error: candErr } = await supabaseAdmin
      .from("event_invitees")
      .select("id")
      .in("event_id", eventIds)
      .is("anonymized_at", null);
    if (candErr) return json({ error: candErr.message }, 500);

    let anonymized = 0;
    for (const row of candidates || []) {
      const { error: rpcError } = await supabaseAdmin.rpc("anonymize_guest_row", { p_invitee_id: row.id });
      if (rpcError) {
        console.log(`anonymize_guest_row failed for ${row.id}:`, rpcError.message);
        continue;
      }
      anonymized++;
    }

    return json({ ok: true, candidates_checked: candidates?.length || 0, anonymized });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
