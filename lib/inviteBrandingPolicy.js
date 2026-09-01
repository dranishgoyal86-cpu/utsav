// Central configuration boundary for (a) the subtle Utsav attribution
// required on guest-facing invite surfaces, and (b) the FUTURE dedicated
// invite domain/routes. Nothing exported here changes any live link this
// wave except one: ToranInvites.js's sendInvite() now builds its share link
// via buildLegacyPersonalInviteUrl() below instead of an inline template
// string — byte-identical output
// (`https://theutsavapp.com/invite/{pass_code}`), verified against the
// original literal; this is a "one file to update later" refactor, not a
// behavior change, and is the one place this module is actually wired in
// this wave.
//
// The FUTURE_* exports are not called anywhere yet. When the domain
// migration to invite.theutsavapp.com actually happens, old
// theutsavapp.com/invite/{pass_code} links must keep resolving (the brief's
// explicit backward-compatibility requirement) — that's a redirect/routing
// concern on the future invite.theutsavapp.com deployment itself (a
// separate deployment this repo doesn't control, per the investigation
// report), not something a client-side URL builder can enforce by itself;
// flagged here so it isn't forgotten when that migration is actually
// planned.
export const CURRENT_INVITE_DOMAIN = 'theutsavapp.com';
export const CURRENT_PERSONAL_ROUTE_PREFIX = '/invite'; // + '/' + pass_code

export const FUTURE_INVITE_DOMAIN = 'invite.theutsavapp.com';
export const FUTURE_PERSONAL_ROUTE_PREFIX = '/i'; // + '/' + pass_code
export const FUTURE_EVENT_ROUTE_PREFIX = '/e'; // + '/' + event_share_code

// Today's real, live personal-invite link — same shape ToranInvites.js
// already builds inline, just centralized.
export function buildLegacyPersonalInviteUrl(passCode) {
  return `https://${CURRENT_INVITE_DOMAIN}${CURRENT_PERSONAL_ROUTE_PREFIX}/${passCode}`;
}

// Not called anywhere yet — the future personal-invite link shape, ready
// for whenever the domain migration is actually planned and executed.
export function buildFuturePersonalInviteUrl(passCode) {
  return `https://${FUTURE_INVITE_DOMAIN}${FUTURE_PERSONAL_ROUTE_PREFIX}/${passCode}`;
}

// Not called anywhere yet — the future generic (non-personal, per-event
// rather than per-guest) invite link shape.
export function buildFutureEventInviteUrl(eventShareCode) {
  return `https://${FUTURE_INVITE_DOMAIN}${FUTURE_EVENT_ROUTE_PREFIX}/${eventShareCode}`;
}

// Subtle attribution copy — reused wherever a guest-facing invite surface
// needs one. screens/RSVPScreen.js's own success-screen footer already
// hand-writes this exact pairing (SparkleIcon + "Utsav" + tagline + CTA,
// linking to config.js's PUBLIC_WEB_URL) — not touched this wave (out of
// scope: RSVPScreen.js is explicitly not being rewritten yet), but this is
// the one place a future consolidation pass would source that copy from
// instead of it staying hand-duplicated per screen.
export const BRAND_ATTRIBUTION = Object.freeze({
  name: 'Utsav',
  tagline: 'Make every Celebration AN UTSAV',
  ctaLabel: 'Plan your own event on Utsav →',
});

// Design-archetype wave — the ONE function that decides what attribution
// text a design-archetype rendering surface (StaticInviteCard,
// WebInvitePreview, and any future PDF renderer) must show. Deliberately
// the single point of control: an archetype/variant receives whatever
// this returns and paints it, but has no way to omit or override it — see
// lib/staticInviteLayout.js's STATIC_SLOT.ATTRIBUTION slot, which is
// always populated from this function, never left to the archetype to
// decide whether to fill.
//
// surface: 'web' | 'static' — the two lines the brief specifies
// ("Made with Utsav" for web, "Made with Utsav · theutsavapp.com" for the
// static card's small footer mark). isNonFestive swaps the verb to
// "Created with Utsav" (funeral/solemn — matches the brief's explicit
// example) without becoming a acquisition pitch.
export function resolveBrandAttribution({ isNonFestive = false, surface = 'web' } = {}) {
  const verb = isNonFestive ? 'Created' : 'Made';
  const webLine = `${verb} with ${BRAND_ATTRIBUTION.name}`;
  const staticLine = `${verb} with ${BRAND_ATTRIBUTION.name} · ${CURRENT_INVITE_DOMAIN}`;
  return {
    line: surface === 'static' ? staticLine : webLine,
    webLine,
    staticLine,
  };
}

// Acquisition behaviour — architected, not a full funnel this wave (per
// the brief's explicit "do not implement a full acquisition funnel yet").
// A single optional post-RSVP/footer CTA, centrally controlled here so no
// archetype can invent its own marketing copy or enable one where the
// policy says no. Funeral/last-rites (isNonFestive: true) always returns
// enabled: false — a memorial experience must never carry an acquisition
// pitch, non-negotiable at this layer, not left to a renderer's judgment.
export function resolveAcquisitionCta({ isNonFestive = false } = {}) {
  if (isNonFestive) return { enabled: false, label: null };
  return { enabled: true, label: 'Planning something special? Create it with Utsav' };
}
