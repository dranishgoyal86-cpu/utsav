import { Platform, Alert } from 'react-native';
import { CLOUDINARY_CONFIG } from './config';
import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';


const FUNCTIONS_BASE_URL = 'https://puvhqusauipotmiicrrm.supabase.co/functions/v1';

// RN-Web renders nothing at all for Alert.alert() (no dialog, no DOM) — a
// raw Alert.alert() call on web is a silent no-op. Several screens had
// their own local copy of this same fix; centralized here so every screen
// uses the identical, already-verified behavior instead of re-deriving it.
export function showAlert(title, message) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

// Same gotcha, for confirm-then-destroy flows specifically — Alert.alert's
// Cancel/Confirm button array also renders nothing on web, so a delete
// button looked like it silently did nothing.
export function confirmDestructive(title, message, confirmLabel, onConfirm) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmLabel, style: 'destructive', onPress: onConfirm },
    ]);
  }
}

// Same shape as confirmDestructive, for actions that need a confirm but
// aren't permanent/destructive (undo a block, unblock a date, archive a
// thread) — skips the native 'destructive' (red) button style since nothing
// irreversible is happening.
export function confirmAction(title, message, confirmLabel, onConfirm) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmLabel, onPress: onConfirm },
    ]);
  }
}

// Deleting an event's linked data needs to clear the tables Postgres won't
// auto-cascade (ON DELETE NO ACTION: photos, event_guests, guest_list —
// mostly face-matching data) before the events row itself can go. Once those
// are clear, deleting `events` auto-cascades event_invite_designs (invites),
// event_invitees (guest list), and event_todos (checklist) on its own —
// those are ON DELETE CASCADE. albums.event_id is ON DELETE SET NULL, so the
// album survives, just unlinked (face-matching for it turns off, but its
// photos are untouched) — the one piece of an event's data hosts consistently
// want kept even when everything else about the event is deleted.
export async function deleteEventCascade(eventId) {
  const steps = await Promise.all([
    supabase.from('photos').delete().eq('event_id', eventId),
    supabase.from('event_guests').delete().eq('event_id', eventId),
    supabase.from('guest_list').delete().eq('event_id', eventId),
  ]);
  const firstStepError = steps.find(r => r.error)?.error;
  if (firstStepError) throw firstStepError;

  const { error } = await supabase.from('events').delete().eq('id', eventId);
  if (error) throw error;
}

// Normalizes a saved phone number into the digits-only, country-coded form
// wa.me links need — bare 10-digit numbers are assumed India (this app is
// India-only), anything already carrying a country code is left as-is.
export function toWhatsappNumber(rawPhone) {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits;
}

// Resolves how many actual people a single event_invitees row represents.
// Two entry shapes coexist (see supabase/migrations/household_entries.sql):
// the original implicit 'individual' (a named person + plus_ones extra
// people coming with them) and the additive 'household' type (no named
// primary — a host's headcount estimate for a family/group, e.g. "the
// Sharma family, approx 4"). Every call site that used to do
// `1 + (guest.plus_ones || 0)` should go through this instead, so the two
// entry types stay consistent as more places touch guest counts later.
export function resolveGuestPartySize(guest) {
  return guest.entry_type === 'household'
    ? (guest.household_size || 1)
    : 1 + (guest.plus_ones || 0);
}

// Host-owned + accepted-delegate events, merged — the exact same query
// GuestList.js's/EventTodo.js's own fetchMyEvents() already run (kept as
// their own local copies there, not retrofitted to call this — out of scope
// for the task that added this shared version; new callers like
// GlobalSearch.js should use this instead of a fourth copy-paste).
// event_delegates may not exist yet on this database — a failure there just
// means "no delegated events," not a blocked picker.
export async function fetchHostAndDelegateEvents(uid) {
  const { data, error } = await supabase
    .from('events').select('*').eq('host_id', uid).order('created_at', { ascending: false });
  if (error) { console.log('fetchHostAndDelegateEvents error:', error.message); return []; }
  let owned = data || [];

  try {
    const { data: delRows, error: delErr } = await supabase
      .from('event_delegates').select('event_id').eq('delegate_user_id', uid).eq('status', 'accepted');
    if (!delErr && delRows?.length) {
      const delegatedIds = delRows.map(d => d.event_id).filter(id => !owned.some(e => e.id === id));
      if (delegatedIds.length) {
        // events' own SELECT policy is open ("Anyone can view events by
        // invite code" — qual true), so this read needs no new policy.
        const { data: delegatedEvents, error: evErr } = await supabase.from('events').select('*').in('id', delegatedIds);
        if (!evErr && delegatedEvents) {
          owned = [...owned, ...delegatedEvents.map(e => ({ ...e, _delegateAccess: true }))];
        }
      }
    }
  } catch (delErr) {
    console.log('fetchHostAndDelegateEvents delegate lookup error:', delErr.message);
  }

  return owned;
}

