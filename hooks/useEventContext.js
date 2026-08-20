import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { buildContext, dateChangeImpact } from '../lib/eventContext';
import { notifyEventDateChanged } from '../notifications';

// Shared in-memory cache keyed by eventId, with a listener set per entry —
// every screen mounted against the same eventId reads the same object and
// re-renders together on any update(), instead of each screen holding its
// own stale copy (the bug this whole layer exists to fix). Mirrors
// hooks/useEventPlan.js's module-scope caching, applied to live per-event
// rows instead of the rarely-changing rule tables.
const cache = new Map();

function getEntry(eventId) {
  if (!cache.has(eventId)) {
    cache.set(eventId, { event: null, venue: null, bookings: [], listeners: new Set() });
  }
  return cache.get(eventId);
}

function notifyListeners(eventId) {
  cache.get(eventId)?.listeners.forEach(fn => fn());
}

async function fetchAll(eventId) {
  const entry = getEntry(eventId);

  const { data: event, error: eventError } = await supabase.from('events').select('*').eq('id', eventId).single();
  if (eventError) throw eventError;
  entry.event = event;

  let venue = null;
  if (event.venue_id) {
    const { data: venueRow } = await supabase.from('venues').select('*').eq('id', event.venue_id).maybeSingle();
    venue = venueRow || null;
  }
  entry.venue = venue;

  // bookings has no event_id column — bridged via saved_plans.event_id,
  // same two-hop, no-joins pattern as hooks/useEventPlan.js.
  const { data: plans } = await supabase.from('saved_plans').select('id').eq('event_id', eventId);
  const planIds = (plans || []).map(p => p.id);
  let bookings = [];
  if (planIds.length > 0) {
    const { data: bookingsData } = await supabase
      .from('bookings')
      .select('id, provider_id, status, event_date')
      .in('saved_plan_id', planIds);
    bookings = bookingsData || [];
  }
  entry.bookings = bookings;

  notifyListeners(eventId);
  return entry;
}

// Sole write path for event rows — every field-level edit across the app
// (rename, venue pick, dietary toggle, date move) should go through this
// instead of a screen calling supabase.from('events').update() directly, so
// every change lands in event_change_log and every mounted screen refreshes
// together.
//
// Date changes: if the new date is set and any booking is 'confirmed' for
// this event, the write is held and { needsConfirmation: true, impact }
// comes back instead — the caller shows the impact (host-facing confirm
// dialog) and calls update() again with { force: true } to proceed. Forced
// date changes notify every affected (confirmed + payment_pending) vendor.
async function performUpdate(eventId, patch, options = {}) {
  const entry = cache.get(eventId);
  if (!entry?.event) throw new Error('Event not loaded');

  const finalPatch = { ...patch };
  // is_veg_only / is_dry_event are read directly by the price engine and
  // eventResolver.js's requirement filtering — dietary_profile is the new
  // source of truth, so any write to it keeps the booleans in lockstep.
  if (patch.dietary_profile) {
    finalPatch.is_veg_only = patch.dietary_profile.includes('veg_only');
    finalPatch.is_dry_event = patch.dietary_profile.includes('dry_event');
  }

  if (finalPatch.event_date && !options.force) {
    const impact = dateChangeImpact(entry.bookings, finalPatch.event_date);
    if (impact.blocking.length > 0) {
      return { needsConfirmation: true, impact };
    }
  }

  const oldEvent = entry.event;
  const { error } = await supabase.from('events').update(finalPatch).eq('id', eventId);
  if (error) throw error;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const rows = Object.keys(finalPatch).map(field => ({
      event_id: eventId,
      field,
      old_value: oldEvent[field] != null ? String(oldEvent[field]) : null,
      new_value: finalPatch[field] != null ? String(finalPatch[field]) : null,
      changed_by: session?.user?.id || null,
    }));
    if (rows.length > 0) await supabase.from('event_change_log').insert(rows);
  } catch (logErr) {
    console.log('event_change_log insert error:', logErr.message);
  }

  if (finalPatch.event_date && options.force) {
    const impact = dateChangeImpact(entry.bookings, finalPatch.event_date);
    for (const booking of impact.affected) {
      notifyEventDateChanged(
        booking.provider_id,
        oldEvent.working_title || oldEvent.name,
        oldEvent.event_date,
        finalPatch.event_date,
        booking.id
      ).catch(err => console.log('notifyEventDateChanged error:', err.message));
    }
  }

  await fetchAll(eventId);
  return { needsConfirmation: false };
}

export function useEventContext(eventId) {
  const [, forceRender] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!eventId) { setLoading(false); return; }
    try {
      setLoading(true);
      await fetchAll(eventId);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load event');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    const entry = getEntry(eventId);
    const listener = () => forceRender(n => n + 1);
    entry.listeners.add(listener);
    load();
    return () => { entry.listeners.delete(listener); };
  }, [eventId, load]);

  const update = useCallback((patch, options) => performUpdate(eventId, patch, options), [eventId]);

  const entry = eventId ? cache.get(eventId) : null;
  const context = entry?.event ? buildContext(entry.event, entry.venue, entry.bookings) : null;

  return {
    context,
    event: entry?.event || null,
    venue: entry?.venue || null,
    bookings: entry?.bookings || [],
    loading,
    error,
    update,
    refresh: load,
  };
}
