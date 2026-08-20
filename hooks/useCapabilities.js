import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { resolveCapabilities } from '../lib/capabilities';

// Module-scope cache: capability_rules rarely change and are shared by every
// screen that mounts this hook, so we fetch them once per app session
// instead of once per screen.
let cachedRules = null;
let inFlightFetch = null;

async function fetchRules() {
  if (cachedRules) return cachedRules;
  if (inFlightFetch) return inFlightFetch;

  inFlightFetch = supabase
    .from('capability_rules')
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

// Admin screens call this after editing capability_rules so every mounted
// hook picks up the change without an app restart.
export function refreshCapabilityRules() {
  cachedRules = null;
  inFlightFetch = null;
}

// Raw-rules variant for screens that need to resolveCapabilities() per item
// in a list (e.g. one entry-control icon per plan card) — React's rules of
// hooks forbid calling useCapabilities() inside a .map(), so those screens
// fetch the rule set once here and call the plain resolveCapabilities()
// function directly per item instead.
export function useCapabilityRules() {
  const [rules, setRules] = useState(cachedRules || []);
  const [loading, setLoading] = useState(!cachedRules);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchRules();
        if (!cancelled) setRules(r);
      } catch (err) {
        console.log('useCapabilityRules error:', err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { rules, loading };
}

// context: same shape resolveCapabilities expects (eventTypeSlug, venueType,
// guestCount, age, isDryEvent, isVegOnly, hasBudget, hasSubEvents, hasBooking,
// hasCompletedBooking).
export function useCapabilities(context) {
  const [resolved, setResolved] = useState({ visible: [], secondary: [], byKey: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const contextKey = JSON.stringify(context || {});

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const rules = await fetchRules();
        if (cancelled) return;
        setResolved(resolveCapabilities(rules, context));
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load capabilities');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey]);

  return { ...resolved, loading, error };
}
