// Offline-first upload queue for in-album camera capture.
//
// enqueue() must NEVER touch the network — it only copies a file into local
// storage and appends a queue entry. That is what guarantees a photo taken
// on a dead signal at a farmhouse in the middle of nowhere is never lost.
//
// The local copy of a captured file is deleted ONLY after the Supabase
// `photos` row insert has confirmed — never before. If the app is killed
// between the Cloudinary upload and the row insert, the next drain() resumes
// from the insert step (it already has cloudinaryUrl, so it doesn't
// re-upload) rather than starting over, and the client_ref unique index
// means even a full re-upload-and-reinsert attempt can never create a
// duplicate row.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Network from 'expo-network';
import { supabase } from '../supabase';
import { uploadToCloudinary, indexFaceInCollection } from '../helpers';

const PENDING_DIR = `${FileSystem.documentDirectory}utsav-pending/`;
const UPLOAD_QUEUE_KEY = 'utsav:uploadQueue';
const INDEX_QUEUE_KEY = 'utsav:indexQueue';
const MAX_ATTEMPTS = 5;
const BACKOFF_MS = [2000, 8000, 30000, 120000, 600000]; // 2s, 8s, 30s, 2min, 10min
const INDEX_BATCH_SIZE = 10;
const INDEX_BATCH_PAUSE_MS = 500;

let uploadQueue = null; // in-memory cache, mirrors AsyncStorage once loaded
let indexQueue = null;
let draining = false;
let indexDraining = false;
const listeners = new Set();

function notify() {
  const snapshot = { entries: uploadQueue ? [...uploadQueue] : [] };
  listeners.forEach(fn => {
    try { fn(snapshot); } catch (err) { console.log('uploadQueue listener error:', err.message); }
  });
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function ensurePendingDir() {
  const info = await FileSystem.getInfoAsync(PENDING_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(PENDING_DIR, { intermediates: true });
}

async function loadUploadQueue() {
  if (uploadQueue) return uploadQueue;
  try {
    const raw = await AsyncStorage.getItem(UPLOAD_QUEUE_KEY);
    uploadQueue = raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.log('loadUploadQueue error:', err.message);
    uploadQueue = [];
  }
  return uploadQueue;
}

async function saveUploadQueue() {
  await AsyncStorage.setItem(UPLOAD_QUEUE_KEY, JSON.stringify(uploadQueue));
  notify();
}

async function loadIndexQueue() {
  if (indexQueue) return indexQueue;
  try {
    const raw = await AsyncStorage.getItem(INDEX_QUEUE_KEY);
    indexQueue = raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.log('loadIndexQueue error:', err.message);
    indexQueue = [];
  }
  return indexQueue;
}

async function saveIndexQueue() {
  await AsyncStorage.setItem(INDEX_QUEUE_KEY, JSON.stringify(indexQueue));
}

// ── Enqueue: local-only, zero network calls ──
export async function enqueue({ eventId, localUri, uploaderId, uploaderName, source = 'camera' }) {
  await ensurePendingDir();
  await loadUploadQueue();

  const clientRef = generateUuid();
  const ext = (localUri.split('.').pop() || 'jpg').split('?')[0];
  const destUri = `${PENDING_DIR}${clientRef}.${ext}`;
  await FileSystem.copyAsync({ from: localUri, to: destUri });

  const entry = {
    clientRef,
    eventId,
    localUri: destUri,
    uploaderId: uploaderId || null,
    uploaderName: uploaderName || null,
    source,
    capturedAt: new Date().toISOString(),
    status: 'pending',
    attempts: 0,
    lastError: null,
    nextRetryAt: null,
    cloudinaryUrl: null,
    cloudinaryPublicId: null,
  };

  uploadQueue.push(entry);
  await saveUploadQueue();
  return entry;
}

function generateUuid() {
  // RFC4122-ish v4, good enough for a local dedup key — no crypto module
  // dependency needed for this.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function updateEntry(clientRef, patch) {
  const idx = uploadQueue.findIndex(e => e.clientRef === clientRef);
  if (idx === -1) return;
  uploadQueue[idx] = { ...uploadQueue[idx], ...patch };
}

// ── Drain: uploads pending entries, oldest first, stops cleanly if offline ──
export async function drain() {
  if (draining) return;
  draining = true;
  try {
    await loadUploadQueue();

    // An entry stuck in 'uploading' or 'indexing' means the app was killed
    // mid-operation last session — reset to 'pending' so it's picked back
    // up. If cloudinaryUrl is already set the upload step itself is skipped
    // below, so this doesn't re-upload work that already finished.
    let changed = false;
    for (const entry of uploadQueue) {
      if (entry.status === 'uploading' || entry.status === 'indexing') {
        entry.status = 'pending';
        changed = true;
      }
    }
    if (changed) await saveUploadQueue();

    for (const entry of [...uploadQueue].sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt))) {
      if (entry.status !== 'pending') continue;
      if (entry.nextRetryAt && new Date(entry.nextRetryAt).getTime() > Date.now()) continue;

      const net = await Network.getNetworkStateAsync();
      if (!net.isConnected || net.isInternetReachable === false) {
        // Offline — stop the whole drain here, nothing is marked failed.
        break;
      }

      await processEntry(entry);
    }
  } finally {
    draining = false;
  }
  // Uploads take priority — only touch the index queue once nothing is
  // left mid-flight in the upload queue.
  const stats = await getStats();
  if (stats.pending === 0 && stats.uploading === 0) {
    drainIndexQueue();
  }
}

