import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

// Whether a tour has been completed lives in user_tour_progress (one row
// per user per tour_key, unique constraint). `checked` distinguishes "still
// finding out" from "confirmed not completed" — a caller that auto-triggers
// startTour() should wait for checked, or it'll fire on every mount before
// the real completion state is known, not just for genuinely new users.
export function useTour(tourKey) {
  const [isTourActive, setIsTourActive] = useState(false);
  const [checked, setChecked] = useState(false);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { if (!cancelled) setChecked(true); return; }
        const { data } = await supabase
          .from('user_tour_progress')
          .select('completed_at')
          .eq('user_id', session.user.id)
          .eq('tour_key', tourKey)
          .maybeSingle();
        if (!cancelled) {
          setAlreadyCompleted(!!data?.completed_at);
          setChecked(true);
        }
      } catch (err) {
        console.log('useTour check error:', err.message);
        // Fails safe toward NOT auto-showing an unwanted tour on a real
        // error (checked stays true, alreadyCompleted stays false would
        // actually show it — so instead treat an error as "can't confirm,
        // don't auto-show", while still letting forceRestart() work since
        // that's an explicit user action, not an auto-trigger guess).
        if (!cancelled) { setAlreadyCompleted(true); setChecked(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [tourKey]);

  // Respects completion — a no-op if this tour has already been finished or
  // skipped, so callers can call this unconditionally on mount without their
  // own "have they seen it" check.
  const startTour = useCallback(() => {
    setAlreadyCompleted(prevCompleted => {
      if (!prevCompleted) setIsTourActive(true);
      return prevCompleted;
    });
  }, []);

  // Bypasses the completed check entirely — the path a future "Replay
  // tutorial" Settings/Profile action calls.
  const forceRestart = useCallback(() => {
    setIsTourActive(true);
  }, []);

  const markComplete = useCallback(async () => {
    setIsTourActive(false);
    setAlreadyCompleted(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { error } = await supabase.from('user_tour_progress').upsert(
        { user_id: session.user.id, tour_key: tourKey, completed_at: new Date().toISOString() },
        { onConflict: 'user_id,tour_key' }
      );
      if (error) throw error;
    } catch (err) {
      console.log('useTour markComplete error:', err.message);
    }
  }, [tourKey]);

  return { isTourActive, checked, alreadyCompleted, startTour, forceRestart, markComplete };
}
