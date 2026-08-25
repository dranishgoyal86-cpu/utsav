// This module must stay free of React and Supabase imports so it remains
// fully unit-testable via a plain Node script (see scripts/verifyCapabilities.js).
// No hardcoded event-type/venue-type conditionals belong here — every rule
// comes entirely from data the caller passes in (ultimately sourced from the
// capability_rules / provider_capability_rules tables); this file only
// evaluates and shapes that data, it never branches on a specific slug.

// context: { eventTypeSlug, venueType, guestCount, age, isDryEvent, isVegOnly,
//            hasBudget, hasSubEvents, hasBooking, hasCompletedBooking, hasVenue }
export function resolveCapabilities(rules, context = {}) {
  const {
    eventTypeSlug = null,
    venueType = null,
    guestCount = null,
    age = null,
    isDryEvent = false,
    isVegOnly = false,
    hasBudget = false,
    hasSubEvents = false,
    hasBooking = false,
    hasCompletedBooking = false,
    hasVenue = false,
  } = context;

  const survivors = (rules || []).filter(r => {
    // visibility 'always' bypasses every filter below.
    if (r.visibility === 'always') return true;

    if (r.event_type_slugs != null && r.event_type_slugs.length > 0) {
      if (eventTypeSlug == null || !r.event_type_slugs.includes(eventTypeSlug)) return false;
    }
    if (r.excluded_event_type_slugs != null && r.excluded_event_type_slugs.length > 0) {
      if (eventTypeSlug != null && r.excluded_event_type_slugs.includes(eventTypeSlug)) return false;
    }
    if (r.venue_types != null && r.venue_types.length > 0) {
      if (venueType == null || !r.venue_types.includes(venueType)) return false;
    }

    if (guestCount != null) {
      if (r.min_guest_count != null && guestCount < r.min_guest_count) return false;
      if (r.max_guest_count != null && guestCount > r.max_guest_count) return false;
    }
    if (age != null) {
      if (r.min_age != null && age < r.min_age) return false;
      if (r.max_age != null && age > r.max_age) return false;
    }

    if (r.requires_budget && !hasBudget) return false;
    if (r.requires_sub_events && !hasSubEvents) return false;
    if (r.requires_booking && !hasBooking) return false;
    if (r.requires_completed_booking && !hasCompletedBooking) return false;
    if (r.requires_venue && !hasVenue) return false;

    if (r.suppressed_when_dry && isDryEvent) return false;
    if (r.suppressed_when_veg && isVegOnly) return false;

    return true;
  });

  // Group exclusion: within a group_key, only the highest-priority survivor
  // keeps its spot — the rest are dropped entirely (never resolved at all).
  const byGroup = new Map();
  const ungrouped = [];
  for (const r of survivors) {
    if (r.group_key == null) {
      ungrouped.push(r);
      continue;
    }
    const existing = byGroup.get(r.group_key);
    if (!existing || (r.priority || 0) > (existing.priority || 0)) {
      byGroup.set(r.group_key, r);
    }
  }

  const finalList = [...ungrouped, ...byGroup.values()];

  const visible = [];
  const secondary = [];
  const byKey = {};
  let entryControl = null;

  for (const r of finalList) {
    const label = (r.contextual_labels && eventTypeSlug && r.contextual_labels[eventTypeSlug])
      ? r.contextual_labels[eventTypeSlug]
      : r.name;
    const resolved = { ...r, label };
    byKey[r.capability_key] = resolved;
    if (r.visibility === 'secondary') {
      secondary.push(resolved);
    } else {
      visible.push(resolved);
    }
    // group_key 'entry_control' resolves to at most one surviving rule (the
    // group-exclusion pass above already guarantees that) — surfaced
    // separately since every gate-pass screen branches on it directly.
    if (r.group_key === 'entry_control') entryControl = resolved;
  }

  return { visible, secondary, byKey, entryControl };
}

export function isEnabled(resolved, capabilityKey) {
  return Boolean(resolved && resolved.byKey && resolved.byKey[capabilityKey]);
}

// Six-character pass codes, excluding I/O/0/1 — a guard reading a code
// aloud over the phone must never have to disambiguate a letter from a
// digit. Retries on collision against existingCodes (event-scoped, passed
// in by the caller — this module makes no Supabase calls of its own).
const PASS_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generatePassCode(existingCodes = []) {
  const existing = new Set(existingCodes);
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += PASS_CODE_ALPHABET[Math.floor(Math.random() * PASS_CODE_ALPHABET.length)];
    }
  } while (existing.has(code));
  return code;
}

// guest_passes.pass_code is globally unique (see supabase/migrations/
// event_invitee_function_rsvps.sql) — it's the actual invite credential as
// of Wave 1, not just a per-event gate-check-in code. generatePassCode()
// above only avoids collisions against the codes it's told about (cheap,
// usually the current event's own codes), so a genuine cross-event
// collision is still possible in principle; this wraps the actual insert
// and regenerates+retries the whole batch on that specific DB-level
// rejection, rather than requiring every caller to query every other
// event's codes up front.
export async function insertGuestPassesWithRetry(supabase, baseRows, existingCodes = [], maxAttempts = 5) {
  let attempt = 0;
  let codes = [...existingCodes];
  while (attempt < maxAttempts) {
    const rows = baseRows.map((r) => {
      const code = generatePassCode(codes);
      codes = [...codes, code];
      return { ...r, pass_code: code };
    });
    const { error } = await supabase.from('guest_passes').insert(rows);
    if (!error) return { rows, error: null };
    const isPassCodeCollision = error.code === '23505' && /guest_passes_pass_code_unique/i.test(error.message || '');
    if (!isPassCodeCollision) return { rows: null, error };
    attempt++;
  }
  return { rows: null, error: new Error('Could not generate unique pass codes after multiple attempts.') };
}

// providerContext: { category, servicePrice, isVerified, completedBookings }
export function resolveProviderCapabilities(rules, providerContext = {}) {
  const {
    category = null,
    servicePrice = null,
    isVerified = false,
    completedBookings = 0,
  } = providerContext;

  const enabled = [];
  const byKey = {};

  for (const r of (rules || [])) {
    if (r.categories != null && r.categories.length > 0) {
      if (category == null || !r.categories.includes(category)) continue;
    }
    if (r.min_service_price != null) {
      if (servicePrice == null || servicePrice < r.min_service_price) continue;
    }
    if (r.requires_verified && !isVerified) continue;
    if (r.min_completed_bookings != null && completedBookings < r.min_completed_bookings) continue;

    enabled.push(r);
    byKey[r.capability_key] = r;
  }

  return { enabled, byKey };
}
