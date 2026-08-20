import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

// Never deletes from input_history — clearing a field on the draft must
// leave the history intact, that's the whole point of this feature. Only
// insert (first use of a value) and update (use_count/last_used_at on a
// repeat) ever run here.
export function useInputHistory(fieldKey) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSuggestions = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setSuggestions([]); return; }
      const { data, error } = await supabase
        .from('input_history')
        .select('value')
        .eq('user_id', session.user.id)
        .eq('field_key', fieldKey)
        .order('use_count', { ascending: false })
        .order('last_used_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      setSuggestions((data || []).map(r => r.value));
    } catch (err) {
      console.log('useInputHistory fetch error:', err.message);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [fieldKey]);

  useEffect(() => { fetchSuggestions(); }, [fetchSuggestions]);

  async function record(value) {
    const trimmed = (value || '').trim();
    if (!trimmed) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: existing, error: findError } = await supabase
        .from('input_history')
        .select('id, use_count')
        .eq('user_id', session.user.id)
        .eq('field_key', fieldKey)
        .eq('value', trimmed)
        .maybeSingle();
      if (findError) throw findError;

      if (existing) {
        const { error } = await supabase
          .from('input_history')
          .update({ use_count: (existing.use_count || 0) + 1, last_used_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('input_history')
          .insert({ user_id: session.user.id, field_key: fieldKey, value: trimmed, use_count: 1, last_used_at: new Date().toISOString() });
        if (error) throw error;
      }
      await fetchSuggestions();
    } catch (err) {
      console.log('useInputHistory record error:', err.message);
    }
  }

  return { suggestions, loading, record };
}
