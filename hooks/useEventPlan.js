import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { resolveRequirements, computeProgress, INACTIVE_BOOKING_STATUSES } from '../lib/eventResolver';
import { estimateItem, allocateBudget, billableGuests, volumeMultiplier } from '../lib/priceEngine';
import { haversineMeters } from '../lib/haversine';
import { resolveMatchKey } from '../vendorTaxonomy';
import { resolveVenue } from '../lib/eventContext';
import { buildChecklistContext } from '../lib/checklistContext';

// vendor_categories/category_aliases/event_requirements change rarely —
// fetched once per app session and cached module-scope, same pattern as
// hooks/useCapabilities.js. Export refreshPlanRules() for the admin
// dashboard to call after editing them.
let cachedCategories = null;
let cachedAliases = null;
let cachedRequirements = null;
let inFlightStaticFetch = null;

async function fetchStaticData() {
  if (cachedCategories && cachedAliases && cachedRequirements) {
    return { categories: cachedCategories, aliases: cachedAliases, requirements: cachedRequirements };
  }
  if (inFlightStaticFetch) return inFlightStaticFetch;

  inFlightStaticFetch = Promise.all([
    supabase.from('vendor_categories').select('*'),
    supabase.from('category_aliases').select('*'),
    supabase.from('event_requirements').select('*'),
  ]).then(([catRes, aliasRes, reqRes]) => {
    inFlightStaticFetch = null;
    if (catRes.error) throw catRes.error;
    if (aliasRes.error) throw aliasRes.error;
    if (reqRes.error) throw reqRes.error;
    cachedCategories = catRes.data || [];
    cachedAliases = aliasRes.data || [];
    cachedRequirements = reqRes.data || [];
    return { categories: cachedCategories, aliases: cachedAliases, requirements: cachedRequirements };
  }).catch(err => {
    inFlightStaticFetch = null;
    throw err;
  });

  return inFlightStaticFetch;
}

export function refreshPlanRules() {
  cachedCategories = null;
  cachedAliases = null;
  cachedRequirements = null;
  inFlightStaticFetch = null;
}

