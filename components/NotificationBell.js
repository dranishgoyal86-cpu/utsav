import { useState, useCallback } from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../supabase';
import { useTheme } from '../ThemeContext';

// Same unread-count query ProviderERP.js already uses for its header bell —
// kept here as a shared component so every customer tab that wants a bell
// (Plan, Discover, ...) gets the same badge behavior for free.
export default function NotificationBell({ navigation }) {
  const { theme } = useTheme();
  const s = styles(theme);
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const { count } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', session.user.id)
          .eq('is_read', false);
        if (!cancelled) setUnread(count || 0);
      })();
      return () => { cancelled = true; };
    }, [])
  );

  return (
    <TouchableOpacity
      style={s.btn}
      onPress={() => navigation.navigate('Notifications')}
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
    >
      <Text style={{ fontSize: 18 }}>🔔</Text>
      {unread > 0 && (
        <View style={s.badge}>
          <Text style={s.badgeText}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = theme => StyleSheet.create({
  btn: {
    width: 38, height: 38, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.cardBg, borderWidth: 1, borderColor: theme.border,
  },
  badge: {
    position: 'absolute', top: -3, right: -3, minWidth: 17, height: 17, borderRadius: 9,
    backgroundColor: '#E63946', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: theme.bg,
  },
  badgeText: { fontSize: 9.5, fontWeight: '800', color: '#FFF' },
});
