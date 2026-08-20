// Offline-first gate-pass check-in — mirrors lib/uploadQueue.js's local-
// first/drain-later shape, applied to scanning instead of uploading.
//
// lookupPass() and recordCheckIn() must NEVER touch the network. Venue
// entry is precisely where connectivity fails, and a scanner that needs the
// network at the gate is useless. syncPasses(eventId) populates the local
// cache ahead of time (call it while there's still signal — the pass list
// screen and the scanner's own mount both do this, best-effort); every scan
// after that reads and writes local-only, and recordCheckIn() queues the
// check-in for drainCheckIns() to sync once connectivity returns.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { supabase } from '../supabase';

const CHECKIN_QUEUE_KEY = 'utsav:checkinQueue';
const MAX_ATTEMPTS = 5;

function cacheKey(eventId) {
  return `utsav:passes:${eventId}`;
}

const passCacheByEvent = {}; // in-memory mirror, keyed by eventId, once loaded
let checkInQueue = null;
let draining = false;
const listeners = new Set();

function notify() {
  listeners.forEach(fn => {
    try { fn(); } catch (err) { console.log('passQueue listener error:', err.message); }
  });
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function loadPassCache(eventId) {
  if (passCacheByEvent[eventId]) return passCacheByEvent[eventId];
  try {
    const raw = await AsyncStorage.getItem(cacheKey(eventId));
    passCacheByEvent[eventId] = raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.log('loadPassCache error:', err.message);
    passCacheByEvent[eventId] = [];
  }
  return passCacheByEvent[eventId];
}

async function loadCheckInQueue() {
  if (checkInQueue) return checkInQueue;
  try {
    const raw = await AsyncStorage.getItem(CHECKIN_QUEUE_KEY);
    checkInQueue = raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.log('loadCheckInQueue error:', err.message);
    checkInQueue = [];
  }
  return checkInQueue;
}

// ── Sync: fetches the full pass list for an event and caches it locally.
// The only function here that's network-required — call it ahead of time,
// while there's still signal (pass list screen on mount, scanner on mount).
export async function syncPasses(eventId) {
  const { data: passes, error } = await supabase
    .from('guest_passes')
    .select('id, guest_id, pass_code, party_size, status, checked_in_at, arrived_count')
    .eq('event_id', eventId);
  if (error) throw error;

  // guest_passes has no guest name/phone of its own — event_invitees is a
  // separate table, joined here in JS (two-query convention).
  const guestIds = [...new Set((passes || []).map(p => p.guest_id).filter(Boolean))];
  let guestsById = {};
  if (guestIds.length > 0) {
    const { data: guests } = await supabase.from('event_invitees').select('id, name, phone').in('id', guestIds);
    (guests || []).forEach(g => { guestsById[g.id] = g; });
  }

  const cached = (passes || []).map(p => ({
    id: p.id,
    passCode: p.pass_code,
    guestId: p.guest_id,
    guestName: guestsById[p.guest_id]?.name || 'Guest',
    guestPhone: guestsById[p.guest_id]?.phone || null,
    partySize: p.party_size || 1,
    status: p.status,
    checkedInAt: p.checked_in_at,
    arrivedCount: p.arrived_count || 0,
  }));

  passCacheByEvent[eventId] = cached;
  await AsyncStorage.setItem(cacheKey(eventId), JSON.stringify(cached));
  notify();
  return cached;
}

// ── Lookup: local only, zero network calls ──
export async function lookupPass(eventId, passCode) {
  const list = await loadPassCache(eventId);
  const code = (passCode || '').trim().toUpperCase();
  if (!code) return null;
  return list.find(p => p.passCode === code) || null;
}

// ── Record a check-in: local only, zero network calls. Updates the local
// cache immediately (so the scanner shows the result instantly) and queues
// the check-in for drainCheckIns() to sync later. ──
export async function recordCheckIn(eventId, passCode, arrivedCount) {
  const list = await loadPassCache(eventId);
  const code = (passCode || '').trim().toUpperCase();
  const idx = list.findIndex(p => p.passCode === code);
  if (idx === -1) throw new Error('Pass not found — sync passes before scanning offline.');

  const nowIso = new Date().toISOString();
  // Earliest-arrival wins even locally: a second partial-party admission on
  // the same device shouldn't push the recorded arrival time forward.
  const checkedInAt = list[idx].checkedInAt || nowIso;
  const mergedArrivedCount = Math.max(list[idx].arrivedCount || 0, arrivedCount);

  const updated = { ...list[idx], status: 'checked_in', checkedInAt, arrivedCount: mergedArrivedCount };
  list[idx] = updated;
  passCacheByEvent[eventId] = list;
  await AsyncStorage.setItem(cacheKey(eventId), JSON.stringify(list));

  const queue = await loadCheckInQueue();
  queue.push({ eventId, passCode: code, arrivedCount: mergedArrivedCount, checkedInAt, synced: false, attempts: 0 });
  checkInQueue = queue;
  await AsyncStorage.setItem(CHECKIN_QUEUE_KEY, JSON.stringify(queue));

  notify();
  return updated;
}

// A pass checked in from two devices before either could sync converges
// here: earliest checked_in_at, highest arrived_count. Read-then-write
// (not a single atomic statement) — check-ins are infrequent enough at any
// one gate that this is a non-issue in practice, and the alternative is a
// Postgres function this project has no established pattern for yet.
async function syncOneCheckIn(entry) {
  const { data: current, error: fetchError } = await supabase
    .from('guest_passes')
    .select('checked_in_at, arrived_count, checked_in_by')
    .eq('event_id', entry.eventId)
    .eq('pass_code', entry.passCode)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!current) throw new Error('Pass not found on server');

  const mergedCheckedInAt = current.checked_in_at
    ? (new Date(entry.checkedInAt) < new Date(current.checked_in_at) ? entry.checkedInAt : current.checked_in_at)
    : entry.checkedInAt;
  const mergedArrivedCount = Math.max(current.arrived_count || 0, entry.arrivedCount);

  const { data: { session } } = await supabase.auth.getSession();

  const { error: updateError } = await supabase
    .from('guest_passes')
    .update({
      status: 'checked_in',
      checked_in_at: mergedCheckedInAt,
      arrived_count: mergedArrivedCount,
      checked_in_by: current.checked_in_by || session?.user?.id || null,
    })
    .eq('event_id', entry.eventId)
    .eq('pass_code', entry.passCode);
  if (updateError) throw updateError;
}

