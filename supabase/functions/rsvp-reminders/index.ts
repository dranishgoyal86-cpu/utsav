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

// Triggered hourly by pg_cron (see the cron.schedule job) — not called by
// the app itself. Most guests RSVP through the public web form with no
// Utsav account at all, so there's no push token to reach *them* directly;
// the only reliably reachable party is the host, who has the app. This
// nudges the host to personally follow up with whoever hasn't responded,
// which mirrors how hosts already chase RSVPs in real life anyway.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
      return json({ error: "Unauthorized" }, 401);
    }

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // invites_sent_at is stamped once, the first time a host shares an
    // invite for this event (see GuestList.js markInvitesSent). Events that
    // never had invites shared, or were already reminded, are excluded.
    const { data: dueEvents, error } = await supabaseAdmin
      .from("events")
      .select("id, name, host_id, invites_sent_at")
      .not("invites_sent_at", "is", null)
      .lte("invites_sent_at", cutoff)
      .is("rsvp_reminder_sent_at", null);

    if (error) return json({ error: error.message }, 500);

    let remindersSent = 0;
    for (const ev of dueEvents || []) {
      const { data: pendingGuests, error: pErr } = await supabaseAdmin
        .from("event_invitees")
        .select("id")
        .eq("event_id", ev.id)
        .eq("rsvp_status", "pending");

      if (pErr) {
        console.log(`pending lookup failed for event ${ev.id}:`, pErr.message);
        continue;
      }

      // Mark reminded regardless of outcome (including zero pending) so this
      // event is a one-shot check, never re-evaluated on every future run.
      await supabaseAdmin
        .from("events")
        .update({ rsvp_reminder_sent_at: new Date().toISOString() })
        .eq("id", ev.id);

      const pendingCount = pendingGuests?.length || 0;
      if (pendingCount === 0 || !ev.host_id) continue;

      const { data: host } = await supabaseAdmin
        .from("users")
        .select("push_token, notifications_enabled")
        .eq("id", ev.host_id)
        .maybeSingle();

      const title = "RSVP reminder 📋";
      const body = `${pendingCount} guest${pendingCount === 1 ? "" : "s"} for "${ev.name}" ${
        pendingCount === 1 ? "hasn't" : "haven't"
      } RSVP'd yet. Consider following up directly.`;

      await supabaseAdmin.from("notifications").insert({
        user_id: ev.host_id,
        title,
        body,
        data: { type: "rsvp_reminder", event_id: ev.id, pending_count: pendingCount },
      });

      if (host?.push_token && host.notifications_enabled !== false) {
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: host.push_token,
            sound: "default",
            title,
            body,
            data: { type: "rsvp_reminder", event_id: ev.id },
          }),
        });
      }

      remindersSent++;
    }

    return json({ ok: true, events_checked: dueEvents?.length || 0, reminders_sent: remindersSent });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
