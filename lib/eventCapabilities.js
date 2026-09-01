// Deliberately thin: this file adds ZERO new resolution logic on top of
// lib/capabilities.js's existing resolveCapabilities()/isEnabled() — those
// are re-exported as-is. What this file actually adds is a documented map
// from the invite-architecture brief's "operational module" concepts
// (per-function RSVP, maps, travel, accommodation, transport, gate pass,
// gifts, Wishing Wall, gallery, countdown, dress codes) to the real
// capability_rules capability_key(s) that already govern them — reusing the
// existing table/resolver per the brief's explicit instruction, rather than
// building a second, conflicting capability engine.
//
// Verified live against the real capability_rules table before writing this
// (2026-09-01, 26 rows — the original capabilities.sql seed plus the
// already-applied Wave 7 tradition-slug expansion, no other drift; 34 after
// this wave's migration adds its 8 new rows, confirmed live post-apply).
// Of the
// 11 concepts the brief names, 3 already have an exact existing key
// (gallery -> photo_album, gifts -> the 4 existing gift_*/reciprocity_ledger
// keys, entry control already exists as a whole group) and 8 have no
// existing key at all — those 8 are seeded by
// supabase/migrations/invite_schema_foundation.sql, using the identical
// `insert ... on conflict (capability_key) do nothing` idempotent pattern
// capabilities.sql itself already uses.
import { resolveCapabilities, isEnabled } from './capabilities';

export { resolveCapabilities, isEnabled };

// moduleKey -> capability_key, or an array of capability_keys for a concept
// that's really a composite of several existing rows (gifts). 'gatePass' is
// special-cased below instead of listed as a plain key, because entry
// control resolves to at most one winner via capability_rules' existing
// group_key mechanism (see lib/capabilities.js's resolveCapabilities —
// resolved.entryControl), not a single fixed capability_key.
export const INVITE_CAPABILITY_MAP = Object.freeze({
  perFunctionRsvp: 'per_function_rsvp', // new — see migration; gated on requires_sub_events, reusing the existing context flag sub_event_timeline already uses
  maps: 'maps', // new — visibility 'always', no event_type_slugs restriction (a location is relevant to every event type)
  travelCoordination: 'travel_coordination', // new
  accommodation: 'accommodation_coordination', // new
  transportPickup: 'transport_pickup', // new
  wishingWall: 'wishing_wall', // new — see note below on why this is available (not excluded) for funeral-last-rites
  countdown: 'countdown', // new — availability only; non-festive SUPPRESSION is enforced separately via lib/inviteSchemas's isNonFestive(), not via event_type_slugs exclusion on this row (see that file's header comment on why festive-gating logic should live in one place)
  dressCode: 'dress_code', // new — deliberately not excluded for funeral-last-rites: dress expectations (e.g. wear white/muted colors) are especially relevant for a funeral, not less
  gallery: 'photo_album', // existing, alias only
  gifts: ['gift_register', 'gift_qr_stickers', 'return_gifts', 'reciprocity_ledger'], // existing, composite — all 4 already exclude funeral-last-rites by omission (verified live), so "no gift functionality for funeral" is already correctly enforced today with zero new code
  gatePass: null, // special-cased in isModuleEnabled() below — see comment above
});

// Answers "is this operational module available" for the composite/group
// concepts INVITE_CAPABILITY_MAP's plain byKey lookup can't answer with one
// key. For every other module, isEnabled(resolved, INVITE_CAPABILITY_MAP[x])
// already works directly — this helper exists only for the two exceptions.
export function isModuleEnabled(resolved, moduleKey) {
  if (moduleKey === 'gatePass') {
    return !!resolved?.entryControl && resolved.entryControl.capability_key !== 'no_entry_control';
  }
  const mapped = INVITE_CAPABILITY_MAP[moduleKey];
  if (!mapped) return false;
  if (Array.isArray(mapped)) return mapped.some((k) => isEnabled(resolved, k));
  return isEnabled(resolved, mapped);
}