async function processEntry(entry) {
  try {
    if (!entry.cloudinaryUrl) {
      updateEntry(entry.clientRef, { status: 'uploading' });
      await saveUploadQueue();

      const { url, publicId } = await uploadToCloudinary(entry.localUri);
      updateEntry(entry.clientRef, { cloudinaryUrl: url, cloudinaryPublicId: publicId, status: 'uploaded' });
      await saveUploadQueue();
    }

    const current = uploadQueue.find(e => e.clientRef === entry.clientRef);

    const { data: photo, error: insertError } = await supabase
      .from('photos')
      .insert({
        event_id: current.eventId,
        uploaded_by: current.uploaderId,
        uploaded_by_name: current.uploaderName,
        cloudinary_url: current.cloudinaryUrl,
        cloudinary_public_id: current.cloudinaryPublicId,
        source: current.source || 'camera',
        captured_at: current.capturedAt,
        client_ref: current.clientRef,
      })
      .select()
      .single();

    let photoId = photo?.id;

    if (insertError) {
      // Unique violation on (event_id, client_ref) means a previous attempt
      // already inserted this row — that's success, not failure.
      if (insertError.code === '23505') {
        const { data: existing } = await supabase
          .from('photos')
          .select('id')
          .eq('event_id', current.eventId)
          .eq('client_ref', current.clientRef)
          .maybeSingle();
        photoId = existing?.id;
      } else {
        throw insertError;
      }
    }

    updateEntry(entry.clientRef, { status: 'indexing' });
    await saveUploadQueue();

    if (photoId) {
      await enqueueIndexJob({ photoId, eventId: current.eventId, cloudinaryUrl: current.cloudinaryUrl });
      // total_photos used to be updated synchronously right after each
      // insert by the old inline gallery-upload code — now that inserts
      // happen asynchronously (possibly much later, offline), this is the
      // one place that's actually true right when a new row lands.
      const { count } = await supabase
        .from('photos').select('*', { count: 'exact', head: true }).eq('event_id', current.eventId);
      await supabase.from('events').update({ total_photos: count ?? 0 }).eq('id', current.eventId);
    }

    updateEntry(entry.clientRef, { status: 'done' });
    await saveUploadQueue();

    // Only after the row is confirmed does the local file go away.
    await FileSystem.deleteAsync(current.localUri, { idempotent: true });
  } catch (err) {
    const fresh = uploadQueue.find(e => e.clientRef === entry.clientRef);
    const attempts = (fresh?.attempts || 0) + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    updateEntry(entry.clientRef, {
      status: failed ? 'failed' : 'pending',
      attempts,
      lastError: err.message || String(err),
      nextRetryAt: failed ? null : new Date(Date.now() + BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)]).toISOString(),
    });
    await saveUploadQueue();
    console.log('uploadQueue processEntry error:', err.message);
  }
}

