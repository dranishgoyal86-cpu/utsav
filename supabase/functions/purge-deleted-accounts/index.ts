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
const GRACE_PERIOD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Triggered daily by pg_cron (see supabase/migrations/account_deletion.sql),
// not called by the app itself.
//
// Scoped to customer accounts only — a provider's account is tied to a
// public business listing that other customers' bookings and reviews
// reference (providers.user_id cascades from public.users), so a
// self-service provider deletion would ripple into other people's booking
// history. ProfileScreen.js (customer-only) never lets a provider set
// deletion_requested_at in the first place, but this is checked again here
// as a second guard rather than trusting the client-side gate alone.
//
// Every table with a foreign key to auth.users/public.users was checked
// against the live schema before writing this (see the account-deletion
// build notes) — some cascade automatically once the users row is deleted
// (providers, albums, saved_plans, invoices, event_invitees, and others),
// the rest are handled explicitly below because they're "on delete no
// action" and would otherwise block the delete outright. Two categories
// get anonymized instead of deleted, per an explicit product decision:
// bookings/orders/reviews/verified_event_photos keep their row (financial
// and public-review record) but lose the identity link back to this user.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
      return json({ error: "Unauthorized" }, 401);
    }

    const cutoff = new Date(Date.now() - GRACE_PERIOD_MS).toISOString();

    const { data: candidates, error: findError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("role", "customer")
      .lte("deletion_requested_at", cutoff)
      .not("deletion_requested_at", "is", null);

    if (findError) throw findError;
    if (!candidates || candidates.length === 0) {
      return json({ purged: 0 });
    }

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];

    for (const { id: userId } of candidates) {
      try {
        await purgeAccount(userId);
        results.push({ id: userId, ok: true });
      } catch (err) {
        console.log(`purgeAccount failed for ${userId}:`, err.message);
        results.push({ id: userId, ok: false, error: err.message });
      }
    }

    return json({ purged: results.filter(r => r.ok).length, results });
  } catch (err) {
    console.log("purge-deleted-accounts error:", err.message);
    return json({ error: err.message }, 500);
  }
});

async function purgeAccount(userId: string) {
  // Personal, no reason to retain — deleted outright.
  await supabaseAdmin.from("blocked_providers").delete().eq("customer_id", userId);
  await supabaseAdmin.from("saved_providers").delete().eq("customer_id", userId);
  await supabaseAdmin.from("notifications").delete().eq("user_id", userId);
  await supabaseAdmin.from("messages").delete().eq("sender_id", userId);
  await supabaseAdmin.from("messages").delete().eq("receiver_id", userId);
  await supabaseAdmin.from("event_guests").delete().eq("guest_id", userId);
  await supabaseAdmin.from("guest_list").delete().eq("host_id", userId);
  await supabaseAdmin.from("verification_requests").delete().eq("user_id", userId);

  // Financial/public-record rows — kept, identity link severed.
  await supabaseAdmin.from("bookings").update({ customer_id: null }).eq("customer_id", userId);
  await supabaseAdmin.from("orders").update({ customer_id: null }).eq("customer_id", userId);
  await supabaseAdmin.from("reviews").update({ customer_id: null }).eq("customer_id", userId);
  await supabaseAdmin.from("verified_event_photos").update({ customer_id: null }).eq("customer_id", userId);
  await supabaseAdmin.from("photos").update({ uploaded_by: null }).eq("uploaded_by", userId);

  // Rows where this user shows up as a bystander (admin reviewer, guard who
  // scanned a pass, admin who suspended someone) — the row itself belongs
  // to someone else, only the reference to this user is cleared.
  await supabaseAdmin.from("category_requests").update({ requested_by: null }).eq("requested_by", userId);
  await supabaseAdmin.from("guest_passes").update({ checked_in_by: null }).eq("checked_in_by", userId);
  await supabaseAdmin.from("verification_requests").update({ reviewed_by: null }).eq("reviewed_by", userId);
  await supabaseAdmin.from("provider_claims").update({ reviewed_by: null }).eq("reviewed_by", userId);
  await supabaseAdmin.from("provider_claims").update({ claimant_user_id: null }).eq("claimant_user_id", userId);
  await supabaseAdmin.from("users").update({ suspended_by: null }).eq("suspended_by", userId);

  // Events this user hosted — mirrors helpers.js's deleteEventCascade
  // exactly (photos/event_guests/guest_list, then the event itself), run
  // per event since that helper is client-side and can't be called from
  // here directly. Everything else tied to an event (event_invitees,
  // event_todos, gift_stickers, guest_passes, return_gifts, etc.) cascades
  // automatically once the event row goes; albums/saved_plans/
  // category_interest/reciprocity_ledger linked to the event have their
  // event_id set null instead, so a photo album a guest can still see
  // isn't deleted just because the host's account was.
  const { data: hostedEvents } = await supabaseAdmin.from("events").select("id").eq("host_id", userId);
  for (const { id: eventId } of hostedEvents || []) {
    await supabaseAdmin.from("photos").delete().eq("event_id", eventId);
    await supabaseAdmin.from("event_guests").delete().eq("event_id", eventId);
    await supabaseAdmin.from("guest_list").delete().eq("event_id", eventId);
    await supabaseAdmin.from("events").delete().eq("id", eventId);
  }

  // The users row itself — providers, albums, saved_plans, invoices,
  // event_invitees, provider_claims (claimant side), event_workspace,
  // personal_vendors, provider_billing, album_media, album_shares all
  // cascade automatically from here.
  const { error: usersError } = await supabaseAdmin.from("users").delete().eq("id", userId);
  if (usersError) throw usersError;

  // Finally the auth account itself — everything that could have blocked
  // this (on delete no action) has been cleared above.
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authError) throw authError;
}
