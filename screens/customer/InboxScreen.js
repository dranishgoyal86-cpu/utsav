import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import { confirmAction } from '../../helpers';
import SwipeableRow from '../../components/SwipeableRow';
import { Archive } from 'phosphor-react-native';
import AppHeader from '../../components/AppHeader';

export default function InboxScreen({ navigation }) {
  const { theme } = useTheme();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);
  const s = makeStyles(theme);

  useFocusEffect(
    useCallback(() => {
      fetchConversations();
    }, [])
  );

  async function fetchConversations() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setCurrentUserId(session.user.id);

      // Fetch bookings — no join
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .eq('customer_id', session.user.id)
        .eq('archived_by_customer', false)
        .in('status', ['pending', 'confirmed', 'completed'])
        .order('created_at', { ascending: false });

      if (bookingsError) throw bookingsError;
      if (!bookingsData?.length) { setConversations([]); return; }

      // Fetch related providers separately
      const providerIds = [...new Set(bookingsData.map(b => b.provider_id).filter(Boolean))];
      const { data: providersData } = await supabase
        .from('providers')
        .select('id, user_id, category')
        .in('id', providerIds);

      // Attach provider info to each booking
      const bookingsWithProviders = bookingsData.map(b => ({
        ...b,
        providers: providersData?.find(p => p.id === b.provider_id) || null,
      }));

      const providerUserIds = [...new Set(bookingsWithProviders.map(b => b.providers?.user_id).filter(Boolean))];
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name')
        .in('id', providerUserIds);

      const convos = await Promise.all(
        bookingsWithProviders.map(async booking => {
          const { data: lastMsg } = await supabase
            .from('messages')
            .select('*')
            .eq('booking_id', booking.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const { count: unreadCount } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('booking_id', booking.id)
            .eq('receiver_id', session.user.id)
            .eq('is_read', false);

          const providerUser = usersData?.find(u => u.id === booking.providers?.user_id);

          return {
            booking,
            providerName: providerUser?.name || 'Provider',
            providerUserId: booking.providers?.user_id,
            lastMessage: lastMsg,
            unreadCount: unreadCount || 0,
          };
        })
      );

      setConversations(convos);
    } catch (err) {
      console.log('Inbox error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  function archiveConversation(item) {
    confirmAction(
      'Archive this conversation?',
      `Your chat with ${item.providerName} will be moved out of your inbox. You can still reach it from the booking itself.`,
      'Archive',
      async () => {
        await supabase.from('bookings').update({ archived_by_customer: true }).eq('id', item.booking.id);
        setConversations(prev => prev.filter(c => c.booking.id !== item.booking.id));
      }
    );
  }

  function formatTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    }
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Messages" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      {loading ? (
        <View style={s.centerBox}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : conversations.length === 0 ? (
        <View style={s.centerBox}>
          <Text style={s.emptyIcon}>💬</Text>
          <Text style={s.emptyTitle}>No messages yet</Text>
          <Text style={s.emptySub}>
            Make a booking to start chatting with service providers
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={item => item.booking.id}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 140 }}
          renderItem={({ item }) => {
            const hasUnread = item.unreadCount > 0;
            const isMe = item.lastMessage?.sender_id === currentUserId;
            return (
              <SwipeableRow
                onPress={() => navigation.navigate('Chat', {
                  booking: item.booking,
                  receiverId: item.providerUserId,
                  receiverName: item.providerName,
                })}
                onDelete={() => archiveConversation(item)}
                deleteLabel="Archive"
                actionColor="#3B82F6"
                actionIcon={Archive}
              >
                <View style={s.convoRow}>
                  <View style={s.convoAvatar}>
                    <Text style={s.convoAvatarText}>{item.providerName?.[0] || '?'}</Text>
                  </View>
                  <View style={s.convoInfo}>
                    <View style={s.convoTop}>
                      <Text style={[s.convoName, hasUnread && s.convoNameBold]}>
                        {item.providerName}
                      </Text>
                      <Text style={s.convoTime}>
                        {formatTime(item.lastMessage?.created_at)}
                      </Text>
                    </View>
                    <View style={s.convoBottom}>
                      <Text style={[s.convoPreview, hasUnread && s.convoPreviewBold]} numberOfLines={1}>
                        {item.lastMessage
                          ? `${isMe ? 'You: ' : ''}${item.lastMessage.content}`
                          : `${item.booking.event_type} · Tap to chat`}
                      </Text>
                      {hasUnread && (
                        <View style={s.unreadBadge}>
                          <Text style={s.unreadCount}>{item.unreadCount}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.convoMeta}>
                      {item.booking.event_type} · {item.booking.providers?.category}
                    </Text>
                  </View>
                </View>
              </SwipeableRow>
            );
          }}
          ItemSeparatorComponent={() => <View style={s.separator} />}
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backIcon: { fontSize: 22, color: theme.text, width: 32 },
    screenTitle: { fontSize: 18, fontWeight: '700', color: theme.text },

    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyIcon: { fontSize: 44, marginBottom: 14, opacity: 0.5 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 6 },
    emptySub: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },

    convoRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, gap: 13 },
    convoAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    convoAvatarText: { fontSize: 20, color: '#FFF', fontWeight: '700' },
    convoInfo: { flex: 1 },
    convoTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
    convoName: { fontSize: 14.5, color: theme.text, fontWeight: '600' },
    convoNameBold: { fontWeight: '700' },
    convoTime: { fontSize: 11, color: theme.textTertiary },
    convoBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
    convoPreview: { fontSize: 13, color: theme.textSecondary, flex: 1 },
    convoPreviewBold: { color: theme.text, fontWeight: '500' },
    convoMeta: { fontSize: 11, color: theme.textTertiary },
    unreadBadge: { backgroundColor: theme.accent, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginLeft: 8 },
    unreadCount: { fontSize: 11, color: '#fff', fontWeight: '700' },
    separator: { height: 0.5, backgroundColor: theme.border, marginLeft: 80 },
  });
}