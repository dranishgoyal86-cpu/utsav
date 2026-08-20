import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export function useBlockedProvider(providerId) {
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedId, setBlockedId] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!providerId) return;
    checkIfBlocked();
  }, [providerId]);

  async function checkIfBlocked() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from('blocked_providers')
        .select('id')
        .eq('customer_id', session.user.id)
        .eq('provider_id', providerId)
        .single();
      if (data) {
        setIsBlocked(true);
        setBlockedId(data.id);
      }
    } catch {
      setIsBlocked(false);
    }
  }

  async function toggleBlock() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      if (isBlocked && blockedId) {
        await supabase
          .from('blocked_providers')
          .delete()
          .eq('id', blockedId);
        setIsBlocked(false);
        setBlockedId(null);
      } else {
        const { data } = await supabase
          .from('blocked_providers')
          .insert({
            customer_id: session.user.id,
            provider_id: providerId,
          })
          .select()
          .single();
        setIsBlocked(true);
        setBlockedId(data?.id);
      }
    } catch (err) {
      console.log('Toggle block error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  return { isBlocked, loading, toggleBlock };
}
