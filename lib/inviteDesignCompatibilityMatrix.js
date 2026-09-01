// The Design Compatibility Matrix — answers "which archetypes can
// appropriately present this event type, content density and capability
// set" as data, never a UI if/else chain. Built on top of (not a
// replacement for) lib/inviteDesignCompatibility.js's existing boolean-
// shaped resolveDesignCompatibility() — that function still answers
// "is THIS ONE implemented archetype workable for THIS event" for the
// pilot's 3 archetypes exactly as before (unchanged, still used by
// screens/customer/InviteArchetypePilot.js). This file is the broader,
// 18-archetype, nuanced-level version that reads from
// lib/inviteDesignArchetypes/catalogue.js instead.
import { CATALOGUE, listCatalogueEntries, getCatalogueEntry, EVENT_STRONG_ARCHETYPES } from './inviteDesignArchetypes/catalogue';
import { ARCHETYPE_STATUS, COMPATIBILITY_LEVEL } from './inviteDesignArchetypes/types';
import { computeContentDensity, densityInRange } from './contentDensity';

// The one hard veto this resolver enforces before anything else: an
// archetype's solemnCompatible flag must AGREE with the event's own
// isNonFestive() verdict, in both directions — a celebratory event never
// resolves 'stillness' (solemnCompatible: true) above unsupported, and a
// non-festive event never resolves ANY of the 17 celebratory archetypes
// (solemnCompatible: false) above unsupported, no matter what its
// supportedEventSlugs/density say. This is the direct continuation of the
// funeral safeguard chain: lib/inviteSchemas' isNonFestive() ->
// lib/inviteDesignArchetypes' resolveMotionForEvent() (forces
// MOTION_PRESET.STILLNESS) -> this function (forces UNSUPPORTED for every
// celebratory archetype). "funeral-last-rites + royal-palace" cannot
// resolve above 'unsupported' here even if an archetypeId is supplied
// manually, because royal-palace's solemnCompatible is hardcoded false in
// the catalogue, not derived from the caller's input.
function solemnMismatch(entry, isNonFestive) {
  return !!entry.solemnCompatible !== !!isNonFestive;
}

export function resolveCompatibilityLevel({ eventTypeSlug, schema, values, densitySignals = {}, archetypeId, isNonFestive = false } = {}) {
  const entry = getCatalogueEntry(archetypeId);
  if (!entry) {
    return { level: COMPATIBILITY_LEVEL.UNSUPPORTED, reason: `Unknown archetype "${archetypeId}".`, computedDensity: null, densityCompatible: false, isStrongMatch: false };
  }

  if (solemnMismatch(entry, isNonFestive)) {
    return {
      level: COMPATIBILITY_LEVEL.UNSUPPORTED,
      reason: isNonFestive
        ? `"${entry.name}" is a celebratory archetype and cannot be used for a non-festive event.`
        : `"${entry.name}" is solemn-only and cannot be used for a celebratory event.`,
      computedDensity: null, densityCompatible: false, isStrongMatch: false,
    };
  }

  if (!entry.supportedEventSlugs.includes(eventTypeSlug)) {
    return {
      level: COMPATIBILITY_LEVEL.UNSUPPORTED,
      reason: `"${entry.name}" is not offered for event type "${eventTypeSlug}".`,
      computedDensity: null, densityCompatible: false, isStrongMatch: false,
    };
  }

  const computedDensity = computeContentDensity({ schema, values, ...densitySignals });
  const densityCompatible = densityInRange(computedDensity, entry.density.min, entry.density.max);
  const isStrongMatch = (EVENT_STRONG_ARCHETYPES[eventTypeSlug] || []).includes(archetypeId);

  let level = isStrongMatch ? COMPATIBILITY_LEVEL.STRONG : COMPATIBILITY_LEVEL.COMPATIBLE;
  let reason = null;
  if (!densityCompatible) {
    // Content is a poorer fit than a strong recommendation implies —
    // downgraded, never rejected outright and never mutated/dropped.
    if (level === COMPATIBILITY_LEVEL.STRONG) level = COMPATIBILITY_LEVEL.COMPATIBLE;
    reason = `Event content is "${computedDensity}", outside "${entry.name}"'s declared range ("${entry.density.min}" to "${entry.density.max}").`;
  }

  return { level, reason, computedDensity, densityCompatible, isStrongMatch };
}

// The full matrix for one event — every catalogue entry (implemented AND
// planned) with its resolved level, so a planning/dev tool can see the
// complete picture even though only 'implemented' entries are ever
// user-selectable (see getSelectableArchetypes below).
export function resolveMatrixForEvent({ eventTypeSlug, schema, values, densitySignals = {}, isNonFestive = false } = {}) {
  return listCatalogueEntries().map((entry) => ({
    archetypeId: entry.id,
    status: entry.status,
    ...resolveCompatibilityLevel({ eventTypeSlug, schema, values, densitySignals, archetypeId: entry.id, isNonFestive }),
  }));
}

// Production-selection-safe helper — the ONE function a real design
// picker UI should call. Never returns a 'planned' entry, and never
// returns anything at or below UNSUPPORTED (a UI has no reason to offer
// an archetype the resolver just vetoed). Test-covered explicitly:
// getSelectableArchetypes() must return [] for funeral-last-rites (no
// implemented solemn-compatible archetype exists yet).
export function getSelectableArchetypes({ eventTypeSlug, schema, values, densitySignals = {}, isNonFestive = false } = {}) {
  return resolveMatrixForEvent({ eventTypeSlug, schema, values, densitySignals, isNonFestive })
    .filter((r) => r.status === ARCHETYPE_STATUS.IMPLEMENTED && r.level !== COMPATIBILITY_LEVEL.UNSUPPORTED);
}

// Planning/dev-tooling-only helper — the deliberate escape hatch for
// internal roadmap views (e.g. "what SHOULD we build next for
// corporate-conference") that explicitly want to see 'planned' entries
// too. Never call this to populate a real host-facing picker.
export function getPlanningArchetypes({ eventTypeSlug, schema, values, densitySignals = {}, isNonFestive = false } = {}) {
  return resolveMatrixForEvent({ eventTypeSlug, schema, values, densitySignals, isNonFestive })
    .filter((r) => r.level !== COMPATIBILITY_LEVEL.UNSUPPORTED);
}
