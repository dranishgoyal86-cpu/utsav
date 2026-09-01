// Pure persistent-utility-navigation resolver. Derives which nav items
// appear entirely from active capabilities/content signals the caller
// passes in — never hardcoded per event type or archetype ("wedding-only
// navigation" is explicitly what the brief forbids). A local event with
// no travel/accommodation naturally gets a short bar (Invite, RSVP); a
// destination wedding with functions/travel/stay naturally gets the fuller
// one — same signal shape lib/inviteSceneResolver.js already uses, kept
// as a separate function because "what's in the persistent nav bar" and
// "what scenes exist on the page" are related but not identical questions
// (a scene can exist without a dedicated nav shortcut, e.g. Family/Story).
import { NAV_ITEM } from './inviteDesignArchetypes/types';

export function resolveUtilityNav({
  hasFunctions = false,
  travelActive = false,
  staysActive = false,
  rsvpActive = true,
  mapsActive = false,
  gatePassActive = false,
  giftsActive = false,
  wishingWallActive = false,
  galleryActive = false,
} = {}) {
  // Primary bar — capped to the items a destination wedding realistically
  // needs one tap away; everything else collects under NAV_ITEM.MORE
  // rather than crowding the bar.
  const primary = [NAV_ITEM.INVITE];
  if (hasFunctions) primary.push(NAV_ITEM.FUNCTIONS);
  if (travelActive) primary.push(NAV_ITEM.TRAVEL);
  if (staysActive) primary.push(NAV_ITEM.STAY);
  if (rsvpActive) primary.push(NAV_ITEM.RSVP);

  const more = [];
  if (mapsActive) more.push('maps');
  if (gatePassActive) more.push('gate-access');
  if (giftsActive) more.push('gifts');
  if (wishingWallActive) more.push('wishing-wall');
  if (galleryActive) more.push('gallery');

  const items = more.length > 0 ? [...primary, NAV_ITEM.MORE] : primary;
  return { items, primary, more };
}

// ─────────────────────────────────────────────────────────────────────────
// Design System Scaling Foundation wave — ADDITIVE. resolveUtilityNav()
// above is completely unchanged (still what
// screens/customer/InviteArchetypePilot.js calls, still what every
// existing test asserts against). This is the more generic derivation the
// brief actually asks for: nav items come from whatever scenes
// lib/inviteSceneResolver.js's resolveScenes() already resolved for THIS
// event (already event-type/archetype/content-aware), matched against
// lib/inviteDesignArchetypes/sceneRegistry.js's navigationLabel metadata —
// not a second hand-maintained boolean list. This is what makes a
// birthday naturally get "Invite / RSVP" (no Functions/Travel/Stay scenes
// ever resolve for it) and a conference naturally get "Invite / Agenda /
// Register / RSVP" (its own resolved scenes, once a conference schema
// wires programme/registration content) with zero per-event-slug
// hardcoding anywhere in this function.
// ─────────────────────────────────────────────────────────────────────────
import { getSceneDefinitionForImplementedId } from './inviteDesignArchetypes/sceneRegistry';
import { LIFECYCLE_MODE, LIFECYCLE_PRIORITY } from './inviteDesignArchetypes/types';

const PRIORITY_RANK = [LIFECYCLE_PRIORITY.NONE, LIFECYCLE_PRIORITY.LOW, LIFECYCLE_PRIORITY.MEDIUM, LIFECYCLE_PRIORITY.HIGH, LIFECYCLE_PRIORITY.VERY_HIGH];

export function resolveUtilityNavFromScenes(scenes = [], { maxPrimary = 5, mode = LIFECYCLE_MODE.INVITATION } = {}) {
  // Collect every candidate first, THEN rank by lifecyclePriority (in the
  // given mode — defaults to 'invitation', the guest's very first visit)
  // before capping to maxPrimary. Ranking, not scene-array order, decides
  // what makes the primary bar — a real bug this exact section caught in
  // its own tests: with a naive "first N scenes with a label" approach,
  // RSVP (lifecyclePriority: 'very-high' in invitation mode — the single
  // highest-priority item in the whole scene registry at this stage) could
  // get bumped into "More" just because Functions/Travel/Stay happened to
  // resolve first in the array, which is exactly backwards for a guest
  // landing on the invite for the first time.
  const candidates = [];
  for (const sceneId of scenes) {
    if (sceneId === 'opening' || sceneId === 'closing') continue; // represented by 'invite' itself, never their own nav item
    const def = getSceneDefinitionForImplementedId(sceneId);
    if (!def || !def.navigationLabel) continue; // a real, resolved scene with no declared nav shortcut — shown on the page, just not in the persistent bar
    candidates.push(def);
  }
  candidates.sort((a, b) => PRIORITY_RANK.indexOf(b.lifecyclePriority[mode]) - PRIORITY_RANK.indexOf(a.lifecyclePriority[mode]));

  const primary = [NAV_ITEM.INVITE];
  const more = [];
  for (const def of candidates) {
    // Item is the SCENE_ROLE id (e.g. 'functions', 'rsvp'), matching the
    // existing resolveUtilityNav()'s item shape — def.navigationLabel is
    // display-layer metadata a nav bar renderer looks up separately (same
    // "id vs. label" split UtilityNavBar.js's own LABELS dict already
    // uses), never returned as the item itself.
    if (primary.length < maxPrimary) primary.push(def.id);
    else more.push(def.id);
  }

  const items = more.length > 0 ? [...primary, NAV_ITEM.MORE] : primary;
  return { items, primary, more };
}