// Links the CURRENT session's account to every event_invitees row that
// matches its phone number, across every event they've ever been invited
// to — not just the one they arrived from. Safe to call repeatedly/on every
// login (idempotent — only fills rows where user_id is still null, never
// overwrites an existing link).
//
// This has to go through link_guest_account_by_phone() (a SECURITY DEFINER
// RPC — see supabase/migrations/guest_account_link.sql), not a plain
// `.update()` here: event_invitees' only RLS policy is "Owner manages
// invitees" (auth.uid() = owner_user_id), i.e. the EVENT HOST — a guest
// linking their own unrelated account would silently match 0 rows under
// that policy, no error. The RPC reads auth.uid() itself server-side rather
// than trusting a passed-in id, same shape as this project's other
// SECURITY DEFINER functions.
//
// event_invitees.phone is stored exactly as typed wherever it was entered
// (submit-rsvp's edge function does zero normalization on the RSVP form
// input) — live data confirmed via `npx supabase db query --linked`
// includes at least one row already in "+91XXXXXXXXXX" form. The RPC
// mirrors toWhatsappNumber()'s own normalization and matches the three most
// common shapes; a guest whose invitee row has spaces/dashes typed into it
// won't match — normalizing at write time (submit-rsvp) would be the real
// fix for that, out of scope here.
export async function linkGuestAccountByPhone(rawPhone) {
  if (!rawPhone) return 0;
  const { data, error } = await supabase.rpc('link_guest_account_by_phone', { p_phone: rawPhone });
  if (error) { console.log('linkGuestAccountByPhone error:', error.message); return 0; }
  return data || 0;
}

// Real market data for a city: active providers (for the "recommended
// providers" list) plus their priced services (for real budget estimates —
// see planLogic.js's generateEventPlan). Two separate queries combined in
// JS per this project's no-joins rule. Was duplicated verbatim in three
// places (PlanScreen's AI-chat draft, EventPlanner's initial generate, and
// its guest-count-edit regenerate) before this — now they all share one
// fetch, and the services half is new.
export async function fetchMarketData(city) {
  const { data: providersData } = await supabase
    .from('providers').select('*').eq('city', city).eq('is_active', true);

  const userIds = (providersData || []).map(p => p.user_id);
  let providers = [];
  if (userIds.length > 0) {
    const { data: usersData } = await supabase.from('users').select('id, name').in('id', userIds);
    providers = (providersData || []).map(p => ({ ...p, users: usersData?.find(u => u.id === p.user_id) || null }));
  }

  const providerIds = (providersData || []).map(p => p.id);
  let services = [];
  if (providerIds.length > 0) {
    const { data: servicesData } = await supabase
      .from('services').select('*').in('provider_id', providerIds).eq('is_active', true).not('price_from', 'is', null);
    services = servicesData || [];
  }

  return { providers, services };
}

