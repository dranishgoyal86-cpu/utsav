import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import SwipeableRow from '../../components/SwipeableRow';
import { confirmDestructive } from '../../helpers';
import AppHeader from '../../components/AppHeader';
import DesktopStandalonePage from '../../components/desktop/DesktopStandalonePage';
import { MAROON, CARD, LINE, TEXT, MUTED, CREAM } from '../../lib/desktopTheme';

const DESKTOP_BREAKPOINT = 768;

const NOTIFICATION_ICONS = {
  booking_confirmed: '✅',
  booking_declined: '❌',
  new_booking: '📅',
  new_message: '💬',
  payment_received: '💰',
  provider_verified: '✓',
  todo_completed: '📝',
  rsvp_received: '📬',
  rsvp_reminder: '📋',
  rsvp_info_changed: '✎',
  invoice_generated: '🧾',
  todo_reminder: '⏰',
  birthday_wish: '🎂',
};

export default function NotificationsScreen({ navigation }) {
  const { theme } = useTheme();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const s = makeStyles(theme);
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;

  useFocusEffect(
    useCallback(() => { fetchNotifications(); }, [])
  );

  async function fetchNotifications() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      setNotifications(data || []);
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', session.user.id)
        .eq('is_read', false);
    } catch (err) {
      console.log(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Each notification type only ever gets created for one role (a provider
  // never receives an rsvp_reminder, a customer never receives new_booking),
  // so whichever branch of App.js's role-based Stack.Navigator is currently
  // mounted already has the right route names available — no role check
  // needed here. Fetches the full record before navigating (not just the
  // id carried in data) since the destination screens expect a full
  // event/booking object, not a bare id.
  async function handleNotificationPress(item) {
    const data = item.data || {};
    const type = data.type;
    try {
      if (type === 'rsvp_received' || type === 'rsvp_reminder' || type === 'rsvp_info_changed' || type === 'todo_reminder' || type === 'todo_completed') {
        if (!data.event_id) return;
        const { data: event } = await supabase.from('events').select('*').eq('id', data.event_id).single();
        if (!event) return;
        if (type === 'todo_reminder' || type === 'todo_completed') {
          navigation.navigate('EventTodo', { event, todoId: data.todo_id || null });
        } else {
          navigation.navigate('GuestList', { event });
        }
        return;
      }

      if (type === 'new_message') {
        if (!data.booking_id) { navigation.navigate('Inbox'); return; }
        const { data: booking } = await supabase.from('bookings').select('*').eq('id', data.booking_id).single();
        if (!booking) return;
        const { data: { session } } = await supabase.auth.getSession();
        const myId = session?.user?.id;

        let receiverId, receiverName;
        if (booking.customer_id === myId) {
          const { data: provider } = await supabase.from('providers').select('user_id').eq('id', booking.provider_id).single();
          const { data: providerUser } = provider?.user_id
            ? await supabase.from('users').select('id, name').eq('id', provider.user_id).single()
            : { data: null };
          receiverId = providerUser?.id;
          receiverName = providerUser?.name || 'Provider';
        } else {
          const { data: customer } = await supabase.from('users').select('id, name').eq('id', booking.customer_id).single();
          receiverId = customer?.id;
          receiverName = customer?.name || 'Customer';
        }
        if (receiverId) navigation.navigate('Chat', { booking, receiverId, receiverName });
        return;
      }

      if (type === 'invoice_generated' || type === 'booking_confirmed' || type === 'booking_declined') {
        navigation.navigate('CustomerTabs', { screen: 'Bookings' });
        return;
      }

      if (type === 'new_booking' || type === 'payment_received' || type === 'event_date_changed') {
        navigation.navigate('ProviderDashboard');
        return;
      }

      if (type === 'provider_verified') {
        navigation.navigate('Verification');
        return;
      }
    } catch (err) {
      console.log('notification navigation error:', err.message);
    }
  }

  async function deleteNotification(id) {
    setNotifications(prev => prev.filter(n => n.id !== id));
    const { error } = await supabase.from('notifications').delete().eq('id', id);
    if (error) {
      console.log('deleteNotification error:', error.message);
      fetchNotifications(); // restore the optimistically-removed row on failure
    }
  }

  function clearAll() {
    confirmDestructive(
      'Clear all notifications?',
      'This removes all of your notifications. This can\'t be undone.',
      'Clear all',
      async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        setNotifications([]);
        const { error } = await supabase.from('notifications').delete().eq('user_id', session.user.id);
        if (error) { console.log('clearAll error:', error.message); fetchNotifications(); }
      }
    );
  }

  function formatTime(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  if (isDesktopWeb) {
    return (
      <DesktopStandalonePage
        onBack={() => navigation.goBack()}
        title="Notifications"
        maxWidth={800}
        right={notifications.length > 0 ? (
          <TouchableOpacity onPress={clearAll}><Text style={ds.clearAllText}>Clear all</Text></TouchableOpacity>
        ) : null}
      >
        {loading ? (
          <View style={{ paddingVertical: 50, alignItems: 'center' }}><ActivityIndicator color={MAROON} /></View>
        ) : notifications.length === 0 ? (
          <View style={ds.emptyCard}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>🔔</Text>
            <Text style={ds.emptyTitle}>No notifications yet</Text>
            <Text style={ds.emptySub}>Booking updates, messages and payment confirmations will appear here</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {notifications.map(item => (
              <View key={item.id} style={ds.notifRowWrap}>
                <TouchableOpacity style={[ds.notifCard, !item.is_read && ds.notifCardUnread]} onPress={() => handleNotificationPress(item)}>
                  <View style={[ds.notifIconBox, !item.is_read && ds.notifIconBoxUnread]}>
                    <Text style={{ fontSize: 20 }}>{NOTIFICATION_ICONS[item.data?.type] || '🔔'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[ds.notifTitle, !item.is_read && ds.notifTitleBold]}>{item.title}</Text>
                    <Text style={ds.notifBody}>{item.body}</Text>
                    <Text style={ds.notifTime}>{formatTime(item.created_at)}</Text>
                  </View>
                  {!item.is_read && <View style={ds.unreadDot} />}
                </TouchableOpacity>
                <TouchableOpacity style={ds.deleteBtn} onPress={() => deleteNotification(item.id)}>
                  <Text style={{ fontSize: 12, color: MUTED }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </DesktopStandalonePage>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader
        title="Notifications"
        onBack={() => navigation.goBack()}
        theme={theme}
        navigation={navigation}
        rightActions={notifications.length > 0 ? [
          <TouchableOpacity key="clear" onPress={clearAll} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.clearAllText}>Clear all</Text>
          </TouchableOpacity>,
        ] : []}
      />

      {loading ? (
        <View style={s.centerBox}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={s.centerBox}>
          <Text style={s.emptyIcon}>🔔</Text>
          <Text style={s.emptyTitle}>No notifications yet</Text>
          <Text style={s.emptySub}>
            Booking updates, messages and payment confirmations will appear here
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: 140, paddingTop: 6 }}
          renderItem={({ item }) => (
            <SwipeableRow
              style={s.notifRowWrap}
              onPress={() => handleNotificationPress(item)}
              onDelete={() => deleteNotification(item.id)}
            >
              <View style={[s.notifCard, !item.is_read && s.notifCardUnread]}>
                <View style={[s.notifIconBox, !item.is_read && s.notifIconBoxUnread]}>
                  <Text style={s.notifIcon}>
                    {NOTIFICATION_ICONS[item.data?.type] || '🔔'}
                  </Text>
                </View>
                <View style={s.notifContent}>
                  <Text style={[s.notifTitle, !item.is_read && s.notifTitleBold]}>
                    {item.title}
                  </Text>
                  <Text style={s.notifBody}>{item.body}</Text>
                  <Text style={s.notifTime}>{formatTime(item.created_at)}</Text>
                </View>
                {!item.is_read && <View style={s.unreadDot} />}
              </View>
            </SwipeableRow>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backIcon: { fontSize: 22, color: theme.text, width: 32 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
    clearAllText: { fontSize: 13, fontWeight: '600', color: theme.accent },

    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyIcon: { fontSize: 44, marginBottom: 14, opacity: 0.5 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 6 },
    emptySub: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },

    notifRowWrap: { marginHorizontal: 16, marginBottom: 10, borderRadius: 18 },
    notifCard: {
      flexDirection: 'row', alignItems: 'flex-start',
      backgroundColor: theme.cardBg, borderRadius: 18,
      borderWidth: 0.5, borderColor: theme.border,
      paddingHorizontal: 16, paddingVertical: 14, gap: 12,
    },
    notifCardUnread: {
      borderColor: theme.accent,
      shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    },
    notifIconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: theme.bgSecondary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    notifIconBoxUnread: { backgroundColor: '#FCEFD9' },
    notifIcon: { fontSize: 20 },
    notifContent: { flex: 1 },
    notifTitle: { fontSize: 14, color: theme.text, marginBottom: 3, lineHeight: 20, fontWeight: '500' },
    notifTitleBold: { fontWeight: '700' },
    notifBody: { fontSize: 13, color: theme.textSecondary, lineHeight: 18, marginBottom: 5 },
    notifTime: { fontSize: 11, color: theme.textTertiary },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.accent, marginTop: 6, flexShrink: 0 },
  });
}

const ds = StyleSheet.create({
  clearAllText: { fontSize: 13, fontWeight: '600', color: MAROON },
  emptyCard: { backgroundColor: CARD, borderRadius: 20, borderWidth: 1, borderColor: LINE, padding: 44, alignItems: 'center' },
  emptyTitle: { fontFamily: 'Fraunces-SemiBold', fontSize: 16, color: TEXT, marginBottom: 6 },
  emptySub: { fontSize: 13, color: MUTED, textAlign: 'center' },
  notifRowWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notifCard: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: LINE, paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  notifCardUnread: { borderColor: MAROON },
  notifIconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  notifIconBoxUnread: { backgroundColor: MAROON + '14' },
  notifTitle: { fontSize: 14, color: TEXT, marginBottom: 3, lineHeight: 20, fontWeight: '500' },
  notifTitleBold: { fontWeight: '700' },
  notifBody: { fontSize: 13, color: MUTED, lineHeight: 18, marginBottom: 5 },
  notifTime: { fontSize: 11, color: MUTED },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: MAROON, marginTop: 6, flexShrink: 0 },
  deleteBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center' },
});