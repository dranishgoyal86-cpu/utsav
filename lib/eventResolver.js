// This module must stay free of React and Supabase imports so it remains
// fully unit-testable via a plain Node script (see scripts/verifyPlanEngine.js).
// No hardcoded event-type/venue-type conditionals belong here — every event
// type, requirement, and venue rule comes entirely from data the caller
// passes in (ultimately sourced from event_requirements/venues), this file
// only resolves and shapes that data.
//
// The prasad-caterer exception in resolveRequirements' in-house-catering
// step is deliberate: prasad-caterer is a distinct vendor_categories.slug
// from catering, so scoping the drop to exactly category_slug === 'catering'
// already leaves it untouched — a banquet kitchen bound to in-house catering
// cannot produce satvik prasad, so that requirement must always survive.

function snakeToCamel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// Exported so consumers that need the same "is this booking still live"
// check outside computeProgress() (e.g. PlanView.js's per-item confirmed
// styling) reuse this exact set instead of maintaining a second copy.
export const INACTIVE_BOOKING_STATUSES = new Set(['cancelled', 'payment_failed']);

// context: { eventTypeSlug, subEventSlug, guestCount, childAge, isDryEvent,
//   isVegOnly, hasChildren, hasOutstationGuests, hasForeignGuests, hasPets,
//   isOutdoor, season } — the shape lib/checklistContext.js's
// buildChecklistContext() already produces (plus subEventSlug, which is
// per-function/per-call, not something a single context object can carry —
// see hooks/useEventPlan.js's per-function resolution loop).
// venue: a venues row (or null) — { provided_items, catering_policy, ... }
export function resolveRequirements(requirements, context = {}, venue = null) {
  const {
    eventTypeSlug = null, subEventSlug = null, guestCount = null, childAge = null,
    isDryEvent = false, isVegOnly = false,
    hasChildren = false, hasOutstationGuests = false, hasForeignGuests = false, hasPets = false,
    isOutdoor = false, season = null,
  } = context;

  // is_outdoor was a real event_requirements condition_flag with no
  // matching key here — permanently unreachable (every row using it was
  // filtered out unconditionally, live inventory confirmed 1 such row).
  // isMonsoon/isSummer are new, added alongside two new season-relevant
  // seed rows (supabase/migrations/event_requirements_season.sql) — not a
  // full season taxonomy, just the two flags those two rows actually need;
  // more seasons can be added here the same way if/when real rows need them.
  const conditionContext = {
    hasChildren, hasOutstationGuests, hasForeignGuests, hasPets, isOutdoor,
    isMonsoon: season === 'monsoon', isSummer: season === 'summer',
  };
  const providedItems = new Set(venue?.provided_items || []);
  const inHouseCateringOnly = venue?.catering_policy === 'in_house_only';

  const filtered = (requirements || []).filter(r => {
    if (eventTypeSlug != null && r.event_type_slug !== eventTypeSlug) return false;

    const isEventLevel = r.sub_event_slug == null;
    if (!isEventLevel && r.sub_event_slug !== subEventSlug) return false;

    if (guestCount != null) {
      if (r.min_guest_count != null && guestCount < r.min_guest_count) return false;
      if (r.max_guest_count != null && guestCount > r.max_guest_count) return false;
    }
    if (childAge != null) {
      if (r.min_age != null && childAge < r.min_age) return false;
      if (r.max_age != null && childAge > r.max_age) return false;
    }

    if (r.condition_flag) {
      const key = snakeToCamel(r.condition_flag);
      if (!conditionContext[key]) return false;
    }

    if (r.suppressed_when_dry && isDryEvent) return false;
    if (r.suppressed_when_veg && isVegOnly) return false;

    if (venue) {
      if (providedItems.has(r.category_slug)) return false;
      if (inHouseCateringOnly && r.category_slug === 'catering') return false;
    }

    return true;
  });

  // Dedupe by item_name. When both an event-level row and a matching
  // sub-event row survive for the same item, the sub-event row wins
  // outright (not just its contextual_label) — it's the more specific,
  // contextually correct one.
  const byItemName = new Map();
  for (const r of filtered) {
    const existing = byItemName.get(r.item_name);
    if (!existing) { byItemName.set(r.item_name, r); continue; }
    const existingIsSubEvent = existing.sub_event_slug != null;
    const currentIsSubEvent = r.sub_event_slug != null;
    if (currentIsSubEvent && !existingIsSubEvent) byItemName.set(r.item_name, r);
  }

  const bySortOrder = (a, b) => (a.sort_order || 0) - (b.sort_order || 0);
  const bucket = { P1: [], P2: [], P3: [], P4: [], P5: [] };
  for (const r of byItemName.values()) {
    if (bucket[r.priority]) bucket[r.priority].push(r);
  }
  Object.values(bucket).forEach(list => list.sort(bySortOrder));
  return bucket;
}

// bookings rows must already carry a resolved category_slug (the caller
// joins bookings -> services -> vendor category slug before calling this —
// see lib/vendorCategoryBridge.js and hooks/useEventPlan.js — since this
// function stays Supabase-free and bookings has no category_slug column of
// its own). "Handled" uses the same broader not-cancelled/not-failed
// definition proven correct for this app's real booking lifecycle earlier
// this session (lib/eventRequirements.js) rather than a narrow "pending or
// confirmed" check — there is no literal 'pending' status in production
// data, it's 'payment_pending', and 'completed'/'reviewed' bookings are
// obviously handled too.
export function computeProgress(resolved, bookings, arrangedCategories = []) {
  const arrangedSet = new Set(arrangedCategories || []);
  const bookedCategorySlugs = new Set(
    (bookings || [])
      .filter(b => !INACTIVE_BOOKING_STATUSES.has(b.status))
      .map(b => b.category_slug)
      .filter(Boolean)
  );
  const isHandled = slug => bookedCategorySlugs.has(slug) || arrangedSet.has(slug);

  const p1 = resolved.P1 || [];
  const p2 = resolved.P2 || [];
  const p1Total = p1.length;
  const p1Handled = p1.filter(r => isHandled(r.category_slug)).length;
  const p2Total = p2.length;
  const p2Handled = p2.filter(r => isHandled(r.category_slug)).length;

  // Percent complete is P1 only — P2 through P5 never block completion.
  // No P1 items at all counts as fully complete (nothing required).
  const percentComplete = p1Total > 0 ? Math.round((p1Handled / p1Total) * 100) : 100;

  return { p1Total, p1Handled, p2Total, p2Handled, percentComplete };
}

export function resolveAlias(aliases, input) {
  if (!input) return null;
  const normalized = input.toLowerCase().trim();
  const match = (aliases || []).find(a => (a.alias || '').toLowerCase().trim() === normalized);
  return match ? match.category_slug : null;
}
