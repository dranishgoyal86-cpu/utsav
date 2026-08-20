import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { notifyNewMessage } from '../../notifications';

export default function ChatScreen({ route, navigation }) {
  const { booking, receiverId, receiverName } = route.params;
  const { theme } = useTheme();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [senderName, setSenderName] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmDetails, setConfirmDetails] = useState('');
  const [confirmPrice, setConfirmPrice] = useState('');
  const flatListRef = useRef(null);
  const s = makeStyles(theme);

  useEffect(() => {
    initChat();
    return () => {
      supabase.channel(`chat-${booking.id}`).unsubscribe();
    };
  }, []);

  async function initChat() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setCurrentUserId(session.user.id);
    const { data: profile } = await supabase
      .from('users')
      .select('name')
      .eq('id', session.user.id)
      .maybeSingle();
    setSenderName(profile?.name || 'Someone');
    await fetchMessages(session.user.id);
    await markMessagesRead(session.user.id);
    subscribeToMessages(session.user.id);
  }

  async function fetchMessages(userId) {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('booking_id', booking.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      console.log('Fetch messages error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function markMessagesRead(userId) {
    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('booking_id', booking.id)
      .eq('receiver_id', userId)
      .eq('is_read', false);
  }

  function subscribeToMessages(userId) {
    supabase
      .channel(`chat-${booking.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `booking_id=eq.${booking.id}`,
        },
        async (payload) => {
          const newMsg = payload.new;
          setMessages(prev => {
            if (prev.find(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          if (newMsg.receiver_id === userId) {
            await supabase
              .from('messages')
              .update({ is_read: true })
              .eq('id', newMsg.id);
          }
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }
      )
      .subscribe();
  }

  async function sendMessage() {
    if (!newMessage.trim() || sending) return;
    try {
      setSending(true);
      const content = newMessage.trim();
      setNewMessage('');

      const { error } = await supabase
        .from('messages')
        .insert({
          booking_id: booking.id,
          sender_id: currentUserId,
          receiver_id: receiverId,
          content,
          is_read: false,
        });

      if (error) throw error;
      notifyNewMessage(receiverId, senderName, booking.id).catch(err => console.log('notifyNewMessage error:', err.message));
    } catch (err) {
      console.log('Send error:', err.message);
      setNewMessage(newMessage);
    } finally {
      setSending(false);
    }
  }

  async function sendServiceConfirmation() {
    if (!confirmTitle.trim()) return;
    try {
      const { error } = await supabase.from('messages').insert({
        booking_id: booking.id,
        sender_id: currentUserId,
        receiver_id: receiverId,
        content: `Confirmation: ${confirmTitle.trim()}`,
        message_type: 'service_confirmation',
        card_data: {
          title: confirmTitle.trim(),
          details: confirmDetails.trim() || null,
          price: confirmPrice ? parseInt(confirmPrice) : null,
        },
        confirmed_by: [],
        is_read: false,
      });
      if (error) throw error;
      notifyNewMessage(receiverId, senderName, booking.id).catch(err => console.log('notifyNewMessage error:', err.message));
      setConfirmTitle('');
      setConfirmDetails('');
      setConfirmPrice('');
      setShowConfirmModal(false);
    } catch (err) {
      console.log('Send confirmation error:', err.message);
    }
  }

  async function confirmCard(messageId, currentConfirmedBy) {
    if (currentConfirmedBy?.includes(currentUserId)) return; // already confirmed
    const updated = [...(currentConfirmedBy || []), currentUserId];
    await supabase.from('messages').update({ confirmed_by: updated }).eq('id', messageId);
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, confirmed_by: updated } : m));
  }

  function formatTime(dateStr) {
    return new Date(dateStr).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  }

  function formatDate(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
  }

  function shouldShowDate(index) {
    if (index === 0) return true;
    const curr = new Date(messages[index].created_at).toDateString();
    const prev = new Date(messages[index - 1].created_at).toDateString();
    return curr !== prev;
  }

  const QUICK_REPLIES = [
    'Sure, I can do that!',
    'What time works for you?',
    'Please share more details',
    'I will confirm shortly',
    'Thank you!',
  ];

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <View style={s.headerAvatar}>
            <Text style={s.headerAvatarText}>{receiverName?.[0] || '?'}</Text>
          </View>
          <View>
            <Text style={s.headerName}>{receiverName}</Text>
            <Text style={s.headerSub}>
              {booking.event_type} · {new Date(booking.event_date).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short'
              })}
            </Text>
          </View>
        </View>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={s.centerBox}>
            <ActivityIndicator color={theme.accent} />
            <Text style={s.loadingText}>Loading messages...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => item.id}
            contentContainerStyle={s.messagesList}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={s.emptyBox}>
                <Text style={s.emptyIcon}>💬</Text>
                <Text style={s.emptyTitle}>Start the conversation</Text>
                <Text style={s.emptySub}>
                  Chat with {receiverName} about your {booking.event_type} booking
                </Text>
              </View>
            }
            ListHeaderComponent={
              <View style={s.bookingChip}>
                <Text style={s.bookingChipText}>
                  📅 {booking.event_type} · {new Date(booking.event_date).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'long', year: 'numeric'
                  })}
                </Text>
              </View>
            }
            renderItem={({ item, index }) => {
              const isMe = item.sender_id === currentUserId;
              return (
                <>
                  {shouldShowDate(index) && (
                    <View style={s.dateSeparator}>
                      <View style={s.dateLine} />
                      <Text style={s.dateText}>{formatDate(item.created_at)}</Text>
                      <View style={s.dateLine} />
                    </View>
                  )}
                  <View style={[s.messageRow, isMe && s.messageRowMe]}>
                    {!isMe && (
                      <View style={s.messageAvatar}>
                        <Text style={s.messageAvatarText}>{receiverName?.[0] || '?'}</Text>
                      </View>
                    )}
                    {item.message_type === 'payment_confirmation' ? (
                      <View style={s.paymentCard}>
                        <View style={s.cardHeaderRow}>
                          <Text style={s.cardHeaderIcon}>💰</Text>
                          <Text style={s.cardHeaderTitle}>Payment confirmed</Text>
                        </View>
                        <View style={s.cardRow}>
                          <Text style={s.cardLabel}>Total paid</Text>
                          <Text style={s.cardValue}>₹{item.card_data?.totalAmount?.toLocaleString()}</Text>
                        </View>
                        <View style={s.cardRow}>
                          <Text style={s.cardLabel}>Provider receives</Text>
                          <Text style={s.cardValueAccent}>₹{item.card_data?.providerAmount?.toLocaleString()}</Text>
                        </View>
                        <View style={s.cardRow}>
                          <Text style={s.cardLabel}>Platform fee</Text>
                          <Text style={s.cardValueMuted}>₹{item.card_data?.platformFee?.toLocaleString()}</Text>
                        </View>
                        <Text style={s.cardFootnote}>{item.card_data?.payoutNote}</Text>
                        <Text style={s.cardTimestamp}>{formatTime(item.created_at)}</Text>
                      </View>
                    ) : item.message_type === 'service_confirmation' ? (
                      <View style={s.serviceCard}>
                        <View style={s.cardHeaderRow}>
                          <Text style={s.cardHeaderIcon}>📋</Text>
                          <Text style={s.cardHeaderTitle}>{item.card_data?.title}</Text>
                        </View>
                        {item.card_data?.details && (
                          <Text style={s.cardDetails}>{item.card_data.details}</Text>
                        )}
                        {item.card_data?.price ? (
                          <Text style={s.cardPrice}>₹{item.card_data.price.toLocaleString()}</Text>
                        ) : null}
                        <TouchableOpacity
                          style={[
                            s.confirmTapBtn,
                            item.confirmed_by?.includes(currentUserId) && s.confirmTapBtnDone
                          ]}
                          onPress={() => confirmCard(item.id, item.confirmed_by)}
                          disabled={item.confirmed_by?.includes(currentUserId)}
                        >
                          <Text style={s.confirmTapBtnText}>
                            {item.confirmed_by?.includes(currentUserId)
                              ? '✓ You confirmed this'
                              : 'Tap to confirm'}
                          </Text>
                        </TouchableOpacity>
                        {item.confirmed_by?.length > 0 && (
                          <Text style={s.confirmCountText}>
                            {item.confirmed_by.length} of 2 confirmed
                          </Text>
                        )}
                        <Text style={s.cardTimestamp}>{formatTime(item.created_at)}</Text>
                      </View>
                    ) : (
                      <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleThem]}>
                        <Text style={[s.bubbleText, isMe ? s.bubbleTextMe : s.bubbleTextThem]}>
                          {item.content}
                        </Text>
                        <View style={s.bubbleMeta}>
                          <Text style={[s.bubbleTime, isMe ? s.bubbleTimeMe : s.bubbleTimeThem]}>
                            {formatTime(item.created_at)}
                          </Text>
                          {isMe && (
                            <Text style={s.readTick}>
                              {item.is_read ? '✓✓' : '✓'}
                            </Text>
                          )}
                        </View>
                      </View>
                    )}
                  </View>
                </>
              );
            }}
          />
        )}

        {/* Quick replies */}
        {messages.length === 0 && !loading && (
          <View style={s.quickReplies}>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={QUICK_REPLIES}
              keyExtractor={item => item}
              contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={s.quickReply}
                  onPress={() => setNewMessage(item)}
                >
                  <Text style={s.quickReplyText}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        {/* Input bar */}
        <View style={s.inputBar}>
          <TouchableOpacity style={s.confirmCardBtn} onPress={() => setShowConfirmModal(true)}>
            <Text style={s.confirmCardBtnIcon}>📋</Text>
          </TouchableOpacity>
          <TextInput
            style={s.input}
            placeholder="Type a message..."
            placeholderTextColor={theme.textTertiary}
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
            maxLength={500}
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!newMessage.trim() || sending) && s.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!newMessage.trim() || sending}
          >
            {sending
              ? <ActivityIndicator color="#FFF" size="small" />
              : <Text style={s.sendBtnText}>↑</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Service confirmation compose modal */}
        <Modal visible={showConfirmModal} transparent animationType="slide" onRequestClose={() => setShowConfirmModal(false)}>
          <View style={s.confirmModalOverlay}>
            <View style={s.confirmModalSheet}>
              <View style={s.confirmModalHeader}>
                <Text style={s.confirmModalTitle}>Confirm service details</Text>
                <TouchableOpacity onPress={() => setShowConfirmModal(false)}>
                  <Text style={s.confirmModalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.confirmModalHint}>
                Send a clear, structured confirmation so you're both on the same page — what's included, the price, and the date.
              </Text>
              <TextInput
                style={s.confirmInput}
                placeholder="What's being confirmed? (e.g. Decoration package)"
                placeholderTextColor={theme.textTertiary}
                value={confirmTitle}
                onChangeText={setConfirmTitle}
              />
              <TextInput
                style={[s.confirmInput, { minHeight: 80, textAlignVertical: 'top' }]}
                placeholder="Details — what's included, quantities, anything specific"
                placeholderTextColor={theme.textTertiary}
                value={confirmDetails}
                onChangeText={setConfirmDetails}
                multiline
              />
              <TextInput
                style={s.confirmInput}
                placeholder="Price (₹, optional)"
                placeholderTextColor={theme.textTertiary}
                value={confirmPrice}
                onChangeText={setConfirmPrice}
                keyboardType="number-pad"
              />
              <TouchableOpacity
                style={[s.confirmSendBtn, !confirmTitle.trim() && { opacity: 0.5 }]}
                onPress={sendServiceConfirmation}
                disabled={!confirmTitle.trim()}
              >
                <Text style={s.confirmSendBtnText}>Send confirmation card</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border, backgroundColor: theme.bg },
    backIcon: { fontSize: 22, color: theme.text, width: 32 },
    headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'center' },
    headerAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
    headerAvatarText: { fontSize: 14, color: '#FFF', fontWeight: '700' },
    headerName: { fontSize: 14.5, fontWeight: '700', color: theme.text },
    headerSub: { fontSize: 11, color: theme.textSecondary },

    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
    loadingText: { fontSize: 13, color: theme.textSecondary },

    messagesList: { padding: 16, paddingBottom: 8, flexGrow: 1 },
    emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
    emptyIcon: { fontSize: 44, marginBottom: 14, opacity: 0.5 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 6 },
    emptySub: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },

    bookingChip: { backgroundColor: theme.cardBg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, alignSelf: 'center', marginBottom: 18, borderWidth: 0.5, borderColor: theme.border },
    bookingChipText: { fontSize: 12, color: theme.textSecondary, fontWeight: '600' },

    dateSeparator: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14 },
    dateLine: { flex: 1, height: 0.5, backgroundColor: theme.border },
    dateText: { fontSize: 11, color: theme.textTertiary, fontWeight: '600' },

    messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 10 },
    messageRowMe: { flexDirection: 'row-reverse' },
    messageAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.bgSecondary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    messageAvatarText: { fontSize: 11, color: theme.textSecondary, fontWeight: '600' },

    bubble: { maxWidth: '75%', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
    bubbleMe: { backgroundColor: theme.text, borderBottomRightRadius: 6 },
    bubbleThem: { backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border, borderBottomLeftRadius: 6 },
    bubbleText: { fontSize: 14, lineHeight: 20 },
    bubbleTextMe: { color: theme.bg },
    bubbleTextThem: { color: theme.text },
    bubbleMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 },
    bubbleTime: { fontSize: 10 },
    bubbleTimeMe: { color: 'rgba(255,255,255,0.55)' },
    bubbleTimeThem: { color: theme.textTertiary },
    readTick: { fontSize: 10, color: 'rgba(255,255,255,0.55)' },

    quickReplies: { paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: theme.border },
    quickReply: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border, backgroundColor: theme.cardBg },
    quickReplyText: { fontSize: 13, color: theme.textSecondary, fontWeight: '500' },

    inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 14, borderTopWidth: 0.5, borderTopColor: theme.border, backgroundColor: theme.bg },
    input: { flex: 1, backgroundColor: theme.cardBg, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11, fontSize: 14, borderWidth: 0.5, borderColor: theme.border, color: theme.text, maxHeight: 100 },
    sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.btnPrimary, alignItems: 'center', justifyContent: 'center' },
    sendBtnDisabled: { opacity: 0.4 },
    sendBtnText: { fontSize: 18, color: theme.btnPrimaryText, fontWeight: '700' },
    confirmCardBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.cardBg, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: theme.border },
    confirmCardBtnIcon: { fontSize: 18 },

    confirmModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    confirmModalSheet: { backgroundColor: theme.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 30 },
    confirmModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    confirmModalTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
    confirmModalClose: { fontSize: 18, color: theme.textSecondary },
    confirmModalHint: { fontSize: 12.5, color: theme.textSecondary, lineHeight: 18, marginBottom: 16 },
    confirmInput: { backgroundColor: theme.cardBg, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, borderWidth: 0.5, borderColor: theme.border, color: theme.text, marginBottom: 10 },
    confirmSendBtn: { backgroundColor: theme.btnPrimary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
    confirmSendBtnText: { color: theme.btnPrimaryText, fontSize: 14, fontWeight: '700' },

    paymentCard: { maxWidth: '85%', backgroundColor: '#E8F5E9', borderRadius: 18, padding: 15, borderWidth: 0.5, borderColor: '#C8E6C9' },
    serviceCard: { maxWidth: '85%', backgroundColor: theme.cardBg, borderRadius: 18, padding: 15, borderWidth: 0.5, borderColor: theme.border },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
    cardHeaderIcon: { fontSize: 16 },
    cardHeaderTitle: { fontSize: 14, fontWeight: '700', color: theme.text, flex: 1 },
    cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
    cardLabel: { fontSize: 12.5, color: theme.textSecondary },
    cardValue: { fontSize: 13, fontWeight: '700', color: theme.text },
    cardValueAccent: { fontSize: 13, fontWeight: '700', color: '#2E7D32' },
    cardValueMuted: { fontSize: 12.5, color: theme.textSecondary },
    cardFootnote: { fontSize: 11, color: theme.textSecondary, marginTop: 8, fontStyle: 'italic' },
    cardDetails: { fontSize: 13, color: theme.textSecondary, lineHeight: 19, marginBottom: 8 },
    cardPrice: { fontSize: 16, fontWeight: '700', color: theme.accent, marginBottom: 10 },
    confirmTapBtn: { backgroundColor: theme.btnPrimary, borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
    confirmTapBtnDone: { backgroundColor: '#2E7D32' },
    confirmTapBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
    confirmCountText: { fontSize: 11, color: theme.textSecondary, textAlign: 'center', marginTop: 6 },
    cardTimestamp: { fontSize: 10, color: theme.textTertiary, marginTop: 8, textAlign: 'right' },
  });
}