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
