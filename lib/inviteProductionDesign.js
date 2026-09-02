// Production Integration Wave — the single storage/compatibility contract
// for the real, host-facing invite design selection. Moved out of
// ToranInvites.js (where CELEBRATORY_DESIGNS/SOLEMN_DESIGNS/
// DESIGN_LABELS/DESIGN_SUGGESTIONS used to live as that screen's own
// local constants) so the mobile designer (ToranInvites.js) and the
// desktop designer (components/desktop/InviteDesignerDesktop.js) share
// exactly one definition of "what designs exist and which is suggested" —
// previously only the mobile screen owned this at all.
//
// Storage contract: event_invite_content.template_id (an existing text
// column, already `not null default 'toran'` — verified against the real
// production save path in ToranInvites.js's saveContent(), unchanged by
// this wave) now stores ONE of two shapes:
//   - a bare legacy design id: 'toran' | 'kalamkari' | 'ivory' | 'diya' |
//     'stillness' — EXACTLY the same 5 strings this column has always
//     held. Every existing saved invite keeps rendering through the
//     legacy ToranCoverCard/StillnessCard path, completely unchanged.
//   - a new composite string for an archetype-system selection:
//     'archetype:<archetypeId>:<variantId>', e.g.
//     'archetype:cultural-poster:live-poster'. archetypeId/variantId
//     never contain ':' (registry ids are kebab-case slugs, verified
//     against lib/inviteDesignArchetypes' own id conventions), so a
//     simple split is safe and unambiguous.
// No new column, no migration — a text column already accepts a longer
// string. parseProductionDesign()/buildArchetypeTemplateId() below are
// the ONLY two places that need to know this encoding; everything else
// (saveContent(), the `template_id` upsert, the initial load) treats
// `template_id` as an opaque string exactly as it always has.
import { getSelectableArchetypes } from './inviteDesignCompatibilityMatrix';
import { COMPATIBILITY_LEVEL, ARCHETYPE_STATUS } from './inviteDesignArchetypes/types';
import { getCatalogueEntry } from './inviteDesignArchetypes/catalogue';
import { getArchetype } from './inviteDesignArchetypes';

export const DESIGN_LABELS = { toran: 'Toran', kalamkari: 'Kalamkari', stillness: 'Stillness', ivory: 'Ivory', diya: 'Diya' };
// Wave 8 — Ivory joins Kalamkari as a second neutral, non-Hindu-coded
// option. Wave 10 — Diya joins the celebratory set too.
export const CELEBRATORY_DESIGNS = ['toran', 'kalamkari', 'ivory', 'diya'];
export const SOLEMN_DESIGNS = ['stillness'];
// Wave 7/10 — suggestion, not gating; deliberately no entry for any of
// the 6 wedding traditions or any non-wedding type nothing here leans
// toward (never silently defaults to a Hindu-coded design).
export const DESIGN_SUGGESTIONS = {
  'hindu-wedding': 'toran',
  'housewarming': 'diya',
  'religious-event': 'diya',
  'festival-fair': 'diya',
};

const ARCHETYPE_PREFIX = 'archetype:';

export function buildArchetypeTemplateId(archetypeId, variantId) {
  return `${ARCHETYPE_PREFIX}${archetypeId}:${variantId}`;
}

// Returns { kind: 'legacy', legacyDesignId } | { kind: 'archetype',
// archetypeId, variantId } | { kind: 'none' } — never throws, never
// returns a partially-parsed shape a caller could misuse.
export function parseProductionDesign(templateId) {
  if (!templateId) return { kind: 'none' };
  if (templateId.startsWith(ARCHETYPE_PREFIX)) {
    const rest = templateId.slice(ARCHETYPE_PREFIX.length);
    const sep = rest.indexOf(':');
    if (sep === -1) return { kind: 'none' };
    const archetypeId = rest.slice(0, sep);
    const variantId = rest.slice(sep + 1);
    if (!archetypeId || !variantId) return { kind: 'none' };
    return { kind: 'archetype', archetypeId, variantId };
  }
  return { kind: 'legacy', legacyDesignId: templateId };
}

// A parsed archetype selection is only ever "valid" (safe to render/keep)
// when it's still IMPLEMENTED and still a real catalogue entry — a
// selection saved while an archetype was implemented must never crash or
// silently render nothing if that archetype were ever un-published later
// (defensive; nothing in this codebase currently removes an implemented
// archetype, but the contract should hold regardless).
export function isValidArchetypeSelection(archetypeId, variantId) {
  const entry = getCatalogueEntry(archetypeId);
  if (!entry || entry.status !== ARCHETYPE_STATUS.IMPLEMENTED) return false;
  const archetype = getArchetype(archetypeId);
  return !!archetype && archetype.variantIds.includes(variantId);
}

// The one production-safe function a real design picker should call —
// mirrors screens/customer/InviteArchetypePilot.js's own
// getSelectableArchetypes() usage exactly (grouped Recommended/More
// Styles), but ALSO folds in the existing legacy design set, and
// enforces the funeral/solemn restriction the same way ToranInvites.js's
// existing SOLEMN_DESIGNS gate already does: a non-festive event is NEVER
// offered a single archetype-system option (no implemented archetype is
// solemnCompatible today; explicitly gated here too, belt-and-suspenders,
// rather than relying solely on that fact never changing silently).
export function getProductionDesignOptions({ eventTypeSlug, schema, values, densitySignals, isNonFestive }) {
  if (isNonFestive) {
    return { legacyDesigns: SOLEMN_DESIGNS, recommended: [], moreStyles: [] };
  }
  const selectable = getSelectableArchetypes({ eventTypeSlug, schema, values, densitySignals, isNonFestive });
  return {
    legacyDesigns: CELEBRATORY_DESIGNS,
    recommended: selectable.filter((r) => r.level === COMPATIBILITY_LEVEL.STRONG).map((r) => r.archetypeId),
    moreStyles: selectable.filter((r) => r.level !== COMPATIBILITY_LEVEL.STRONG).map((r) => r.archetypeId),
  };
}
