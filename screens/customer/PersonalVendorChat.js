import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Modal, Share, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { CREAM } from '../../lib/desktopTheme';

const DESKTOP_BREAKPOINT = 768;

export default function PersonalVendorChat({ route, navigation }) {
  const { vendor } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { width } = useWindowDimensions();
  // Same centered-thread treatment as ChatScreen.js.
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmDetails, setConfirmDetails] = useState('');
  const [confirmPrice, setConfirmPrice] = useState('');
  const flatListRef = useRef(null);

  useEffect(() => {
    fetchMessages();

    const channel = supabase
      .channel(`personal-vendor-${vendor.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'personal_vendor_messages', filter: `vendor_id=eq.${vendor.id}` },
        (payload) => {
          setMessages(prev => {
            if (prev.find(m => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'personal_vendor_messages', filter: `vendor_id=eq.${vendor.id}` },
        (payload) => {
          setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchMessages() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('personal_vendor_messages')
        .select('*')
        .eq('vendor_id', vendor.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setMessages(data || []);

      await supabase
        .from('personal_vendor_messages')
        .update({ is_read: true })
        .eq('vendor_id', vendor.id)
        .eq('sender_type', 'vendor')
        .eq('is_read', false);
    } catch (err) {
      console.log('Fetch personal vendor messages error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage() {
    if (!newMessage.trim() || sending) return;
    try {
      setSending(true);
      const content = newMessage.trim();
      setNewMessage('');
      const { error } = await supabase.from('personal_vendor_messages').insert({
        vendor_id: vendor.id,
        sender_type: 'customer',
        content,
      });
      if (error) throw error;
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
      await supabase.from('personal_vendor_messages').insert({
        vendor_id: vendor.id,
        sender_type: 'customer',
        content: `Confirmation: ${confirmTitle.trim()}`,
        message_type: 'service_confirmation',
        card_data: {
          title: confirmTitle.trim(),
          details: confirmDetails.trim() || null,
          price: confirmPrice ? parseInt(confirmPrice) : null,
        },
        confirmed_by: [],
      });
      setConfirmTitle(''); setConfirmDetails(''); setConfirmPrice('');
      setShowConfirmModal(false);
    } catch (err) {
      console.log('Send confirmation error:', err.message);
    }
  }

  async function confirmCard(messageId, currentConfirmedBy) {
    if (currentConfirmedBy?.includes('customer')) return;
    const updated = [...new Set([...(currentConfirmedBy || []), 'customer'])];
    await supabase.from('personal_vendor_messages').update({ confirmed_by: updated }).eq('id', messageId);
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, confirmed_by: updated } : m));
  }

  async function resendLink() {
    const link = `https://wonderful-cranachan-f1117f.netlify.app/vendor-chat/${vendor.access_token}`;
    try {
      await Share.share({ message: `Chat with me on Utsav: ${link}` });
    } catch (err) {
      console.log('Share error:', err.message);
    }
  }

  function formatTime(dateStr) {
    return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  return (
    <SafeAreaView style={[s.container, isDesktopWeb && { backgroundColor: CREAM }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerName}>{vendor.name}</Text>
          <Text style={s.headerSub}>{vendor.category || 'Personal vendor'} · no Utsav account</Text>
        </View>
        <TouchableOpacity onPress={resendLink}>
          <Text style={s.shareIcon}>↑</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={[{ flex: 1 }, isDesktopWeb && ds.centerCol]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {loading ? (
          <View style={s.centerBox}><ActivityIndicator color={theme.accent} /></View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => item.id}
            contentContainerStyle={s.messagesList}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={s.emptyBox}>
                <Text style={s.emptyIcon}>🤝</Text>
                <Text style={s.emptyTitle}>Start the conversation</Text>
                <Text style={s.emptySub}>{vendor.name} will reply using the chat link you shared with them.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const isMe = item.sender_type === 'customer';
              return (
                <View style={[s.messageRow, isMe && s.messageRowMe]}>
                  {item.message_type === 'service_confirmation' ? (
                    <View style={s.serviceCard}>
                      <View style={s.cardHeaderRow}>
                        <Text style={s.cardHeaderIcon}>📋</Text>
                        <Text style={s.cardHeaderTitle}>{item.card_data?.title}</Text>
                      </View>
                      {item.card_data?.details && <Text style={s.cardDetails}>{item.card_data.details}</Text>}
                      {item.card_data?.price ? <Text style={s.cardPrice}>₹{item.card_data.price.toLocaleString()}</Text> : null}
                      <TouchableOpacity
                        style={[s.confirmTapBtn, item.confirmed_by?.includes('customer') && s.confirmTapBtnDone]}
                        onPress={() => confirmCard(item.id, item.confirmed_by)}
                        disabled={item.confirmed_by?.includes('customer')}
                      >
                        <Text style={s.confirmTapBtnText}>
                          {item.confirmed_by?.includes('customer') ? '✓ You confirmed this' : 'Tap to confirm'}
                        </Text>
                      </TouchableOpacity>
                      {item.confirmed_by?.length > 0 && (
                        <Text style={s.confirmCountText}>{item.confirmed_by.length} of 2 confirmed</Text>
                      )}
                      <Text style={s.cardTimestamp}>{formatTime(item.created_at)}</Text>
                    </View>
                  ) : (
                    <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleThem]}>
                      <Text style={[s.bubbleText, isMe ? s.bubbleTextMe : s.bubbleTextThem]}>{item.content}</Text>
                      <Text style={[s.bubbleTime, isMe ? s.bubbleTimeMe : s.bubbleTimeThem]}>{formatTime(item.created_at)}</Text>
                    </View>
                  )}
                </View>
              );
            }}
          />
        )}

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
          />
          <TouchableOpacity
            style={[s.sendBtn, (!newMessage.trim() || sending) && s.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!newMessage.trim() || sending}
          >
            {sending ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={s.sendBtnText}>↑</Text>}
          </TouchableOpacity>
        </View>

        <Modal visible={showConfirmModal} transparent animationType="slide" onRequestClose={() => setShowConfirmModal(false)}>
          <View style={s.confirmModalOverlay}>
            <View style={s.confirmModalSheet}>
              <View style={s.confirmModalHeader}>
                <Text style={s.confirmModalTitle}>Confirm service details</Text>
                <TouchableOpacity onPress={() => setShowConfirmModal(false)}>
                  <Text style={s.confirmModalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <TextInput style={s.confirmInput} placeholder="What's being confirmed?" placeholderTextColor={theme.textTertiary} value={confirmTitle} onChangeText={setConfirmTitle} />
              <TextInput style={[s.confirmInput, { minHeight: 80, textAlignVertical: 'top' }]} placeholder="Details" placeholderTextColor={theme.textTertiary} value={confirmDetails} onChangeText={setConfirmDetails} multiline />
              <TextInput style={s.confirmInput} placeholder="Price (₹, optional)" placeholderTextColor={theme.textTertiary} value={confirmPrice} onChangeText={setConfirmPrice} keyboardType="number-pad" />
              <TouchableOpacity style={[s.confirmSendBtn, !confirmTitle.trim() && { opacity: 0.5 }]} onPress={sendServiceConfirmation} disabled={!confirmTitle.trim()}>
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
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backIcon: { fontSize: 22, color: theme.text, width: 32 },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerName: { fontSize: 14.5, fontWeight: '700', color: theme.text },
    headerSub: { fontSize: 11, color: theme.textSecondary },
    shareIcon: { fontSize: 18, color: theme.textSecondary, width: 32, textAlign: 'right' },
    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    messagesList: { padding: 16, flexGrow: 1 },
    emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
    emptyIcon: { fontSize: 44, marginBottom: 14, opacity: 0.5 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 6 },
    emptySub: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 19, paddingHorizontal: 20 },
    messageRow: { marginBottom: 10, alignItems: 'flex-start' },
    messageRowMe: { alignItems: 'flex-end' },
    bubble: { maxWidth: '78%', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
    bubbleMe: { backgroundColor: theme.text, borderBottomRightRadius: 6 },
    bubbleThem: { backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border, borderBottomLeftRadius: 6 },
    bubbleText: { fontSize: 14, lineHeight: 20 },
    bubbleTextMe: { color: theme.bg },
    bubbleTextThem: { color: theme.text },
    bubbleTime: { fontSize: 10, marginTop: 4 },
    bubbleTimeMe: { color: 'rgba(255,255,255,0.55)', textAlign: 'right' },
    bubbleTimeThem: { color: theme.textTertiary },
    serviceCard: { maxWidth: '85%', backgroundColor: theme.cardBg, borderRadius: 18, padding: 15, borderWidth: 0.5, borderColor: theme.border },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
    cardHeaderIcon: { fontSize: 16 },
    cardHeaderTitle: { fontSize: 14, fontWeight: '700', color: theme.text, flex: 1 },
    cardDetails: { fontSize: 13, color: theme.textSecondary, lineHeight: 19, marginBottom: 8 },
    cardPrice: { fontSize: 16, fontWeight: '700', color: theme.accent, marginBottom: 10 },
    confirmTapBtn: { backgroundColor: theme.btnPrimary, borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
    confirmTapBtnDone: { backgroundColor: '#2E7D32' },
    confirmTapBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
    confirmCountText: { fontSize: 11, color: theme.textSecondary, textAlign: 'center', marginTop: 6 },
    cardTimestamp: { fontSize: 10, color: theme.textTertiary, marginTop: 8, textAlign: 'right' },
    inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 14, borderTopWidth: 0.5, borderTopColor: theme.border },
    confirmCardBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.cardBg, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: theme.border },
    confirmCardBtnIcon: { fontSize: 18 },
    input: { flex: 1, backgroundColor: theme.cardBg, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11, fontSize: 14, borderWidth: 0.5, borderColor: theme.border, color: theme.text, maxHeight: 100 },
    sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.btnPrimary, alignItems: 'center', justifyContent: 'center' },
    sendBtnDisabled: { opacity: 0.4 },
    sendBtnText: { fontSize: 18, color: theme.btnPrimaryText, fontWeight: '700' },
    confirmModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    confirmModalSheet: { backgroundColor: theme.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 30 },
    confirmModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    confirmModalTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
    confirmModalClose: { fontSize: 18, color: theme.textSecondary },
    confirmInput: { backgroundColor: theme.cardBg, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, borderWidth: 0.5, borderColor: theme.border, color: theme.text, marginBottom: 10 },
    confirmSendBtn: { backgroundColor: theme.btnPrimary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
    confirmSendBtnText: { color: theme.btnPrimaryText, fontSize: 14, fontWeight: '700' },
  });
}

const ds = StyleSheet.create({
  centerCol: { width: '100%', maxWidth: 720, alignSelf: 'center' },
});