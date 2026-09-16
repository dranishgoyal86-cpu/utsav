// "we have positioned it as event planning agent, so whatever details a
// client is putting in the main plan screen ... app should pick all
// possible details and autofill event planning screen eventually"
// (Anish, Sept 16).
//
// PlanHero.js's free-text box ("e.g. A royal wedding for 300 guests in
// Delhi") previously only fed matchEventTypeText() — a keyword scan that
// picks the event TYPE and nothing else. Everything else typed in that box
// (guest count, city, date, budget, theme...) was thrown away; the host
// then had to re-type all of it into SlotPrompt.js/PlanView.js's slot
// fields one at a time. This function is the fix: it reads the same free
// text and returns a best-effort structured patch for exactly the fields
// components/SlotField.js already knows how to render/save (see that
// file's slotFilled()/slotDisplayValue() for the authoritative field list)
// — so PlanHero.js can merge this straight into the events row it creates,
// and every slot that came back filled is silently treated as "already
// answered" by the existing SlotPrompt/PlanView code, with zero changes
// needed there. No new schema, no new UI surface — this only ever writes
// into columns a host could already edit by hand.
//
// Deliberately conservative: the system prompt tells the model to OMIT any
// field it isn't confident about rather than guess. A missed field just
// means the host answers it the normal way, same as today — a wrong guess
// silently saved is the actually costly failure mode, and there's no
// review step here to catch one (PlanHero.js shows a plain "here's what we
// picked up" recap after creating the event, but nothing blocks on it).
//
// Reuses the OPENAI_API_KEY secret already set up for
// generate-invite-image (DALL-E) — no new secret needed. gpt-4o-mini
// rather than a bigger model: this is small, well-specified structured
// extraction, not creative generation, and it needs to feel instant on the
// same screen the host just typed into.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Kept in sync by hand with components/SlotField.js's real slots — see
// that file before changing this list. sub_type_slug is deliberately left
// out: its valid options depend on event_type_slug (lib/eventSubTypes.js)
// and matchEventTypeText() hasn't even resolved that yet when this runs,
// so there's no fixed option list to constrain the model to here.
const SYSTEM_PROMPT = `You extract event-planning details from a short, free-form description an Indian host typed when starting to plan their event (wedding, birthday, corporate event, etc.) on an events app called Utsav.

Return ONLY a JSON object with any of these keys — OMIT a key entirely if the text doesn't clearly say it; never guess or invent a value:
- city: string — the city name as the host would recognize it (e.g. "Delhi", "Mumbai", "Bengaluru").
- guest_count: integer — total number of guests, if a number or clear range midpoint is given.
- event_date: string in YYYY-MM-DD format. If a day/month is given with no year, assume the NEXT upcoming occurrence of that date on or after "today" (given below). If only a vague relative date is given ("next month", "in winter"), omit this field entirely rather than guess a specific day.
- budget_total: integer, in plain Indian Rupees (not paise). Convert Indian numbering: "50 lakhs"/"50L" = 5000000, "5 lakh" = 500000, "1 crore"/"1 cr" = 10000000, "2.5 crore" = 25000000. Plain numbers ("500000", "5,00,000") convert directly.
- theme: string — a short theme/style name only if one is explicitly named (e.g. "royal", "beach theme", "Frozen theme"). Do not invent a theme just because the event type implies a vibe.
- venue_type: one of "home" | "venue" — only if the text is explicit (e.g. "at home", "in our backyard" => "home"; "at a banquet hall", "destination wedding at a resort", a named venue => "venue"). Omit if not stated.
- is_dry_event: boolean — true only if the text explicitly says no alcohol / dry event; false only if it explicitly says there will be alcohol/an open bar. Omit otherwise.
- is_veg_only: boolean — true only if the text explicitly says vegetarian-only/pure veg; false only if it explicitly says non-veg will be served. Omit otherwise.
- birthday_person_name: string — only for a birthday event, the name of the person whose birthday it is, if given (e.g. "Riya's 5th birthday" => "Riya").

Respond with ONLY the JSON object, no other text.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(jwt);
    if (authError || !user) {
      return json({ error: "Not authenticated" }, 401);
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      // Same as generate-invite-image — a clear, actionable error rather
      // than a generic 500. PlanHero.js treats any error here as
      // non-fatal (falls back to plain event creation), so this never
      // blocks a host from starting to plan.
      return json({ error: "Auto-fill isn't set up yet. Ask the app owner to run: supabase secrets set OPENAI_API_KEY=..." }, 501);
    }

    const { text, todayDate } = await req.json();
    if (!text || typeof text !== "string") {
      return json({ error: "text is required" }, 400);
    }
    const today = typeof todayDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(todayDate)
      ? todayDate
      : new Date().toISOString().slice(0, 10);

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `today is ${today}\n\nevent description: ${text.slice(0, 500)}` },
        ],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return json({ error: data?.error?.message || "Auto-fill failed" }, res.status);
    }

    let patch: Record<string, unknown> = {};
    try {
      patch = JSON.parse(data?.choices?.[0]?.message?.content || "{}");
    } catch {
      // Model didn't return clean JSON — treat as "nothing extracted"
      // rather than fail the whole event-creation flow over it.
      patch = {};
    }

    // Defense in depth against a malformed/hallucinated response — never
    // let anything but the exact expected shape reach the client, since
    // this gets spread straight into a real `events` insert.
    const ALLOWED_KEYS = [
      "city", "guest_count", "event_date", "budget_total", "theme",
      "venue_type", "is_dry_event", "is_veg_only", "birthday_person_name",
    ];
    const cleaned: Record<string, unknown> = {};
    for (const key of ALLOWED_KEYS) {
      if (!(key in patch) || patch[key] === null) continue;
      const value = patch[key];
      if (key === "guest_count" || key === "budget_total") {
        if (typeof value === "number" && Number.isFinite(value) && value > 0) cleaned[key] = Math.round(value);
      } else if (key === "event_date") {
        if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) cleaned[key] = value;
      } else if (key === "venue_type") {
        if (value === "home" || value === "venue") cleaned[key] = value;
      } else if (key === "is_dry_event" || key === "is_veg_only") {
        if (typeof value === "boolean") cleaned[key] = value;
      } else if (typeof value === "string" && value.trim()) {
        cleaned[key] = value.trim().slice(0, 120);
      }
    }

    return json({ patch: cleaned });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