// This app's whole city list (ProfileScreen.js's CITIES) is 8 major metros
// today — no real tier2 data exists yet — but vendor_categories carries
// tier2 columns for when that changes, so anything not in this list
// classifies as tier2 rather than silently defaulting everyone to metro
// pricing.
const METRO_CITIES = new Set(['Delhi', 'Mumbai', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad']);
function inferCityTier(city) {
  return city && METRO_CITIES.has(city) ? 'metro' : 'tier2';
}

function median(nums) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// A service with structured pricing (pricing_model + a matching rate
// column) gets a real computed price for THIS event's actual context,
// instead of its stored flat price_from/price_to. Mirrors
// priceEngine.js's own applyPricingModel() defaults exactly (hours ?? 6,
// durationDays ?? 1) rather than inventing new ones, and reuses
// billableGuests()/volumeMultiplier() for per_guest so a structured
// caterer discounts at volume the same way the static catering reference
// band already does. Travel surcharge only applies when the service set
// travel_surcharge_per_km AND both the provider's and the venue's real
// lat/lng are available — never fabricated from partial data (confirmed
// live: 27423 of 27461 real providers have lat/lng, so this is populated
// in practice, but still guarded for the rows that don't).
function structuredServicePrice(sv, context) {
  const { guestCount, venue } = context;
  let amount = null;
  if (sv.pricing_model === 'per_guest' && sv.price_per_guest != null) {
    const billable = billableGuests(guestCount, venue);
    amount = sv.price_per_guest * billable * volumeMultiplier(billable);
  } else if (sv.pricing_model === 'per_hour' && sv.price_per_hour != null) {
    amount = sv.price_per_hour * 6; // hours ?? 6, same default as priceEngine.js
  } else if (sv.pricing_model === 'per_day' && sv.price_per_day != null) {
    amount = sv.price_per_day * 1; // durationDays ?? 1, same default as priceEngine.js
  } else if (sv.pricing_model === 'flat' && sv.price_from != null) {
    amount = sv.price_from;
  }
  if (amount == null) return null;

  if (sv.travel_surcharge_per_km != null && sv.lat != null && sv.lng != null && venue?.lat != null && venue?.lng != null) {
    const distanceKm = haversineMeters({ lat: sv.lat, lng: sv.lng }, { lat: venue.lat, lng: venue.lng }) / 1000;
    const freeRadius = sv.travel_free_radius_km ?? 0;
    if (distanceKm > freeRadius) amount += (distanceKm - freeRadius) * sv.travel_surcharge_per_km;
  }
  return Math.round(amount);
}

// Real per-city and national medians across active services, qualified
// from services.category to its real "Parent > Subcategory" match key —
// this is the "serviceMedian" source estimateItem() prefers over the
// static reference band. Each service contributes either its structured,
// context-computed price (guest count/hours/travel applied for real) when
// it set one, or its stored flat price_from/price_to otherwise — same
// median/city/national banding either way, only how one data point gets
// produced differs.
function buildMedianMap(services, eventCity, context = {}) {
  const bySlug = {};
  for (const sv of services) {
    const slug = resolveMatchKey(sv.category);
    if (!slug) continue;
    const structured = sv.pricing_model ? structuredServicePrice(sv, context) : null;
    const low = structured ?? sv.price_from;
    const high = structured ?? (sv.price_to || sv.price_from);
    if (low == null) continue;
    if (!bySlug[slug]) bySlug[slug] = { cityLows: [], cityHighs: [], natLows: [], natHighs: [] };
    const entry = bySlug[slug];
    entry.natLows.push(low);
    entry.natHighs.push(high);
    if (eventCity && sv.city === eventCity) {
      entry.cityLows.push(low);
      entry.cityHighs.push(high);
    }
  }
  const result = {};
  for (const [slug, entry] of Object.entries(bySlug)) {
    const cityLow = median(entry.cityLows);
    const natLow = median(entry.natLows);
    result[slug] = {
      city: cityLow != null ? { low: cityLow, high: median(entry.cityHighs), count: entry.cityLows.length } : null,
      national: natLow != null ? { low: natLow, high: median(entry.natHighs), count: entry.natLows.length } : null,
    };
  }
  return result;
}

const EMPTY_RESOLVED = { P1: [], P2: [], P3: [], P4: [], P5: [] };
const EMPTY_PROGRESS = { p1Total: 0, p1Handled: 0, p2Total: 0, p2Handled: 0, percentComplete: 100 };
const EMPTY_ALLOCATION = { lines: [], contingency: 0, allocated: 0, remaining: 0, overBudget: false };

export function useEventPlan(eventId) {
  const [state, setState] = useState({
    resolved: EMPTY_RESOLVED, estimates: {}, progress: EMPTY_PROGRESS,
    allocation: EMPTY_ALLOCATION, event: null, venue: null, resolvedByFunction: [],
    itemHandledByName: {},
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!eventId) { setLoading(false); return; }
    try {
      setLoading(true);
      const { categories, requirements } = await fetchStaticData();

      const { data: event, error: eventError } = await supabase.from('events').select('*').eq('id', eventId).maybeSingle();
      if (eventError) throw eventError;
      if (!event) { setState(prev => ({ ...prev, event: null })); return; }

      let venue = null;
      if (event.venue_id) {
        const { data: venueRow } = await supabase.from('venues').select('*').eq('id', event.venue_id).maybeSingle();
        venue = venueRow || null;
      }

      // Routed through the shared resolver (lib/eventContext.js) so this
      // hook and every other event-context consumer agree on what "the
      // venue" means. resolveRequirements() below still reads the raw
      // provided_items/catering_policy field names, so they're passed
      // through as a shim rather than rewriting that already-verified
      // resolver — behavior is identical either way: a home or unset venue
      // already resolved to empty items / no catering restriction before
      // this change too.
      const resolvedVenue = resolveVenue(event, venue);
      const venueForResolver = { provided_items: resolvedVenue.providedItems, catering_policy: resolvedVenue.cateringPolicy };

      // event_invitees fetched here (not just for hasOutstationGuests) is
      // also reused below for the per-function resolution pass — one query,
      // not two.
      const { data: invitees } = await supabase.from('event_invitees').select('is_outstation').eq('event_id', eventId);

      // Real per-guest signal (from the outstation-travel feature) reused
      // here via the same shared context builder the event_todos rebuild
      // uses — not a second context source. OR'd with the legacy
      // events.has_outstation_guests checkbox (confirmed live: false on
      // every real event today, i.e. never the true signal in practice) so
      // this doesn't silently stop trusting it if anything else still
      // writes to it — the checkbox itself isn't removed from the UI here,
      // just no longer the ONLY thing this resolver believes.
      const checklistContext = buildChecklistContext(event, venue, invitees || [], null);
      const context = {
        ...checklistContext,
        subEventSlug: event.sub_type_slug,
        hasOutstationGuests: checklistContext.hasOutstationGuests || !!event.has_outstation_guests,
      };

      const resolved = resolveRequirements(requirements, context, venueForResolver);

      // ── Per-function extras (Step 4/6) ──────────────────────────────
      // Per-function resolution is real and tested (verifyPlanEngine.js),
      // but events.sub_type_slug (the old single-value source) is null on
      // every real event — dead in practice. This resolves once per real
      // event_functions row instead, via source_sub_event_id -> sub_events.
      // slug, mirroring the event_todos rebuild's approach exactly.
      //
      // Deliberately scoped down from "replace the whole P1-P5 ladder with
      // N per-function ladders": useEventPlan's estimates/progress/
      // allocation are all keyed by bare item_name across a single flat
      // resolved set — calling resolveRequirements() once per function and
      // flattening ALL of it (event-level rows included every time, since
      // the resolver always includes them regardless of subEventSlug) into
      // the same estimates/progress computation would silently double-count
      // every event-level item once per function and collide same-item_name
      // entries in the estimates map. Fixing that properly means threading
      // function-awareness through estimates/progress/allocation too — a
      // real, separate restructure, not attempted here (see the report).
      //
      // What IS safe and done here: for each function, diff its full
      // resolution against the baseline event-level-only `resolved` above,
      // and surface only the ITEMS THAT DIFFER (new item, or same item_name
      // with a different priority/contextual_label — a sub-event row
      // overriding the event-level one) as that function's "extras". These
      // never touch estimates/progress/allocation, which stay computed from
      // the baseline `resolved` exactly as before — purely a display-layer
      // addition.
      // fnResolved is kept per function now (not discarded after diffing to
      // extras) — Step 3/4 need the function's FULL resolved set (baseline +
      // its own overrides/additions) to compute that function's own
      // progress/budget, not just the display-only "extras" diff.
      let resolvedByFunction = [];
      const functionFullResolvedById = {};
      const { data: functionsRows } = await supabase
        .from('event_functions').select('id, name, source_sub_event_id, budget_total').eq('event_id', eventId);
      if ((functionsRows || []).length > 0) {
        const sourceSubEventIds = [...new Set(functionsRows.map(f => f.source_sub_event_id).filter(Boolean))];
        let subEventSlugById = {};
        if (sourceSubEventIds.length > 0) {
          const { data: subEventRows } = await supabase.from('sub_events').select('id, slug').in('id', sourceSubEventIds);
          (subEventRows || []).forEach(se => { subEventSlugById[se.id] = se.slug; });
        }

        const baselineByItemName = {};
        Object.values(resolved).flat().forEach(r => { baselineByItemName[r.item_name] = r; });

        resolvedByFunction = functionsRows
          .map(fn => {
            const slug = subEventSlugById[fn.source_sub_event_id];
            if (!slug) return null;
            const fnResolved = resolveRequirements(requirements, { ...context, subEventSlug: slug }, venueForResolver);
            functionFullResolvedById[fn.id] = fnResolved;
            const extras = [];
            Object.values(fnResolved).flat().forEach(r => {
              const base = baselineByItemName[r.item_name];
              if (!base || base.priority !== r.priority || base.contextual_label !== r.contextual_label) {
                extras.push(r);
              }
            });
            // sourceSubEventId carried through for the progress/booking
            // filter below — bookings.sub_event_id is a real, existing FK
            // straight to sub_events.id (confirmed live: dormant, 0 of 23
            // real bookings set it), NOT a new column and NOT this
            // function's own row id.
            return { functionId: fn.id, functionName: fn.name, sourceSubEventId: fn.source_sub_event_id, budgetTotal: fn.budget_total ?? null, items: extras };
          })
          .filter(Boolean);
      }

      // Bookings for this event: bookings has no event_id column — it links
      // to saved_plans.saved_plan_id, and saved_plans links to events.id.
      // Two hops, no joins (project convention), combined in JS.
      const { data: plans } = await supabase.from('saved_plans').select('id').eq('event_id', eventId);
      const planIds = (plans || []).map(p => p.id);
      let bookingsRaw = [];
      if (planIds.length > 0) {
        const { data: bookingsData } = await supabase
          .from('bookings').select('status, service_id, sub_event_id').in('saved_plan_id', planIds);
        bookingsRaw = bookingsData || [];
      }
      const bookingServiceIds = [...new Set(bookingsRaw.map(b => b.service_id).filter(Boolean))];
      let servicesById = {};
      if (bookingServiceIds.length > 0) {
        const { data: bookedServices } = await supabase.from('services').select('id, category').in('id', bookingServiceIds);
        (bookedServices || []).forEach(sv => { servicesById[sv.id] = sv; });
      }
      // bookings has no category_slug of its own — qualified here via
      // services.category. sub_event_id carried through unchanged (not
      // qualified to anything — matched directly against event_functions'
      // source_sub_event_id below, same raw uuid on both sides).
      const bookings = bookingsRaw.map(b => ({
        status: b.status,
        category_slug: resolveMatchKey(servicesById[b.service_id]?.category),
        sub_event_id: b.sub_event_id,
      }));

      const arrangedCategories = event.arranged_categories || [];

      // Whole-event baseline now scoped to sub_event_id IS NULL — every real
      // booking today has sub_event_id null (the selector didn't exist until
      // this task), so this is a no-op for all current real data; it's what
      // stops a FUTURE function-scoped booking from being silently
      // double-counted into both its own function's progress AND the
      // whole-event baseline once the selector is actually used.
      const baselineBookings = bookings.filter(b => b.sub_event_id == null);
      const progress = computeProgress(resolved, baselineBookings, arrangedCategories);

      // Per-function progress — computeProgress() itself needed NO changes
      // at all: it already just takes (resolved, bookings, arranged) with
      // no assumption about scope, so scoping is entirely the caller's job —
      // filter bookings by this function's sourceSubEventId, run the exact
      // same function again against that function's own full resolved set
      // (baseline + its overrides/additions, not just the display-only
      // extras diff).
      resolvedByFunction = resolvedByFunction.map(fn => {
        const fnBookings = bookings.filter(b => b.sub_event_id === fn.sourceSubEventId);
        const fnResolved = functionFullResolvedById[fn.functionId];
        const fnProgress = computeProgress(fnResolved, fnBookings, arrangedCategories);
        return { ...fn, progress: fnProgress };
      });

      // Real service medians — fetched fresh per plan load (live marketplace
      // data, not cached module-scope like the rarely-changing rule tables).
      // services has no city column of its own (confirmed against the live
      // schema) — city lives on the provider, so it's joined in JS below,
      // same two-separate-queries convention as everywhere else in this app.
      // price_from is no longer required — a provider who only set
      // structured pricing (pricing_model + a rate column, no flat range)
      // must still be included, or their listing silently drops out of
      // every price estimate.
      const { data: activeServices } = await supabase
        .from('services')
        .select('provider_id, category, price_from, price_to, pricing_model, price_per_guest, price_per_hour, price_per_day, travel_surcharge_per_km, travel_free_radius_km')
        .eq('is_active', true)
        .or('price_from.not.is.null,pricing_model.not.is.null');
      const medianProviderIds = [...new Set((activeServices || []).map(sv => sv.provider_id).filter(Boolean))];
      let medianProviderLocationById = {};
      if (medianProviderIds.length > 0) {
        const { data: medianProviders } = await supabase.from('providers').select('id, city, lat, lng').in('id', medianProviderIds);
        (medianProviders || []).forEach(p => { medianProviderLocationById[p.id] = p; });
      }
      const activeServicesWithCity = (activeServices || []).map(sv => {
        const loc = medianProviderLocationById[sv.provider_id];
        return { ...sv, city: loc?.city || null, lat: loc?.lat ?? null, lng: loc?.lng ?? null };
      });
      const medianByCategory = buildMedianMap(activeServicesWithCity, event.city, { guestCount: event.guest_count, venue: resolvedVenue });

      const categoriesBySlug = {};
      categories.forEach(c => { categoriesBySlug[c.slug] = c; });

      const allItems = [...resolved.P1, ...resolved.P2, ...resolved.P3, ...resolved.P4, ...resolved.P5];
      // Per-function EXTRA items (not already in allItems above) also need
      // an estimate, or their budget card would silently show every line as
      // unfunded (itemCost() in priceEngine.js treats a missing estimates
      // entry as cost 0, not "unknown" — worth being explicit that leaving
      // these out would look like a false "fully funded" instead of failing
      // loudly, which is exactly why this pass exists). Pricing itself
      // doesn't vary per function (city/guestCount/budget context is
      // event-level either way), so these share the same estimates map and
      // priceContext as the baseline — no per-function re-pricing.
      const extraItemsByName = {};
      resolvedByFunction.forEach(fn => fn.items.forEach(it => { extraItemsByName[it.item_name] = it; }));
      const allItemsIncludingExtras = [...allItems, ...Object.values(extraItemsByName)];

      const priceContext = {
        city: event.city, cityTier: inferCityTier(event.city),
        guestCount: event.guest_count, budgetTotal: event.budget_total, isVegOnly: !!event.is_veg_only,
      };
      const estimates = {};
      for (const item of allItemsIncludingExtras) {
        // vendor_categories.slug is still the old coarse slug (pricing
        // bands are legitimately coarser than the full subcategory
        // taxonomy) — legacy_category_slug preserves that value
        // specifically for this lookup; category_slug itself is the new
        // real matching key, used below for the service-median bucket.
        const category = categoriesBySlug[item.legacy_category_slug];
        const serviceMedian = medianByCategory[item.category_slug] || null;
        estimates[item.item_name] = estimateItem(item, category, priceContext, serviceMedian, venue);
      }

      // Per-item "is this booked/arranged" signal for presentation purposes
      // (PlanView.js's confirmed-state card styling) — the exact same
      // category-slug matching computeProgress() already does internally,
      // just exposed per item_name instead of only as an aggregate count.
      // Reuses the same `bookings`/`arrangedCategories` computeProgress()
      // reads above; computeProgress() itself is untouched.
      const bookedCategorySlugs = new Set(
        baselineBookings.filter(b => !INACTIVE_BOOKING_STATUSES.has(b.status)).map(b => b.category_slug).filter(Boolean)
      );
      const arrangedSet = new Set(arrangedCategories);
      const isItemHandled = slug => bookedCategorySlugs.has(slug) || arrangedSet.has(slug);
      const itemHandledByName = {};
      allItemsIncludingExtras.forEach(item => { itemHandledByName[item.item_name] = isItemHandled(item.category_slug); });

      const allocation = allocateBudget(resolved, estimates, event.budget_total);

      // Per-function budget — host-manually-set (Step 6), never auto-split
      // from the whole-event budget_total. A function with no budgetTotal
      // set gets allocation: null here, not a zero/empty allocateBudget()
      // shape — PlanView.js uses that null to decide whether to render a
      // budget card at all for that function (Step 5: "no budget card",
      // never an empty placeholder).
      resolvedByFunction = resolvedByFunction.map(fn => {
        if (fn.budgetTotal == null) return { ...fn, allocation: null };
        const fnResolved = functionFullResolvedById[fn.functionId];
        const fnAllocation = allocateBudget(fnResolved, estimates, fn.budgetTotal);
        return { ...fn, allocation: fnAllocation };
      });

      setState({ resolved, estimates, progress, allocation, event, venue, resolvedByFunction, itemHandledByName });
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load plan');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  return { ...state, loading, error, refresh: load };
}
