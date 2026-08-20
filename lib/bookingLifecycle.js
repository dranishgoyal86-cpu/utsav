// Pure decision logic for the booking lifecycle's "completed" state —
// mutual confirmation (fast path) + time-based safety net + dispute freeze.
// Used by BookingsScreen.js (host side) and ProviderERP.js (provider side)
// so the two confirmation actions can't silently drift out of sync with
// each other, and by scripts/verifyBookingLifecycle.js so this can be
// tested without touching a real database.
//
// The safety-net cron job (supabase/functions/auto-complete-bookings)
// can't import this file — Deno edge functions are deployed standalone —
// so its SAFETY_NET_DAYS constant is a separate copy there. Keep the two
// in sync if this one changes.
export const SAFETY_NET_DAYS = 6;

// True once both sides have tapped "Confirm service delivered."
export function bothSidesConfirmed(booking) {
  return !!(booking.host_confirmed_at && booking.provider_confirmed_at);
}

// A booking under an open dispute can never auto-complete — neither via
// the mutual-confirmation fast path nor the safety-net cron. Only an
// admin resolving the dispute (utsav-admin's Disputes tab) can move it
// forward again, and that's a direct write, not a call through this gate.
export function isDisputeBlocking(booking) {
  return booking.dispute_status === 'raised';
}

// The fast path: called right after either side's confirm action writes
// its own timestamp. Fires (returns true) the moment BOTH timestamps are
// set and nothing is disputed.
export function canFastPathComplete(booking) {
  return bothSidesConfirmed(booking) && !isDisputeBlocking(booking);
}

// The safety net: what the daily cron looks for. Mirrors
// auto-complete-bookings/index.ts's exact cutoff computation (milliseconds
// back from "now", truncated to a plain YYYY-MM-DD string, then compared
// against event_date lexicographically — ISO date strings sort correctly
// that way) rather than parsing event_date into a Date and comparing
// timestamps, which mixes a date-only value with a time-of-day-sensitive
// one and gives a wrong answer right at the day boundary — this got caught
// by this file's own verify script once, so it's deliberate now, not an
// oversight.
export function isEligibleForSafetyNet(booking, now = new Date()) {
  if (booking.status !== 'confirmed') return false;
  if (isDisputeBlocking(booking)) return false;
  const cutoffDateStr = new Date(now.getTime() - SAFETY_NET_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];
  return booking.event_date < cutoffDateStr;
}
