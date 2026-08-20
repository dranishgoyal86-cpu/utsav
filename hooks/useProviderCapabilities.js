import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { resolveProviderCapabilities } from '../lib/capabilities';

let cachedRules = null;
let inFlightFetch = null;

async function fetchRules() {
  if (cachedRules) return cachedRules;
  if (inFlightFetch) return inFlightFetch;

  inFlightFetch = supabase
    .from('provider_capability_rules')
    .select('*')
    .then(({ data, error }) => {
      inFlightFetch = null;
      if (error) throw error;
      cachedRules = data || [];
      return cachedRules;
    })
    .catch(err => {
      inFlightFetch = null;
      throw err;
    });

  return inFlightFetch;
}

export function refreshProviderCapabilityRules() {
  cachedRules = null;
  inFlightFetch = null;
}

// providerContext: { category, servicePrice, isVerified, completedBookings }
export function useProviderCapabilities(providerContext) {
  const [resolved, setResolved] = useState({ enabled: [], byKey: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const contextKey = JSON.stringify(providerContext || {});

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const rules = await fetchRules();
        if (cancelled) return;
        setResolved(resolveProviderCapabilities(rules, providerContext));
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load provider capabilities');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey]);

  return { ...resolved, loading, error };
}
