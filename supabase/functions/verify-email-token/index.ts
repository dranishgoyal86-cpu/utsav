// Provider verification, Task 1 (email) -- the "verify" half. Public
// (verify_jwt = false, registered in config.toml) because the person
// clicking the link may not be logged in on this device at all -- same
// reasoning as submit-rsvp/guest-pass being public. The token itself IS
// the proof of email ownership; no separate auth check makes sense here.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // See submit-rsvp/index.ts's comment: callEdgeFunction() always sends an
  // Authorization header (empty bearer when logged out), which must stay
  // allowed or the browser's CORS preflight silently drops the real request.
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token } = await req.json();
    if (!token) return json({ error: "token required" }, 400);

    const { data: userRow, error } = await supabaseAdmin
      .from("users")
      .select("id, email, email_verify_token_expires_at")
      .eq("email_verify_token", token)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!userRow) return json({ error: "invalid" }, 400);

    if (!userRow.email_verify_token_expires_at || new Date(userRow.email_verify_token_expires_at) < new Date()) {
      return json({ error: "expired" }, 400);
    }

    const { error: updateErr } = await supabaseAdmin
      .from("users")
      .update({ email_verified_at: new Date().toISOString(), email_verify_token: null, email_verify_token_expires_at: null })
      .eq("id", userRow.id);
    if (updateErr) return json({ error: updateErr.message }, 500);

    return json({ ok: true, email: userRow.email });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
