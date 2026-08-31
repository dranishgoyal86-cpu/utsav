import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Share, Modal, KeyboardAvoidingView, Platform, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import { showAlert, confirmDestructive } from '../../helpers';
import SwipeableRow from '../../components/SwipeableRow';
import AppHeader from '../../components/AppHeader';
import DesktopStandalonePage from '../../components/desktop/DesktopStandalonePage';
import { MAROON, CARD, LINE, TEXT, MUTED, CREAM } from '../../lib/desktopTheme';

const DESKTOP_BREAKPOINT = 768;

const CATEGORIES = ['Decorator', 'Caterer', 'Photographer', 'DJ', 'Mehendi', 'Makeup', 'Venue', 'Other'];

export default function PersonalVendors({ route, navigation }) {
  const { savedPlanId, bookingId, eventTitle } = route.params || {};
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => { fetchVendors(); }, [])
  );

  async function fetchVendors() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      let query = supabase.from('personal_vendors').select('*').eq('customer_id', session.user.id);
      if (savedPlanId) query = query.eq('saved_plan_id', savedPlanId);
      if (bookingId) query = query.eq('booking_id', bookingId);

      const { data } = await query.order('created_at', { ascending: false });
      setVendors(data || []);
    } catch (err) {
      console.log('Fetch vendors error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function addVendor() {
    if (!name.trim() || !phone.trim()) {
      showAlert('Missing details', 'Please enter at least a name and phone number.');
      return;
    }
    try {
      setSaving(true);
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase
        .from('personal_vendors')
        .insert({
          customer_id: session.user.id,
          saved_plan_id: savedPlanId || null,
          booking_id: bookingId || null,
          name: name.trim(),
          category: category || null,
          phone: phone.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      setName(''); setCategory(''); setPhone('');
      setShowAddModal(false);
      setVendors(prev => [data, ...prev]);

      // Immediately offer to send them the magic link
      shareVendorLink(data);
    } catch (err) {
      console.log('Add vendor error:', err.message);
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  function deleteVendor(vendor) {
    confirmDestructive(
      'Remove this vendor?',
      `"${vendor.name}" will be removed from your vendor list. This can't be undone.`,
      'Remove',
      async () => {
        try {
          const { error } = await supabase.from('personal_vendors').delete().eq('id', vendor.id);
          if (error) throw error;
          setVendors(prev => prev.filter(v => v.id !== vendor.id));
        } catch (err) {
          showAlert('Error', err.message);
        }
      }
    );
  }

  async function shareVendorLink(vendor) {
   const link = `https://wonderful-cranachan-f1117f.netlify.app/vendor-chat/${vendor.access_token}`;
    const message = `Hi ${vendor.name}! I'm planning ${eventTitle || 'my event'} with you on Utsav.\n\nUse this link to chat with me directly — no app or signup needed:\n${link}`;
    try {
      await Share.share({ message, title: 'Chat link for ' + vendor.name });
    } catch (err) {
      console.log('Share error:', err.message);
    }
  }

  const addModalEl = (
    <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
      <KeyboardAvoidingView style={[s.modalOverlay, isDesktopWeb && { justifyContent: 'center' }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[s.modalSheet, isDesktopWeb && ds.modalDesktop]}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Add a vendor</Text>
            <TouchableOpacity onPress={() => setShowAddModal(false)}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <TextInput style={s.input} placeholder="Vendor name" placeholderTextColor={theme.textTertiary} value={name} onChangeText={setName} />
          <TextInput style={s.input} placeholder="Phone number" placeholderTextColor={theme.textTertiary} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <View style={s.chipsWrap}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity key={cat} style={[s.chip, category === cat && s.chipActive]} onPress={() => setCategory(cat)}>
                <Text style={[s.chipText, category === cat && s.chipTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.7 }]} onPress={addVendor} disabled={saving}>
            {saving ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.saveBtnText}>Add & share chat link</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  if (isDesktopWeb) {
    return (
      <DesktopStandalonePage
        onBack={() => navigation.goBack()}
        title="My vendors"
        maxWidth={900}
        right={<TouchableOpacity style={ds.addBtn} onPress={() => setShowAddModal(true)}><Text style={ds.addBtnText}>+ Add</Text></TouchableOpacity>}
      >
        {loading ? (
          <View style={{ paddingVertical: 50, alignItems: 'center' }}><ActivityIndicator color={MAROON} /></View>
        ) : vendors.length === 0 ? (
          <View style={ds.emptyCard}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>🤝</Text>
            <Text style={ds.emptyTitle}>No personal vendors yet</Text>
            <Text style={ds.emptySub}>Add any vendor you're working with outside Utsav — a family caterer, your own photographer — and chat with them right here.</Text>
            <TouchableOpacity style={ds.addBtn} onPress={() => setShowAddModal(true)}><Text style={ds.addBtnText}>+ Add a vendor</Text></TouchableOpacity>
          </View>
        ) : (
          <View style={ds.grid}>
            {vendors.map(item => (
              <View key={item.id} style={ds.card}>
                <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }} onPress={() => navigation.navigate('PersonalVendorChat', { vendor: item })} activeOpacity={0.85}>
                  <View style={ds.avatar}><Text style={ds.avatarText}>{item.name[0]}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={ds.name}>{item.name}</Text>
                    <Text style={ds.meta}>{item.category || 'Vendor'} · {item.phone}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={ds.shareBtn} onPress={() => shareVendorLink(item)}>
                  <Text style={{ fontSize: 15, color: MAROON }}>↑</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        {addModalEl}
      </DesktopStandalonePage>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader
        title="My vendors"
        onBack={() => navigation.goBack()}
        theme={theme}
        navigation={navigation}
        rightActions={[
          <TouchableOpacity key="add" style={s.addBtn} onPress={() => setShowAddModal(true)}>
            <Text style={s.addBtnText}>+ Add</Text>
          </TouchableOpacity>,
        ]}
      />

      {loading ? (
        <View style={s.centerBox}><ActivityIndicator color={theme.accent} /></View>
      ) : vendors.length === 0 ? (
        <View style={s.emptyBox}>
          <Text style={s.emptyIcon}>🤝</Text>
          <Text style={s.emptyTitle}>No personal vendors yet</Text>
          <Text style={s.emptySub}>
            Add any vendor you're working with outside Utsav — a family caterer, your own photographer — and chat with them right here.
          </Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => setShowAddModal(true)}>
            <Text style={s.emptyBtnText}>+ Add a vendor</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={vendors}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <SwipeableRow
              style={s.vendorCardWrap}
              onPress={() => navigation.navigate('PersonalVendorChat', { vendor: item })}
              onDelete={() => deleteVendor(item)}
            >
              <View style={s.vendorCard}>
                <View style={s.vendorAvatar}>
                  <Text style={s.vendorAvatarText}>{item.name[0]}</Text>
                </View>
                <View style={s.vendorInfo}>
                  <Text style={s.vendorName}>{item.name}</Text>
                  <Text style={s.vendorMeta}>{item.category || 'Vendor'} · {item.phone}</Text>
                </View>
                <TouchableOpacity style={s.shareIconBtn} onPress={() => shareVendorLink(item)}>
                  <Text style={s.shareIconText}>↑</Text>
                </TouchableOpacity>
              </View>
            </SwipeableRow>
          )}
        />
      )}

      {addModalEl}
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backIcon: { fontSize: 22, color: theme.text, width: 32 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
    addBtn: { backgroundColor: theme.btnPrimary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
    addBtnText: { color: theme.btnPrimaryText, fontSize: 13, fontWeight: '700' },
    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyIcon: { fontSize: 48, marginBottom: 14, opacity: 0.6 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: theme.text, marginBottom: 8 },
    emptySub: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
    emptyBtn: { backgroundColor: theme.btnPrimary, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 13 },
    emptyBtnText: { color: theme.btnPrimaryText, fontSize: 14, fontWeight: '700' },
    list: { padding: 16 },
    vendorCardWrap: { borderRadius: 18, marginBottom: 10 },
    vendorCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.cardBg, borderRadius: 18, padding: 14, borderWidth: 0.5, borderColor: theme.border, gap: 12 },
    vendorAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
    vendorAvatarText: { fontSize: 18, color: '#fff', fontWeight: '700' },
    vendorInfo: { flex: 1 },
    vendorName: { fontSize: 14, fontWeight: '700', color: theme.text },
    vendorMeta: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
    shareIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.bgSecondary, alignItems: 'center', justifyContent: 'center' },
    shareIconText: { fontSize: 16, color: theme.textSecondary },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: theme.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 30 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
    modalClose: { fontSize: 18, color: theme.textSecondary },
    input: { backgroundColor: theme.cardBg, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, fontSize: 14, borderWidth: 0.5, borderColor: theme.border, color: theme.text, marginBottom: 10 },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border, backgroundColor: theme.cardBg },
    chipActive: { backgroundColor: theme.text, borderColor: theme.text },
    chipText: { fontSize: 13, color: theme.textSecondary },
    chipTextActive: { color: theme.bg, fontWeight: '600' },
    saveBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
    saveBtnText: { color: theme.btnPrimaryText, fontSize: 15, fontWeight: '700' },
  });
}

const ds = StyleSheet.create({
  addBtn: { backgroundColor: MAROON, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 },
  addBtnText: { color: '#fff', fontSize: 13.5, fontWeight: '700' },
  emptyCard: { backgroundColor: CARD, borderRadius: 20, borderWidth: 1, borderColor: LINE, padding: 44, alignItems: 'center', maxWidth: 480, alignSelf: 'center' },
  emptyTitle: { fontFamily: 'Fraunces-SemiBold', fontSize: 17, color: TEXT, marginBottom: 8 },
  emptySub: { fontSize: 13.5, color: MUTED, textAlign: 'center', lineHeight: 20, marginBottom: 20, maxWidth: 400 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: { width: 320, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: LINE, padding: 14 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: MAROON, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, color: '#fff', fontWeight: '700' },
  name: { fontSize: 14, fontWeight: '700', color: TEXT },
  meta: { fontSize: 12, color: MUTED, marginTop: 2 },
  shareBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center' },
  modalDesktop: { maxWidth: 460, width: '100%', alignSelf: 'center', borderRadius: 22 },
});