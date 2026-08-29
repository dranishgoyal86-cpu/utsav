// Minimal transactional email sender via AWS SES -- built because the
// investigation for the bulk-import feature found NO existing outbound
// email integration anywhere in this codebase (grepped for Resend/
// SendGrid/nodemailer/SMTP -- nothing), but the AWS credentials already
// stored as Supabase secrets (AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/
// AWS_REGION) turned out to be a real, already-wired-in AWS account -- just
// wired to Rekognition (supabase/functions/index-face,search-face,
// create-collection), not SES. Same account, unrelated service, nothing
// email-shaped anywhere near it. This function is the first thing in the
// app that calls SES with those credentials.
//
// Generic on purpose (to/subject/html) rather than hardcoded to one
// message, matching this project's own notify*() convention of small,
// purpose-named callers around a shared primitive -- but only the
// bulk-import category-mismatch follow-up calls it today.
//
// Confirmed live end-to-end: a real send returned 200 with a genuine SES
// MessageId (not just a clean HTTP response -- SES itself accepted and
// queued the message). What actually fixed it, diagnosed from the literal
// IAM error text across several rounds rather than guessed at: the IAM
// policy's Resource region has to match SES_REGION below exactly -- a
// region mismatch produces the identical "not authorized" wording as a
// genuinely missing grant, which is what made this look stuck for a
// while. (One earlier attempt against us-east-1 also hit a separate
// address-vs-domain ARN distinction -- IAM checked the specific
// contact@... identity there, not just the parent domain -- but that
// didn't end up mattering once the region itself was corrected to match
// ap-south-1, where the domain-only grant was already sufficient.) If
// this ever starts failing again, check the exact resource + region named
// in the error against the current IAM policy before assuming the code
// changed.
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

// Deliberately its own constant, not Deno.env.get("AWS_REGION") -- that
// secret exists for Rekognition's benefit (index-face/search-face/
// create-collection), an unrelated service run out of ap-south-1. SES
// identities/policies are region-scoped, and this must always match
// wherever the utsav-rekognition IAM user's SES grant is actually scoped
// in the AWS console -- confirmed live to matter: a region mismatch here
// produces the exact same "not authorized" error as a genuinely missing
// grant, so this constant and the console's IAM policy region have to be
// kept in sync by hand.
const SES_REGION = "ap-south-1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { to, subject, html } = await req.json();
    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ error: "to, subject, and html are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const client = new SESv2Client({
      region: SES_REGION,
      credentials: {
        accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID")!,
        secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY")!,
      },
    });

    const result = await client.send(new SendEmailCommand({
      FromEmailAddress: FROM_ADDRESS,
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: { Html: { Data: html, Charset: "UTF-8" } },
        },
      },
    }));

    return new Response(
      JSON.stringify({ ok: true, messageId: result.MessageId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.log("send-email error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
