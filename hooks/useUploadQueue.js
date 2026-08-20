import { useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { subscribe, drain, getStats, retryFailed } from '../lib/uploadQueue';

const EMPTY_STATS = { pending: 0, uploading: 0, done: 0, failed: 0, total: 0 };

// Subscribes to the upload queue and keeps drain() running at the right
// moments — on mount, whenever the app comes back to the foreground, and
// whenever connectivity returns after being offline. Never drains on a
// timer; only on real signals that something might now be uploadable.
export function useUploadQueue() {
  const [stats, setStats] = useState(EMPTY_STATS);
  const [entries, setEntries] = useState([]);
  const wasOffline = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribe(({ entries: nextEntries }) => {
      setEntries(nextEntries);
      const next = { pending: 0, uploading: 0, done: 0, failed: 0, total: nextEntries.length };
      for (const e of nextEntries) {
        if (e.status === 'pending') next.pending++;
        else if (e.status === 'done') next.done++;
        else if (e.status === 'failed') next.failed++;
        else next.uploading++; // uploading/uploaded/indexing all read as "in flight"
      }
      setStats(next);
    });

    getStats().then(setStats);
    drain();

    const appStateSub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') drain();
    });

    let pollHandle = setInterval(async () => {
      try {
        const net = await Network.getNetworkStateAsync();
        const isOnline = !!net.isConnected && net.isInternetReachable !== false;
        if (isOnline && wasOffline.current) drain();
        wasOffline.current = !isOnline;
      } catch (err) {
        console.log('useUploadQueue connectivity check error:', err.message);
      }
    }, 5000);

    return () => {
      unsubscribe();
      appStateSub.remove();
      clearInterval(pollHandle);
    };
  }, []);

  return { stats, entries, retryFailed };
}