// Google Calendar's "quick add" URL needs no API key/OAuth — it just opens
// a pre-filled event for the user to review and save themselves.
export function googleCalendarUrl({ title, date, details, location }) {
  const d = new Date(date);
  const start = d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const endDate = new Date(d.getTime() + 4 * 60 * 60 * 1000); // default 4hr block
  const end = endDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const params = new URLSearchParams({
    action: 'TEMPLATE', text: title, dates: `${start}/${end}`,
    details: details || '', location: location || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export async function callEdgeFunction(functionName, payload) {
  const { data: { session } } = await supabase.auth.getSession();

  const response = await fetch(`${FUNCTIONS_BASE_URL}/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || ''}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `${functionName} failed`);
  }
  return data;
}

// Keeps an event's name, its linked album's name, and its saved plan's
// title all pointing at the same string — the three are otherwise
// independent rows with no FK-enforced consistency. Each .eq('event_id', ...)
// naturally no-ops if there's no matching album/plan row yet.
export async function renameEvent(eventId, newName) {
  const trimmed = (newName || '').trim();
  if (!eventId || !trimmed) return;
  await Promise.all([
    supabase.from('events').update({ name: trimmed }).eq('id', eventId),
    supabase.from('albums').update({ name: trimmed }).eq('event_id', eventId),
    supabase.from('saved_plans').update({ title: trimmed }).eq('event_id', eventId),
    // Invite designs carry their own independent `label` (set once, at save
    // time) rather than reading the event's name live like the checklist
    // header does — without this they silently go stale on rename.
    supabase.from('event_invite_designs').update({ label: trimmed }).eq('event_id', eventId),
  ]);
}

// resourceType: 'image' (default, every existing caller) or 'video' — same
// unsigned-preset upload, just a different Cloudinary endpoint.
export async function uploadToCloudinary(imageUri, resourceType = 'image') {
  try {
    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/${resourceType}/upload`;

    const result = await FileSystem.uploadAsync(url, imageUri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      parameters: {
        upload_preset: CLOUDINARY_CONFIG.uploadPreset,
        cloud_name: CLOUDINARY_CONFIG.cloudName,
      },
    });

    const data = JSON.parse(result.body);
    if (!data.secure_url) throw new Error(data.error?.message || 'Upload failed');
    return { url: data.secure_url, publicId: data.public_id };
  } catch (err) {
    console.log('Cloudinary upload error:', err.message);
    throw err;
  }
}

// Identity/financial documents (GST certificate, PAN, Udyam) go to a private
// Storage bucket, not Cloudinary — its RLS restricts reads to the owning
// provider + admins (see the provider_documents bucket policies), so unlike
// every other upload in this app there's no public URL to hand back. Stores
// the storage PATH instead; callers use getSignedDocumentUrl() to view it,
// same folder-per-user layout (`{user_id}/...`) the avatars bucket already uses.
export async function uploadProviderDocument(uri, userId, label) {
  const ext = (uri.split('.').pop() || 'jpg').split('?')[0];
  const path = `${userId}/${label}-${Date.now()}.${ext}`;
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const { error } = await supabase.storage
    .from('provider_documents')
    .upload(path, decode(base64), { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return path;
}

// Private-bucket paths need a fresh signed URL each time they're viewed —
// plain getPublicUrl() doesn't work against RLS-protected storage.
export async function getSignedDocumentUrl(path, expiresInSeconds = 3600) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from('provider_documents')
    .createSignedUrl(path, expiresInSeconds);
  if (error) { console.log('getSignedDocumentUrl error:', error.message); return null; }
  return data.signedUrl;
}

// Guest government-ID documents (RSVP outstation/accommodation flow) live
// in their own private bucket, not provider_documents — the two have
// different path shapes (guest_documents has no user_id available, guests
// are unauthenticated; see supabase/functions/submit-rsvp/index.ts's
// upload_guest_document action, the only writer) and different RLS (host-
// or-accepted-delegate on the event, not "owning provider"). A small
// dedicated near-duplicate of getSignedDocumentUrl rather than
// parameterizing that one — matches this project's existing preference
// for small dedicated helpers over a shared one with a bucket-name flag.
export async function getSignedGuestDocumentUrl(path, expiresInSeconds = 3600) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from('guest_documents')
    .createSignedUrl(path, expiresInSeconds);
  if (error) { console.log('getSignedGuestDocumentUrl error:', error.message); return null; }
  return data.signedUrl;
}

export async function createRekognitionCollection(collectionId) {
  try {
    await callEdgeFunction('create-collection', { collectionId });
    console.log('Collection created:', collectionId);
  } catch (err) {
    console.log('Create collection error:', err.message);
    throw err;
  }
}

export async function indexFaceInCollection(imageUrl, collectionId, photoId) {
  try {
    const { faceId } = await callEdgeFunction('index-face', {
      imageUrl, collectionId, photoId,
    });
    console.log('Face indexed:', faceId);
    return faceId;
  } catch (err) {
    console.log('Face indexing error:', err.message);
    return null;
  }
}

export async function searchFaceInCollection(selfieUrl, collectionId) {
  try {
    const { matchedIds } = await callEdgeFunction('search-face', {
      selfieUrl, collectionId,
    });
    console.log('Face matches found:', matchedIds?.length || 0);
    return matchedIds || [];
  } catch (err) {
    console.log('Face search error:', err.message);
    return [];
  }
}