// ── Drain: syncs queued check-ins, oldest first, stops cleanly if offline.
// Reconnecting and calling this (screens do it on mount and on an
// AppState/Network-change listener) requires no user action. ──
export async function drainCheckIns() {
  if (draining) return;
  draining = true;
  try {
    const queue = await loadCheckInQueue();
    if (queue.length === 0) return;

    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected || net.isInternetReachable === false) return;

    for (const entry of queue) {
      if (entry.synced) continue;
      try {
        await syncOneCheckIn(entry);
        entry.synced = true;
      } catch (err) {
        entry.attempts = (entry.attempts || 0) + 1;
        console.log('drainCheckIns entry error:', err.message);
      }
    }

    checkInQueue = queue.filter(e => !e.synced && e.attempts < MAX_ATTEMPTS);
    await AsyncStorage.setItem(CHECKIN_QUEUE_KEY, JSON.stringify(checkInQueue));
    notify();
  } finally {
    draining = false;
  }
}

// eventId optional — omit for just the queue-wide pending-sync count (the
// offline indicator's need), pass it for this event's issued/checked-in
// counts too (the arrival progress bar's need).
export async function getStats(eventId) {
  const passes = eventId ? await loadPassCache(eventId) : [];
  const queue = await loadCheckInQueue();
  return {
    issued: passes.length,
    checkedIn: passes.filter(p => p.status === 'checked_in').length,
    pendingSync: queue.filter(e => !e.synced).length,
  };
}
