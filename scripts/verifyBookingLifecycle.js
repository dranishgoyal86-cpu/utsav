// Plain Node sanity check for the booking-lifecycle 'completed' state
// machine — run with:
//   node scripts/verifyBookingLifecycle.js
// Feeds hand-written fixture bookings through the real pure functions in
// lib/bookingLifecycle.js (the same functions BookingsScreen.js and
// ProviderERP.js's confirm actions actually call), covering: both-sides-
// confirm fires immediately, one-side-only + safety-net-window-passed
// auto-completes, a dispute blocks both paths, and a resolved dispute is
// no longer blocking (the shape admin's direct completion write in
// utsav-admin's DisputesTab relies on).

const babel = require('@babel/core');
const Module = require('module');
const path = require('path');

function loadEsmAsCjs(filePath) {
  const { code } = babel.transformFileSync(filePath, { presets: ['babel-preset-expo'] });
  const m = new Module(filePath);
  m.filename = filePath;
  m.paths = Module._nodeModulePaths(path.dirname(filePath));
  m._compile(code, filePath);
  return m.exports;
}

const { SAFETY_NET_DAYS, bothSidesConfirmed, isDisputeBlocking, canFastPathComplete, isEligibleForSafetyNet } =
  loadEsmAsCjs(path.resolve(__dirname, '..', 'lib', 'bookingLifecycle.js'));

let pass = 0;
let fail = 0;
function assert(label, condition) {
  if (condition) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`);
  }
}

// Mirrors lib/bookingLifecycle.js's own cutoff computation exactly (ms-based
// subtraction, then truncate to a date string) rather than Date#setDate,
// which operates in local time and can disagree with a UTC ms-based cutoff
// right at the day boundary depending on the machine's timezone.
function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

console.log('='.repeat(60));
console.log('booking lifecycle — mutual confirm + safety net + dispute');
console.log('='.repeat(60));

console.log(`\nSAFETY_NET_DAYS = ${SAFETY_NET_DAYS}`);

// ── 1. Fast path: both sides confirm ──
console.log('\n=== fast path (mutual confirmation) ===');
{
  const neitherConfirmed = { status: 'confirmed', event_date: daysAgo(1), dispute_status: null };
  assert('neither side confirmed — does not fast-path complete', !canFastPathComplete(neitherConfirmed));

  const onlyHost = { ...neitherConfirmed, host_confirmed_at: new Date().toISOString() };
  assert('only host confirmed — does not fast-path complete yet', !canFastPathComplete(onlyHost));
  assert('only host confirmed — bothSidesConfirmed is false', !bothSidesConfirmed(onlyHost));

  const bothConfirmed = { ...onlyHost, provider_confirmed_at: new Date().toISOString() };
  assert('both sides confirmed — bothSidesConfirmed is true', bothSidesConfirmed(bothConfirmed));
  assert('both sides confirmed, no dispute — fires immediately', canFastPathComplete(bothConfirmed));
}

// ── 2. Safety net: one side only, window passed ──
console.log('\n=== safety net (time-based, no confirmation needed) ===');
{
  const tooRecent = { status: 'confirmed', event_date: daysAgo(SAFETY_NET_DAYS - 1), dispute_status: null };
  assert(`event ${SAFETY_NET_DAYS - 1} days ago — NOT yet eligible for safety net`, !isEligibleForSafetyNet(tooRecent));

  const exactlyAtWindow = { status: 'confirmed', event_date: daysAgo(SAFETY_NET_DAYS), dispute_status: null };
  assert(`event exactly ${SAFETY_NET_DAYS} days ago — NOT yet eligible (must be older than cutoff)`, !isEligibleForSafetyNet(exactlyAtWindow));

  const pastWindow = { status: 'confirmed', event_date: daysAgo(SAFETY_NET_DAYS + 1), dispute_status: null };
  assert(`event ${SAFETY_NET_DAYS + 1} days ago, nobody confirmed, no dispute — eligible for safety net`, isEligibleForSafetyNet(pastWindow));

  const oneSideOnlyPastWindow = { ...pastWindow, host_confirmed_at: new Date().toISOString() };
  assert('one side confirmed but window passed — still eligible (safety net does not require confirmation)', isEligibleForSafetyNet(oneSideOnlyPastWindow));

  const wrongStatus = { ...pastWindow, status: 'pending' };
  assert("status !== 'confirmed' — never eligible for safety net", !isEligibleForSafetyNet(wrongStatus));
}

// ── 3. Dispute blocks both paths ──
console.log('\n=== dispute blocks completion ===');
{
  const disputedBothConfirmed = {
    status: 'confirmed', event_date: daysAgo(1), dispute_status: 'raised',
    host_confirmed_at: new Date().toISOString(), provider_confirmed_at: new Date().toISOString(),
  };
  assert('isDisputeBlocking is true once dispute_status is raised', isDisputeBlocking(disputedBothConfirmed));
  assert('both sides confirmed BUT disputed — fast path does NOT fire', !canFastPathComplete(disputedBothConfirmed));

  const disputedPastWindow = { status: 'confirmed', event_date: daysAgo(SAFETY_NET_DAYS + 30), dispute_status: 'raised' };
  assert('event long past + disputed — safety net does NOT fire', !isEligibleForSafetyNet(disputedPastWindow));
}

// ── 4. Resolved dispute is no longer blocking ──
console.log('\n=== resolved dispute unblocks completion ===');
{
  // Mirrors utsav-admin's DisputesTab.resolveDispute(): sets
  // dispute_status: 'resolved' and writes status directly (a direct admin
  // write, not gated by canFastPathComplete/isEligibleForSafetyNet at all —
  // this just confirms 'resolved' no longer reads as "blocking" if any
  // future code path DID check it, e.g. if the safety net window hadn't
  // passed yet and the cron picks it up later).
  const resolved = {
    status: 'confirmed', event_date: daysAgo(SAFETY_NET_DAYS + 1),
    dispute_status: 'resolved', host_confirmed_at: new Date().toISOString(),
  };
  assert("dispute_status: 'resolved' — isDisputeBlocking is false (only 'raised' blocks)", !isDisputeBlocking(resolved));
  assert('resolved dispute, event past window — safety net eligible again', isEligibleForSafetyNet(resolved));

  const resolvedBothConfirmed = { ...resolved, provider_confirmed_at: new Date().toISOString() };
  assert('resolved dispute, both sides confirmed — fast path fires again', canFastPathComplete(resolvedBothConfirmed));
}

console.log('\n' + '='.repeat(60));
console.log(`${pass} passed, ${fail} failed`);
console.log('='.repeat(60));
process.exit(fail > 0 ? 1 : 0);
