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
