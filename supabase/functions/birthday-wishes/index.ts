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

// Triggered once daily by pg_cron (see the cron.schedule job), not called by
// the app itself. Matches on month+day only (not year, obviously) — no
// computed-column filter for that via PostgREST, so this fetches every user
// with a date_of_birth set and checks month/day in JS, same "fetch broadly,
// filter in JS" pattern as the other reminder functions. last_birthday_wished_at
// is the one-shot guard: without it, running daily would just re-match the
// same person every day for the rest of their birth month if the day check
// alone were off, and running hourly (like the other reminder jobs) would
// wish them 24 times in a single day.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: candidates, error } = await supabaseAdmin
      .from("users")
      .select("id, name, date_of_birth, last_birthday_wished_at, push_token, notifications_enabled")
      .not("date_of_birth", "is", null);

    if (error) return json({ error: error.message }, 500);

    // This app is India-only — dates of birth were entered as IST calendar
    // dates, so "today" needs to be IST's calendar day too, not raw UTC.
    // Server UTC can still be on the previous day for over 5 hours of every
    // IST day (e.g. 00:08 IST on the 29th is 18:38 UTC on the 28th) — using
    // bare UTC here would miss/mis-date birthdays during that whole window.
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const today = new Date(Date.now() + IST_OFFSET_MS);
    const todayMonth = today.getUTCMonth();
    const todayDate = today.getUTCDate();
    const todayYear = today.getUTCFullYear();

    let wishesSent = 0;
    for (const person of candidates || []) {
      const dob = new Date(person.date_of_birth + "T00:00:00Z");
      if (dob.getUTCMonth() !== todayMonth || dob.getUTCDate() !== todayDate) continue;

      // Already wished this exact year — skip (the one-shot guard).
      if (person.last_birthday_wished_at) {
        const lastYear = new Date(person.last_birthday_wished_at).getUTCFullYear();
        if (lastYear === todayYear) continue;
      }

      const title = "🎉 Happy Birthday!";
      const body = `Wishing you a wonderful year ahead, ${person.name || "there"}! Make every celebration an Utsav 🎂✨ — from all of us on the team.`;

      await supabaseAdmin.from("notifications").insert({
        user_id: person.id,
        title,
        body,
        data: { type: "birthday_wish" },
      });

      await supabaseAdmin
        .from("users")
        .update({ last_birthday_wished_at: new Date().toISOString() })
        .eq("id", person.id);

      if (person.push_token && person.notifications_enabled !== false) {
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: person.push_token,
            sound: "default",
            title,
            body,
            data: { type: "birthday_wish" },
          }),
        });
      }

      wishesSent++;
    }

    return json({ ok: true, candidates_checked: candidates?.length || 0, wishes_sent: wishesSent });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
