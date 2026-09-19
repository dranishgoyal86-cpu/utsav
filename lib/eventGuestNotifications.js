import { supabase } from '../supabase';
import {
  notifyEventChanged, notifyEventCancelled,
  emailGuestOfEventChange, emailGuestOfEventCancellation,
} from '../notifications';

// Guest-visibility + event-change/cancellation notification wave (Sept
// 2026) — see claude/guest-visibility-and-event-change-notifications-plan.md
// for the full design. This is the one shared fan-out helper both PlanView.js
// (guest-facing edits: date/time/venue) and the cancellation action call,
// so the "who can we actually reach, and how" logic lives in exactly one
// place rather than being reimplemented at each call site.

// Fields that actually matter to a guest — a change to any of these is
// worth telling them about. Deliberately NOT every editable slot (e.g.
// budget_total/theme/guest_count are the host's own planning details, not
// something a guest showed up expecting).
export const GUEST_FACING_EVENT_FIELDS = ['event_date', 'event_time', 'venue', 'venue_type'];

const FIELD_LABELS = {
  event_date: 'the date',
  event_time: 'the time',
  venue: 'the venue',
  venue_type: 'the venue',
};

// Compares the event's previous values against a patch about to be (or
// just) written — returns a short, human list of what changed ("the date,
// the venue") or null if nothing guest-facing moved. Deliberately only
// looks at fields actually present in patch (a save that never touched
// venue/date/time returns null immediately, no DB read needed).
export function detectGuestFacingChange(oldEvent, patch) {
  if (!oldEvent) return null;
  const changed = [];
  for (const field of GUEST_FACING_EVENT_FIELDS) {
    if (!(field in patch)) continue;
    const oldVal = oldEvent[field];
    const newVal = patch[field];
    // Only a REAL change to a field that was already set counts — filling
    // in a blank field for the first time (still planning, nothing sent
    // yet to contradict) isn't a "change" a guest needs telling about.
    if (oldVal != null && oldVal !== '' && oldVal !== newVal && !changed.includes(FIELD_LABELS[field])) {
      changed.push(FIELD_LABELS[field]);
    }
  }
  return changed.length > 0 ? changed.join(' and ') : null;
}

// Fans a notification out to every real guest on this event, split three
// ways per the plan's decision #1: a linked Utsav account gets in-app +
// push (existing pipeline), an email-only guest gets a real SES email,
// and a phone-only guest with neither gets counted as unreachable so the
// host can be told plainly rather than the app silently doing nothing.
async function fanOutToGuests(event, { changeSummary, cancellationReason }) {
  const { data: invitees, error } = await supabase
    .from('event_invitees')
    .select('id, name, phone, email, user_id')
    .eq('event_id', event.id)
    .is('anonymized_at', null);
  if (error) throw error;

  let notifiedCount = 0;
  let emailedCount = 0;
  const unreachable = [];

  for (const inv of invitees || []) {
    if (inv.user_id) {
      notifiedCount++;
      if (cancellationReason !== undefined) {
        await notifyEventCancelled(inv.user_id, event.name, event.id, inv.id, cancellationReason).catch(err => console.log('notifyEventCancelled error:', err.message));
      } else {
        await notifyEventChanged(inv.user_id, event.name, event.id, inv.id, event.invite_code, changeSummary).catch(err => console.log('notifyEventChanged error:', err.message));
      }
    } else if (inv.email) {
      emailedCount++;
      if (cancellationReason !== undefined) {
        await emailGuestOfEventCancellation(inv.email, event.name, cancellationReason);
      } else {
        await emailGuestOfEventChange(inv.email, event.name, changeSummary);
      }
    } else {
      unreachable.push({ id: inv.id, name: inv.name, phone: inv.phone });
    }
  }

  return { notifiedCount, emailedCount, unreachable };
}

// Called after the host confirms the "notify guests?" prompt (PlanView.js) —
// the actual DB write already happened by this point; this is purely the
// fan-out.
export async function notifyGuestsOfEventChange(event, changeSummary) {
  return fanOutToGuests(event, { changeSummary });
}

// Sets the event's cancelled state, revokes every issued gate pass (so no
// one can check in to a cancelled event — plan decision #3), and fans the
// cancellation out to every guest with the host's typed reason.
export async function cancelEventAndNotifyGuests(event, reason) {
  const cancelledAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('events')
    .update({ is_cancelled: true, cancelled_at: cancelledAt, cancellation_reason: reason || null })
    .eq('id', event.id);
  if (updateError) throw updateError;

  // Best-effort — a guest_passes table that doesn't exist yet on some
  // installs (or an event with no passes issued) shouldn't block the
  // cancellation itself from completing.
  try {
    await supabase.from('guest_passes').update({ status: 'void' }).eq('event_id', event.id).eq('status', 'issued');
  } catch (err) {
    console.log('guest_passes revoke error (non-fatal):', err.message);
  }

  return fanOutToGuests(event, { cancellationReason: reason || '' });
}

// Deleting an event from the main Plans screen (PlanScreen.js's "Delete
// everything") is a separate action from the "Cancel this event" flow
// above — a host can delete without ever visiting the planning screen or
// typing a cancellation reason. Guests invited to a deleted event still
// deserve the same "this is cancelled" notice (Anish, Sept 18), so this
// reuses the identical fan-out with no reason text, rather than duplicating
// the three-way (push/email/unreachable) branch a second time. Must be
// called BEFORE the event row is actually deleted — event_invitees is read
// here, and deleteEventCascade()/the events row won't exist to query once
// the delete itself has run.
export async function notifyGuestsOfEventDeletion(event) {
  return fanOutToGuests(event, { cancellationReason: '' });
}
