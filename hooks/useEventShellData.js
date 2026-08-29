import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

// Shared fetch for DesktopEventShell's three real-data props (event/
// guestCount/currentUserName) -- every Batch B screen that wraps itself in
// the shell needs the same three queries; centralized here instead of
// copy-pasted six times (Wave 12/13's own screens each did this inline
// since there were only five of them -- with a sixth-plus screen this
// starts being real duplication risk, not just a style preference).
export function useEventShellData(eventId) {
  const [event, setEvent] = useState(null);
  const [guestCount, setGuestCount] = useState(0);
  const [currentUserName, setCurrentUserName] = useState('');

  useEffect(() => {
    if (!eventId) return;
    supabase.from('events').select('id, name, event_date').eq('id', eventId).maybeSingle()
      .then(({ data }) => setEvent(data || null));
    supabase.from('event_invitees').select('id', { count: 'exact', head: true }).eq('event_id', eventId)
      .then(({ count }) => setGuestCount(count || 0));
  }, [eventId]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.from('users').select('name').eq('id', session.user.id).maybeSingle();
      if (data?.name) setCurrentUserName(data.name);
    })();
  }, []);

  return { event, guestCount, currentUserName };
}
