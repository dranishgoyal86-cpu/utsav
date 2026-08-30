// Provider verification, Task 1 (email) -- the "request" half. Authenticated
// (same pattern as send-email/index.ts: checks the caller's own JWT via
// auth.getUser, no separate authorization concept needed since this only
// ever verifies the CALLER's own email). Generates a one-time token
// server-side with Deno's native crypto.randomUUID() -- kept server-side
// rather than client-generated because RN/Expo has no crypto.randomUUID
// polyfill installed in this app today, and a security-sensitive token is
// exactly the kind of value this project already treats differently from
// the Math.random()-based invite/pass codes elsewhere (those are shareable
// convenience codes, not proof of email ownership).
//
// Reuses public.users.email_verified_at (already exists -- see
// screens/ClaimVendorFlow.js's held email-change-OTP step, which targets
// the same column). Sends via the existing send-email function's exact SES
// call, duplicated rather than shared -- matches this codebase's own stated
// convention (see submit-rsvp/index.ts's rate-limit comment) of every edge
// function being self-contained.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { SESv2Client, SendEmailCommand } from "npm:@aws-sdk/client-sesv2@3.600.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const FROM_ADDRESS = "Utsav <contact@theutsavapp.com>";
// Same pinned-region reasoning as send-email/index.ts -- must stay in sync
// with wherever the utsav-rekognition IAM user's SES grant is scoped.
const SES_REGION = "ap-south-1";

// Duplicated from config.js's PUBLIC_WEB_URL -- Deno edge functions can't
// import the RN app's JS config, and no edge function in this project
// imports across that boundary today (bulkImportInvite.js builds its link
// client-side instead, for the same reason). Keep in sync by hand.
const PUBLIC_WEB_URL = "https://app.theutsavapp.com";

const TOKEN_TTL_HOURS = 24;

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

    const { data: userRow, error: userErr } = await supabaseAdmin
      .from("users").select("email, name, email_verified_at").eq("id", user.id).maybeSingle();
    if (userErr) return json({ error: userErr.message }, 500);
    if (!userRow?.email) return json({ error: "No email on file for this account yet." }, 400);
    if (userRow.email_verified_at) return json({ ok: true, already_verified: true });

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000).toISOString();

    const { error: updateErr } = await supabaseAdmin
      .from("users")
      .update({ email_verify_token: token, email_verify_token_expires_at: expiresAt })
      .eq("id", user.id);
    if (updateErr) return json({ error: updateErr.message }, 500);

    const link = `${PUBLIC_WEB_URL}/verify-email/${token}`;

    const client = new SESv2Client({
      region: SES_REGION,
      credentials: {
        accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID")!,
        secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY")!,
      },
    });

    await client.send(new SendEmailCommand({
      FromEmailAddress: FROM_ADDRESS,
      Destination: { ToAddresses: [userRow.email] },
      Content: {
        Simple: {
          Subject: { Data: "Verify your email — Utsav", Charset: "UTF-8" },
          Body: {
            Html: {
              Charset: "UTF-8",
              Data: `
                <p>Hi${userRow.name ? ` ${userRow.name}` : ""},</p>
                <p>Confirm this is your email address to add it as a verification signal on your Utsav provider profile:</p>
                <p><a href="${link}">${link}</a></p>
                <p>This link expires in ${TOKEN_TTL_HOURS} hours. If you didn't request this, you can ignore it.</p>
              `,
            },
          },
        },
      },
    }));

    return json({ ok: true });
  } catch (err) {
    console.log("request-email-verification error:", err.message);
    return json({ error: err.message }, 500);
  }
});
