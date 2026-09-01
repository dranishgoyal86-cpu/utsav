// Pure design-compatibility resolver — given an event_type_slug, its
// populated content (schema + values + the structural signals
// lib/contentDensity.js scores), and a candidate archetype, returns
// compatibility metadata. Never mutates or drops host content: when an
// event is richer than an archetype supports, the strategy is to route
// the excess into secondary scenes/pages (web) or additional PDF pages,
// never to delete it; when an event is sparser than an archetype expects,
// the strategy is a graceful fallback (fewer scenes/sections rendered),
// again never touching the underlying content.
import { getArchetype, listArchetypes } from './inviteDesignArchetypes';
import { computeContentDensity, densityIndex } from './contentDensity';

export function resolveDesignCompatibility({ eventTypeSlug, schema, values, densitySignals = {}, archetypeId } = {}) {
  const archetype = getArchetype(archetypeId);
  if (!archetype) {
    return {
      compatible: false, slugCompatible: false, densityCompatible: false,
      computedDensity: null, archetypeRange: null,
      reason: `Unknown archetype "${archetypeId}".`,
      overflowStrategy: 'none', underflowStrategy: 'none',
    };
  }

  const slugCompatible = archetype.eventSlugs.includes(eventTypeSlug);
  const computedDensity = computeContentDensity({ schema, values, ...densitySignals });
  const range = archetype.contentDensity;
  const idx = densityIndex(computedDensity);
  const minIdx = densityIndex(range.min);
  const maxIdx = densityIndex(range.max);
  const densityCompatible = idx >= minIdx && idx <= maxIdx;

  let overflowStrategy = 'none';
  let underflowStrategy = 'none';
  let reason = null;
  if (!slugCompatible) {
    reason = `Archetype "${archetypeId}" is not offered for event type "${eventTypeSlug}".`;
  } else if (idx > maxIdx) {
    // Richer than this archetype expects — nothing is deleted; the excess
    // content is routed to secondary scenes (web) / extra pages (PDF)
    // rather than being dropped or forced to overflow the primary layout.
    overflowStrategy = 'secondary-scenes';
    reason = `Event content is "${computedDensity}", above "${archetypeId}"'s supported max ("${range.max}") — excess content routes to secondary scenes/pages, nothing is discarded.`;
  } else if (idx < minIdx) {
    // Sparser than this archetype expects — render fewer
    // scenes/sections gracefully rather than showing empty ones; content
    // itself is untouched, there's just less of it to show.
    underflowStrategy = 'graceful-fallback';
    reason = `Event content is "${computedDensity}", below "${archetypeId}"'s supported min ("${range.min}") — renders with fewer scenes/sections rather than empty ones.`;
  }

  return {
    compatible: slugCompatible && densityCompatible,
    slugCompatible,
    densityCompatible,
    computedDensity,
    archetypeRange: range,
    reason,
    overflowStrategy,
    underflowStrategy,
  };
}

// Convenience: every archetype in the registry a given event could
// plausibly use, each with its own compatibility verdict — for a design
// picker UI to show "recommended" vs "available but a stretch" options,
// never to silently hide an archetype the host might still want.
export function resolveCompatibleArchetypes({ eventTypeSlug, schema, values, densitySignals = {} } = {}) {
  return listArchetypes().map((a) => resolveDesignCompatibility({
    eventTypeSlug, schema, values, densitySignals, archetypeId: a.id,
  }));
}
