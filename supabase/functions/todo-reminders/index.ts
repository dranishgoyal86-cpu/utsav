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

// Triggered hourly by the same pg_cron job as rsvp-reminders. Fires once per
// to-do item, the moment it's within 24h of its scheduled_at (or already
// past it) and still pending — reminder_sent_at makes this a one-shot check
// per item, not a repeating nag every hour it stays overdue.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
      return json({ error: "Unauthorized" }, 401);
    }

    const dueBy = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data: dueTodos, error } = await supabaseAdmin
      .from("event_todos")
      .select("id, event_id, host_id, title, scheduled_at")
      .eq("status", "pending")
      .not("scheduled_at", "is", null)
      .lte("scheduled_at", dueBy)
      .is("reminder_sent_at", null);

    if (error) return json({ error: error.message }, 500);
    if (!dueTodos?.length) return json({ ok: true, todos_checked: 0, reminders_sent: 0 });

    // No joins — fetch the events these todos belong to in one follow-up
    // query and match in JS, same pattern as everywhere else in this app.
    const eventIds = [...new Set(dueTodos.map((t) => t.event_id).filter(Boolean))];
    const { data: events } = await supabaseAdmin
      .from("events")
      .select("id, name")
      .in("id", eventIds.length ? eventIds : ["00000000-0000-0000-0000-000000000000"]);
    const eventNameById = new Map((events || []).map((e) => [e.id, e.name]));

    const hostIds = [...new Set(dueTodos.map((t) => t.host_id).filter(Boolean))];
    const { data: hosts } = await supabaseAdmin
      .from("users")
      .select("id, push_token, notifications_enabled")
      .in("id", hostIds.length ? hostIds : ["00000000-0000-0000-0000-000000000000"]);
    const hostById = new Map((hosts || []).map((h) => [h.id, h]));

    let remindersSent = 0;
    for (const todo of dueTodos) {
      await supabaseAdmin
        .from("event_todos")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", todo.id);

      if (!todo.host_id) continue;

      const eventName = eventNameById.get(todo.event_id) || "your event";
      const overdue = new Date(todo.scheduled_at) < new Date();
      const title = overdue ? "Overdue checklist item ⏰" : "Checklist item due soon ⏰";
      const body = `"${todo.title}" for ${eventName} ${overdue ? "was due" : "is due"} ${new Date(todo.scheduled_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.`;

      await supabaseAdmin.from("notifications").insert({
        user_id: todo.host_id,
        title,
        body,
        data: { type: "todo_reminder", event_id: todo.event_id, todo_id: todo.id },
      });

      const host = hostById.get(todo.host_id);
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
            data: { type: "todo_reminder", event_id: todo.event_id },
          }),
        });
      }

      remindersSent++;
    }

    return json({ ok: true, todos_checked: dueTodos.length, reminders_sent: remindersSent });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
