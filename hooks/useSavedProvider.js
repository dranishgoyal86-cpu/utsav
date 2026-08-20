import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export function useSavedProvider(providerId) {
  const [isSaved, setIsSaved] = useState(false);
  const [savedId, setSavedId] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!providerId) return;
    checkIfSaved();
  }, [providerId]);

  async function checkIfSaved() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from('saved_providers')
        .select('id')
        .eq('customer_id', session.user.id)
        .eq('provider_id', providerId)
        .single();
      if (data) {
        setIsSaved(true);
        setSavedId(data.id);
      }
    } catch {
      setIsSaved(false);
    }
  }

  async function toggleSave() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      if (isSaved && savedId) {
        await supabase
          .from('saved_providers')
          .delete()
          .eq('id', savedId);
        setIsSaved(false);
        setSavedId(null);
      } else {
        const { data } = await supabase
          .from('saved_providers')
          .insert({
            customer_id: session.user.id,
            provider_id: providerId,
          })
          .select()
          .single();
        setIsSaved(true);
        setSavedId(data?.id);
      }
    } catch (err) {
      console.log('Toggle save error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  return { isSaved, loading, toggleSave };
}