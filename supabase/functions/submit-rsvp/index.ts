import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // callEdgeFunction() (helpers.js) always sends an Authorization header —
  // even an empty bearer token when there's no session, which is exactly
  // the case for a guest hitting this function with no account at all.
  // Omitting "authorization" here made the browser's CORS preflight reject
  // every web request outright (not a real auth failure — the actual fetch
  // never got sent), which is what broke the RSVP flow on the deployed site.
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const RSVP_STATUSES = ["yes", "no", "maybe"];
const FOOD_PREFS = ["any", "veg", "nonveg", "jain"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      action, invite_code, guest_id, name, phone, rsvp_status, plus_ones, food_pref,
      is_outstation, arrival_date, arrival_time, arrival_details, departure_date, departure_time, pickup_needed,
      file_base64, file_ext, target, accompanying_id, accompanying_name,
    } = await req.json();

    if (!invite_code) return json({ error: "invite_code required" }, 400);

    // Every action needs the event first — this is the entire security
    // boundary. A guest can only ever act within the one event their code
    // points to; no host_id or other internal fields are ever returned to
    // the client, only used server-side for the upsert below.
    const { data: event, error: eventError } = await supabaseAdmin
      .from("events")
      .select("id, name, event_date, event_time, venue, host_id")
      .eq("invite_code", String(invite_code).toUpperCase())
      .maybeSingle();

    if (eventError) return json({ error: eventError.message }, 500);
    if (!event) return json({ error: "Invite not found. Check the code and try again." }, 404);

    if (action === "get_event") {
      // events.default_plus_one_limit may not exist yet on this database
      // (see supabase/migrations/guest_management_gaps.sql — printed, not
      // applied automatically). Retry without it rather than 500 the whole
      // RSVP lookup over a column that's still pending.
      let plusOneLimit: number | null = null;
      const { data: limitRow, error: limitError } = await supabaseAdmin
        .from("events")
        .select("default_plus_one_limit")
        .eq("id", event.id)
        .maybeSingle();
      if (!limitError && limitRow) plusOneLimit = limitRow.default_plus_one_limit ?? null;

      // Prefill — only when this link carries the guest's own id (see
      // linking.js's optional :guestId? segment). Scoped to THIS event and
      // excludes an anonymized row (same safety check
      // request_guest_deletion_by_invite already applies) so a stale/
      // tampered id never leaks another event's or a deleted guest's data.
      // A guest_id that doesn't resolve here (wrong event, anonymized,
      // genuinely bogus) silently falls through to a blank form — same as
      // an old-style link with no guestId at all.
      let invitee: Record<string, unknown> | null = null;
      let accompanying: Record<string, unknown>[] = [];
      if (guest_id) {
        const { data: invRow } = await supabaseAdmin
          .from("event_invitees")
          .select("id, name, phone, rsvp_status, plus_ones, food_pref, is_outstation, arrival_date, arrival_time, arrival_details, departure_date, departure_time, pickup_needed")
          .eq("event_id", event.id)
          .eq("id", guest_id)
          .is("anonymized_at", null)
          .maybeSingle();
        if (invRow) {
          invitee = invRow;
          const { data: accRows } = await supabaseAdmin
            .from("guest_accompanying")
            .select("id, name, govt_id_doc_path")
            .eq("invitee_id", guest_id);
          accompanying = accRows || [];
        }
      }

      return json({
        event: {
          id: event.id, name: event.name, event_date: event.event_date, event_time: event.event_time,
          venue: event.venue, defaultPlusOneLimit: plusOneLimit, invitee, accompanying,
        },
      });
    }

    if (action === "submit_rsvp") {
      const cleanName = String(name || "").trim();
      const cleanPhone = String(phone || "").trim();
      if (!cleanName) return json({ error: "Name is required." }, 400);
      if (cleanPhone.replace(/\D/g, "").length < 10) return json({ error: "A valid 10-digit phone number is required." }, 400);
      if (!RSVP_STATUSES.includes(rsvp_status)) return json({ error: "rsvp_status must be yes, no, or maybe." }, 400);

      const accompanying = Math.max(0, Math.min(50, parseInt(plus_ones, 10) || 0));
      // A "no" RSVP has no food_pref sent by the client at all — default to
      // "any" rather than rejecting, since it's irrelevant either way.
      const cleanFoodPref = FOOD_PREFS.includes(food_pref) ? food_pref : "any";

      // Outstation travel — guest-writable fields only (see
      // supabase/migrations/outstation_travel.sql). pickup_notes/
      // accommodation_id/room_number are deliberately NOT accepted here —
      // those are host-only decisions (who's actually assigned, which
      // hotel), only ever written from GuestDetailModal.js. Blank/unchecked
      // means the guest isn't outstation at all — every field collapses to
      // null/false together rather than leaving stray dates on a guest who
      // toggled the section off before submitting.
      const isOutstation = !!is_outstation;
      const cleanDate = (d) => (isOutstation && typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) ? d : null;
      const travelFields = {
        is_outstation: isOutstation,
        arrival_date: cleanDate(arrival_date),
        arrival_time: isOutstation ? (String(arrival_time || "").trim() || null) : null,
        arrival_details: isOutstation ? (String(arrival_details || "").trim() || null) : null,
        departure_date: cleanDate(departure_date),
        departure_time: isOutstation ? (String(departure_time || "").trim() || null) : null,
        pickup_needed: isOutstation && !!pickup_needed,
      };

      // Guest-id-anchored match takes priority when this link carried one
      // and it actually resolves within this event (not anonymized) — the
      // durable fix for "changing name/phone forks a duplicate row" (see
      // this migration's header comment: supabase/migrations/
      // rsvp_prefill_and_guest_documents.sql). Falls back to today's
      // phone-only match, unchanged, for old-style broadcast links or a
      // guest_id that didn't resolve (wrong event, anonymized, bogus).
      let existing: { id: string; name: string; phone: string; rsvp_status: string } | null = null;
      let matchedByGuestId = false;
      if (guest_id) {
        const { data: byId } = await supabaseAdmin
          .from("event_invitees")
          .select("id, name, phone, rsvp_status")
          .eq("event_id", event.id)
          .eq("id", guest_id)
          .is("anonymized_at", null)
          .maybeSingle();
        if (byId) {
          existing = byId;
          matchedByGuestId = true;
        }
      }
      if (!existing) {
        const { data: byPhone } = await supabaseAdmin
          .from("event_invitees")
          .select("id, name, phone, rsvp_status")
          .eq("event_id", event.id)
          .eq("phone", cleanPhone)
          .maybeSingle();
        existing = byPhone || null;
      }

      // A guest reopening the same RSVP link (forwarded again, tapped twice,
      // page reloaded) and resubmitting the same answer shouldn't page the
      // host a second time with an identical "X is coming" notification —
      // only an actual change in their answer is new information worth
      // notifying about. A first-time RSVP always notifies.
      const statusChanged = !existing || existing.rsvp_status !== rsvp_status;

      // Only meaningful in the guest-id-anchored branch — on a phone-
      // fallback match the phone IS the match key, so it can't have
      // "changed" relative to itself, and a fuzzy name-similarity check
      // was deliberately rejected: it risks silently merging two different
      // people's rows, worse than an occasional duplicate.
      const normalizedName = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");
      const digitsOnly = (v: string) => v.replace(/\D/g, "");
      const infoChanged = !!(
        matchedByGuestId && existing &&
        (normalizedName(existing.name || "") !== normalizedName(cleanName) ||
          digitsOnly(existing.phone || "") !== digitsOnly(cleanPhone))
      );

      // event_invitees.rsvp_source/info_changed_at may not exist yet on this
      // database (printed migrations, not applied automatically). A real
      // guest submitting an RSVP is the single most critical write in this
      // whole app — retry without the new columns rather than 500 someone's
      // actual RSVP over a column that's still pending, same defensive
      // shape as every other migration-ahead-of-schema write this project
      // has shipped.
      let inviteeId: string | null = existing?.id ?? null;

      if (existing) {
        // phone: cleanPhone is safe to always include, not just in the
        // guest-id-anchored branch — on a phone-fallback match, cleanPhone
        // IS existing.phone by construction (that's how it matched), so
        // writing it back is a no-op there. This was a real, just-caught
        // bug: the original code never wrote phone on an UPDATE at all
        // (harmless before, since phone was always the match key so it
        // could never legitimately differ) — now that a guest-id-anchored
        // match allows a genuine phone change, omitting it here would mean
        // infoChanged gets detected and notified correctly but the actual
        // new phone number never lands in the database.
        const fullPatch = {
          name: cleanName, phone: cleanPhone, rsvp_status, plus_ones: accompanying, food_pref: cleanFoodPref,
          rsvp_source: "guest_self", ...travelFields,
          ...(infoChanged ? { info_changed_at: new Date().toISOString() } : {}),
        };
        let updateError = (await supabaseAdmin
          .from("event_invitees")
          .update(fullPatch)
          .eq("id", existing.id)).error;
        if (updateError) {
          updateError = (await supabaseAdmin
            .from("event_invitees")
            .update({ name: cleanName, phone: cleanPhone, rsvp_status, plus_ones: accompanying, food_pref: cleanFoodPref })
            .eq("id", existing.id)).error;
        }
        if (updateError) return json({ error: updateError.message }, 500);
      } else {
        const baseInsert = {
          event_id: event.id,
          owner_user_id: event.host_id,
          name: cleanName,
          phone: cleanPhone,
          rsvp_status,
          plus_ones: accompanying,
          food_pref: cleanFoodPref,
        };
        let insertResult = await supabaseAdmin
          .from("event_invitees")
          .insert({ ...baseInsert, rsvp_source: "guest_self", ...travelFields })
          .select("id")
          .single();
        if (insertResult.error) {
          insertResult = await supabaseAdmin.from("event_invitees").insert(baseInsert).select("id").single();
        }
        if (insertResult.error) return json({ error: insertResult.error.message }, 500);
        inviteeId = insertResult.data?.id ?? null;
      }

      if (statusChanged || infoChanged) {
        // A real answer (or a change to who this actually is) is the most
        // actionable thing a host can be told about — always log it in-app
        // (no push token needed to see it later), and push immediately if
        // the host has a token. Combined into one notification when both
        // fire at once, rather than double-pushing for a single submission.
        const rsvpLabel = rsvp_status === "yes" ? "is coming" : rsvp_status === "no" ? "can't make it" : "might come";
        let notifTitle: string;
        let notifBody: string;
        let notifType: string;
        if (statusChanged && infoChanged) {
          notifTitle = "New RSVP 📬";
          notifBody = `${cleanName} ${rsvpLabel} to "${event.name}"${accompanying > 0 ? ` (+${accompanying})` : ""}. They also updated their name/phone — was "${existing?.name}" / ${existing?.phone}, now "${cleanName}" / ${cleanPhone}.`;
          notifType = "rsvp_received";
        } else if (statusChanged) {
          notifTitle = "New RSVP 📬";
          notifBody = `${cleanName} ${rsvpLabel} to "${event.name}"${accompanying > 0 ? ` (+${accompanying})` : ""}.`;
          notifType = "rsvp_received";
        } else {
          notifTitle = "Guest details updated ✎";
          notifBody = `${cleanName} changed their name/phone for "${event.name}" — was "${existing?.name}" / ${existing?.phone}, now "${cleanName}" / ${cleanPhone}. Review in your guest list.`;
          notifType = "rsvp_info_changed";
        }

        await supabaseAdmin.from("notifications").insert({
          user_id: event.host_id,
          title: notifTitle,
          body: notifBody,
          data: { type: notifType, event_id: event.id, rsvp_status },
        });

        const { data: host } = await supabaseAdmin
          .from("users")
          .select("push_token, notifications_enabled")
          .eq("id", event.host_id)
          .maybeSingle();

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
              title: notifTitle,
              body: notifBody,
              data: { type: notifType, event_id: event.id },
            }),
          });
        }
      }

      return json({ ok: true, event_name: event.name, invitee_id: inviteeId });
    }

    if (action === "upload_guest_document") {
      // Guests are unauthenticated — this is the ONLY write path for
      // guest_documents, using the service-role client, same reasoning as
      // every other guest-side write in this project (no anon storage
      // write policy exists or should exist). guest_id must resolve within
      // THIS event and not be anonymized, same check get_event/submit_rsvp
      // both already apply.
      if (!guest_id) return json({ error: "guest_id required" }, 400);
      // A file is required to upload as 'self' (the whole point of that
      // call), but NOT for an accompanying entry — a guest can add someone
      // by name only now and come back to add their doc later (see
      // RSVPScreen.js's "Anyone traveling with you?" add-another pattern).
      const hasFile = !!(file_base64 && file_ext);
      if (target !== "accompanying" && !hasFile) {
        return json({ error: "file_base64 and file_ext required" }, 400);
      }

      const { data: invitee, error: invErr } = await supabaseAdmin
        .from("event_invitees")
        .select("id")
        .eq("event_id", event.id)
        .eq("id", guest_id)
        .is("anonymized_at", null)
        .maybeSingle();
      if (invErr) return json({ error: invErr.message }, 500);
      if (!invitee) return json({ error: "Guest not found for this invite." }, 404);

      let bytes: Uint8Array | null = null;
      let contentType = "application/octet-stream";
      let safeExt = "jpg";
      if (hasFile) {
        safeExt = String(file_ext).replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 8) || "jpg";
        const CONTENT_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", pdf: "application/pdf" };
        contentType = CONTENT_TYPES[safeExt] || "application/octet-stream";
        try {
          bytes = Uint8Array.from(atob(file_base64), (c) => c.charCodeAt(0));
        } catch {
          return json({ error: "file_base64 is not valid base64." }, 400);
        }
      }

      if (target === "accompanying") {
        const cleanAccName = String(accompanying_name || "").trim();
        let accId = accompanying_id || null;
        if (!accId) {
          if (!cleanAccName) return json({ error: "A name is required for an accompanying guest." }, 400);
          const { data: newAcc, error: accInsertErr } = await supabaseAdmin
            .from("guest_accompanying")
            .insert({ invitee_id: guest_id, name: cleanAccName })
            .select("id")
            .single();
          if (accInsertErr) return json({ error: accInsertErr.message }, 500);
          accId = newAcc.id;
        } else if (cleanAccName) {
          // Scoped to invitee_id so one guest's payload can never touch
          // another invitee's sub-record even if an id were guessed/replayed.
          const { error: accUpdateErr } = await supabaseAdmin
            .from("guest_accompanying")
            .update({ name: cleanAccName })
            .eq("id", accId)
            .eq("invitee_id", guest_id);
          if (accUpdateErr) return json({ error: accUpdateErr.message }, 500);
        }

        if (!hasFile || !bytes) return json({ ok: true, accompanying_id: accId });

        const path = `${event.id}/${guest_id}/${Date.now()}-acc-${accId}.${safeExt}`;
        const { error: uploadErr } = await supabaseAdmin.storage.from("guest_documents").upload(path, bytes, { contentType, upsert: true });
        if (uploadErr) return json({ error: uploadErr.message }, 500);

        const { error: docErr } = await supabaseAdmin
          .from("guest_accompanying")
          .update({ govt_id_doc_path: path })
          .eq("id", accId)
          .eq("invitee_id", guest_id);
        if (docErr) return json({ error: docErr.message }, 500);

        return json({ ok: true, accompanying_id: accId });
      }

      // target 'self' (default) — the guest's own government ID. hasFile is
      // guaranteed true here (checked above), so bytes is never null.
      const path = `${event.id}/${guest_id}/${Date.now()}-self.${safeExt}`;
      const { error: uploadErr } = await supabaseAdmin.storage.from("guest_documents").upload(path, bytes!, { contentType, upsert: true });
      if (uploadErr) return json({ error: uploadErr.message }, 500);

      const { error: docErr } = await supabaseAdmin
        .from("event_invitees")
        .update({ govt_id_doc_path: path })
        .eq("id", guest_id);
      if (docErr) return json({ error: docErr.message }, 500);

      return json({ ok: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