// ── Rekognition indexing — batched, best-effort, never blocks a photo ──
async function enqueueIndexJob({ photoId, eventId, cloudinaryUrl }) {
  await loadIndexQueue();
  indexQueue.push({ photoId, eventId, cloudinaryUrl, collectionId: null, attempts: 0 });
  await saveIndexQueue();
}

async function drainIndexQueue() {
  if (indexDraining) return;
  indexDraining = true;
  try {
    await loadIndexQueue();
    if (indexQueue.length === 0) return;

    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected || net.isInternetReachable === false) return;

    const eventCollectionCache = {};
    const batch = indexQueue.slice(0, INDEX_BATCH_SIZE);

    for (const job of batch) {
      try {
        if (!eventCollectionCache[job.eventId]) {
          const { data: eventRow } = await supabase
            .from('events').select('rekognition_collection_id').eq('id', job.eventId).maybeSingle();
          eventCollectionCache[job.eventId] = eventRow?.rekognition_collection_id || null;
        }
        const collectionId = eventCollectionCache[job.eventId];

        // No collection set up for this event (guest face-matching never
        // enabled) — there's nothing to index into. Not a failure, just
        // nothing to do; drop the job.
        if (!collectionId) {
          indexQueue = indexQueue.filter(j => j !== job);
          continue;
        }

        // indexFaceInCollection already swallows its own errors and returns
        // null on failure — a photo that fails to index is still a fully
        // valid photo, it just won't show up in face-match results.
        const faceId = await indexFaceInCollection(job.cloudinaryUrl, collectionId, job.photoId);
        if (faceId) {
          await supabase.from('photos').update({ rekognition_face_id: faceId }).eq('id', job.photoId);
        }
        indexQueue = indexQueue.filter(j => j !== job);
      } catch (err) {
        job.attempts = (job.attempts || 0) + 1;
        console.log('drainIndexQueue job error:', err.message);
        // Give up after enough attempts so a permanently-broken job can't
        // wedge the queue forever — the photo itself is unaffected either way.
        if (job.attempts >= MAX_ATTEMPTS) {
          indexQueue = indexQueue.filter(j => j !== job);
        }
      }
      await saveIndexQueue();
      if (batch.indexOf(job) < batch.length - 1) {
        await new Promise(r => setTimeout(r, INDEX_BATCH_PAUSE_MS));
      }
    }
  } finally {
    indexDraining = false;
  }
}

export async function getStats() {
  await loadUploadQueue();
  const stats = { pending: 0, uploading: 0, done: 0, failed: 0, total: uploadQueue.length };
  for (const e of uploadQueue) {
    if (e.status === 'pending' || e.status === 'uploading' || e.status === 'uploaded' || e.status === 'indexing') {
      // 'uploading' bucket in the UI covers every in-flight sub-state —
      // pending/uploading/uploaded/indexing all read as "still working" to
      // the host, only done/failed are terminal.
      if (e.status === 'pending') stats.pending++;
      else stats.uploading++;
    } else if (e.status === 'done') stats.done++;
    else if (e.status === 'failed') stats.failed++;
  }
  return stats;
}

export async function retryFailed() {
  await loadUploadQueue();
  let changed = false;
  for (const entry of uploadQueue) {
    if (entry.status === 'failed') {
      entry.status = 'pending';
      entry.attempts = 0;
      entry.lastError = null;
      entry.nextRetryAt = null;
      changed = true;
    }
  }
  if (changed) await saveUploadQueue();
  drain();
}

export async function removeEntry(clientRef) {
  await loadUploadQueue();
  const entry = uploadQueue.find(e => e.clientRef === clientRef);
  if (!entry) return;
  if (entry.localUri) {
    await FileSystem.deleteAsync(entry.localUri, { idempotent: true }).catch(() => {});
  }
  uploadQueue = uploadQueue.filter(e => e.clientRef !== clientRef);
  await saveUploadQueue();
}
