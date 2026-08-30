// Provider verification, Task 4 (website ownership). Meta-tag method,
// confirmed as the right default in Task 0's investigation: a DNS TXT
// record needs domain-registrar access most small business owners on this
// app won't have (same reasoning BillingProfile.js's docs already lean on
// for GST/PAN/Udyam -- this app's whole provider base skews toward small
// operators, not people who manage their own DNS), while pasting one
// <meta> tag into a site's <head> is something any website builder
// (WordPress, Wix, Shopify, plain HTML) supports without special access.
//
// Runs server-side, not client-side, because fetching an arbitrary
// third-party site's HTML from a browser tab hits that site's own CORS
// policy -- most sites don't send Access-Control-Allow-Origin for a
// random app's origin, so this would silently fail for the majority of
// real websites if done from the client. An edge function has no such
// restriction.
//
// Two actions against the SAME endpoint (matches this project's existing
// submit-rsvp-style action-routing convention):
//  - "check": validates + saves the URL, does an immediate reachability
//    fetch (the brief's "site exists and is reachable" step), and
//    generates the verification token if one doesn't exist yet.
//  - "confirm": re-fetches the site's current HTML and looks for the
//    <meta name="utsav-site-verification" content="{token}"> tag matching
//    the stored token -- THIS is the real ownership proof, not "check".
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const META_TAG_NAME = "utsav-site-verification";
const FETCH_TIMEOUT_MS = 8000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Cheap, proportionate SSRF guard -- this fetches whatever URL a provider
// types in, server-side. Not a full DNS-rebinding-proof allowlist (out of
// scope for a small review-flow fetch), but rejects the obvious internal/
// metadata/loopback targets outright rather than fetching them blind.
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "127.0.0.1" || h === "::1") return true;
  if (h.startsWith("169.254.")) return true; // link-local / cloud metadata
  if (h.startsWith("10.") || h.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

function parseUrl(raw: string): URL | null {
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (isBlockedHost(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(jwt);
    if (authError || !user) return json({ error: "Not authenticated" }, 401);

    const { data: provider, error: provErr } = await supabaseAdmin
      .from("providers").select("id, website_url, website_verify_token, website_verified_at")
      .eq("user_id", user.id).maybeSingle();
    if (provErr) return json({ error: provErr.message }, 500);
    if (!provider) return json({ error: "No provider profile found for this account." }, 400);

    const { action, url: rawUrl } = await req.json();

    if (action === "check") {
      const parsed = parseUrl(String(rawUrl || "").trim());
      if (!parsed) return json({ error: "Enter a valid website address." }, 400);
      const cleanUrl = parsed.toString();

      let reachable = false;
      try {
        const res = await fetchWithTimeout(cleanUrl, { method: "GET" });
        reachable = res.ok || (res.status >= 200 && res.status < 400);
      } catch (err) {
        reachable = false;
      }

      // A new URL (or no token yet) gets a fresh token -- switching domains
      // shouldn't let an old token embedded on a DIFFERENT site count.
      const token = provider.website_url === cleanUrl && provider.website_verify_token
        ? provider.website_verify_token
        : crypto.randomUUID();

      const { error: updateErr } = await supabaseAdmin
        .from("providers")
        .update({
          website_url: cleanUrl,
          website_verify_token: token,
          // Changing the URL invalidates any previous verification --
          // ownership of the old site says nothing about the new one.
          ...(provider.website_url !== cleanUrl ? { website_verified_at: null } : {}),
        })
        .eq("id", provider.id);
      if (updateErr) return json({ error: updateErr.message }, 500);

      return json({
        ok: true, reachable, url: cleanUrl, token,
        metaTag: `<meta name="${META_TAG_NAME}" content="${token}" />`,
      });
    }

    if (action === "confirm") {
      if (!provider.website_url || !provider.website_verify_token) {
        return json({ error: "Run a site check first." }, 400);
      }

      let html = "";
      try {
        const res = await fetchWithTimeout(provider.website_url, { method: "GET" });
        html = await res.text();
      } catch (err) {
        return json({ error: `Could not reach ${provider.website_url}. Make sure the site is live and try again.` }, 400);
      }

      // Matches either attribute order (name before content, or content
      // before name) -- real page builders emit both.
      const patterns = [
        new RegExp(`<meta[^>]*name=["']${META_TAG_NAME}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i"),
        new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${META_TAG_NAME}["'][^>]*>`, "i"),
      ];
      let foundToken: string | null = null;
      for (const re of patterns) {
        const m = html.match(re);
        if (m) { foundToken = m[1]; break; }
      }

      if (!foundToken) {
        return json({ error: `We couldn't find the verification tag on ${provider.website_url}. Make sure it's saved and published, then try again.` }, 400);
      }
      if (foundToken !== provider.website_verify_token) {
        return json({ error: "Found a verification tag, but it doesn't match — make sure you pasted the exact tag shown, unedited." }, 400);
      }

      const { error: updateErr } = await supabaseAdmin
        .from("providers")
        .update({ website_verified_at: new Date().toISOString() })
        .eq("id", provider.id);
      if (updateErr) return json({ error: updateErr.message }, 500);

      return json({ ok: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.log("verify-website error:", err.message);
    return json({ error: err.message }, 500);
  }
});
