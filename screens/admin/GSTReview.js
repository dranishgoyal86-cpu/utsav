import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, RefreshControl, Platform, Linking, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { getSignedDocumentUrl, showAlert } from '../../helpers';
import { notifyGstReviewed } from '../../notifications';
import AppHeader from '../../components/AppHeader';

// Provider verification, Task 3 -- a queue for a HUMAN to clear, not an
// automated check (explicit in the brief). No scraping/auto-validation of
// the government portal: this just gets the GSTIN and the uploaded
// certificate in front of an admin, with a one-tap link to India's real
// public GST search portal, and an Approve/Reject action against
// provider_billing.gst_status.
//
// The portal (services.gst.gov.in) is a JS-driven search form with no
// reliable GET-param pre-fill -- opening it pre-filled isn't something this
// portal actually supports, so the honest version of "easy to paste into"
// is: show the GSTIN as one tap to copy, right next to the button that
// opens the portal in a new tab.
const GST_PORTAL_URL = 'https://services.gst.gov.in/services/searchtp';

const TABS = ['pending', 'verified', 'rejected', 'all'];

export default function GSTReview({ navigation }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [activeTab, setActiveTab] = useState('pending');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState('');
  const [certUrl, setCertUrl] = useState(null);
  const [processing, setProcessing] = useState(false);

  useFocusEffect(
    useCallback(() => { fetchRows(); }, [activeTab])
  );

  async function fetchRows() {
    try {
      setLoading(true);
      let query = supabase
        .from('provider_billing')
        .select('id, provider_user_id, business_name, gstin, city, gst_certificate_url, gst_status, gst_reviewed_at, gst_review_notes')
        .not('gstin', 'is', null)
        .neq('gstin', '');

      query = activeTab === 'all' ? query.not('gst_status', 'is', null) : query.eq('gst_status', activeTab);

      const { data, error } = await query.order('id', { ascending: true });
      if (error) { console.log('GST review fetch error:', error.message); setRows([]); return; }
      setRows(data || []);
    } catch (err) {
      console.log('GST review fetch error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function openDetail(row) {
    setSelected(row);
    setNotes(row.gst_review_notes || '');
    setCertUrl(null);
    if (row.gst_certificate_url) {
      const url = await getSignedDocumentUrl(row.gst_certificate_url);
      setCertUrl(url);
    }
  }

  async function copyGstin() {
    if (!selected?.gstin) return;
    await Clipboard.setStringAsync(selected.gstin);
    showAlert('Copied', 'GSTIN copied — paste it into the GST portal search box.');
  }

  function confirmAction(action) {
    const isApprove = action === 'verified';
    if (!isApprove && !notes.trim()) {
      showAlert('Add a note', 'A rejection note helps the provider understand what to fix — please add one before rejecting.');
      return;
    }
    const title = isApprove ? 'Approve GST verification?' : 'Reject this submission?';
    const msg = isApprove
      ? `Mark ${selected.business_name || 'this provider'}'s GSTIN as verified?`
      : `Reject ${selected.business_name || 'this provider'}'s GST submission?`;
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${msg}`)) performAction(action);
    } else {
      Alert.alert(title, msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: isApprove ? '✓ Approve' : '✗ Reject', style: isApprove ? 'default' : 'destructive', onPress: () => performAction(action) },
      ]);
    }
  }

  async function performAction(action) {
    try {
      setProcessing(true);
      const { error } = await supabase
        .from('provider_billing')
        .update({ gst_status: action, gst_reviewed_at: new Date().toISOString(), gst_review_notes: notes.trim() || null })
        .eq('id', selected.id);
      if (error) throw error;

      if (selected.provider_user_id) {
        await notifyGstReviewed(selected.provider_user_id, action === 'verified');
      }

      setSelected(null);
      setNotes('');
      await fetchRows();
      showAlert(action === 'verified' ? 'Approved ✓' : 'Rejected', action === 'verified' ? 'GST marked as verified and the provider was notified.' : 'The provider was notified with your note.');
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setProcessing(false);
    }
  }

  if (selected) {
    return (
      <SafeAreaView style={s.container}>
        <AppHeader title="Review GST" onBack={() => setSelected(null)} theme={theme} navigation={navigation} />
        <View style={s.detail}>
          <Text style={s.detailBusiness}>{selected.business_name || 'Unnamed business'}</Text>
          <Text style={s.detailCity}>{selected.city || ''}</Text>

          <View style={s.gstinRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>GSTIN</Text>
              <Text style={s.gstinValue} selectable>{selected.gstin}</Text>
            </View>
            <TouchableOpacity style={s.copyBtn} onPress={copyGstin}>
              <Text style={s.copyBtnText}>Copy</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.portalBtn} onPress={() => Linking.openURL(GST_PORTAL_URL)}>
            <Text style={s.portalBtnText}>Open GST portal ↗</Text>
          </TouchableOpacity>
          <Text style={s.portalHint}>Paste the copied GSTIN into the portal's search box to check it against the public GST record.</Text>

          <Text style={s.label}>GST certificate</Text>
          {certUrl ? (
            <TouchableOpacity style={s.viewDocBtn} onPress={() => Linking.openURL(certUrl)}>
              <Text style={s.viewDocBtnText}>View uploaded certificate ↗</Text>
            </TouchableOpacity>
          ) : (
            <Text style={s.noDoc}>No certificate uploaded</Text>
          )}

          <Text style={s.label}>Notes {selected.gst_status !== 'verified' && <Text style={{ color: theme.textTertiary, fontWeight: '400' }}>(required to reject)</Text>}</Text>
          <TextInput
            style={s.notesInput}
            placeholder="Shown to the provider — especially important if rejecting"
            placeholderTextColor={theme.textTertiary}
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          <View style={s.actionRow}>
            <TouchableOpacity style={[s.rejectBtn, processing && { opacity: 0.6 }]} onPress={() => confirmAction('rejected')} disabled={processing}>
              <Text style={s.rejectBtnText}>✗ Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.approveBtn, processing && { opacity: 0.6 }]} onPress={() => confirmAction('verified')} disabled={processing}>
              {processing ? <ActivityIndicator color="#FFF" /> : <Text style={s.approveBtnText}>✓ Approve</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="GST review" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      <View style={s.tabRow}>
        {TABS.map(tab => (
          <TouchableOpacity key={tab} style={[s.tab, activeTab === tab && s.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>{tab[0].toUpperCase() + tab.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.centerBox}><ActivityIndicator size="large" color={theme.accent} /></View>
      ) : rows.length === 0 ? (
        <View style={s.centerBox}>
          <Text style={s.emptyIcon}>🧾</Text>
          <Text style={s.emptyText}>No {activeTab === 'all' ? '' : activeTab} GST submissions</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchRows(); }} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.row} onPress={() => openDetail(item)}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowBusiness}>{item.business_name || 'Unnamed business'}</Text>
                <Text style={s.rowGstin}>{item.gstin} · {item.city || '—'}</Text>
              </View>
              <Text style={s.rowArrow}>›</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyIcon: { fontSize: 44, marginBottom: 10 },
    emptyText: { fontSize: 14, color: theme.textSecondary },

    tabRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, gap: 8 },
    tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border },
    tabActive: { backgroundColor: theme.text, borderColor: theme.text },
    tabText: { fontSize: 12.5, fontWeight: '600', color: theme.textSecondary },
    tabTextActive: { color: theme.bg },

    row: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: theme.cardBg, borderRadius: 14,
      padding: 15, marginBottom: 10, borderWidth: 0.5, borderColor: theme.border,
    },
    rowBusiness: { fontSize: 14.5, fontWeight: '700', color: theme.text },
    rowGstin: { fontSize: 12.5, color: theme.textSecondary, marginTop: 3, letterSpacing: 0.5 },
    rowArrow: { fontSize: 20, color: theme.textTertiary },

    detail: { flex: 1, padding: 20 },
    detailBusiness: { fontSize: 19, fontWeight: '700', color: theme.text },
    detailCity: { fontSize: 13, color: theme.textSecondary, marginBottom: 20 },

    label: { fontSize: 12, fontWeight: '700', color: theme.textSecondary, marginBottom: 6, marginTop: 16 },
    gstinRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, backgroundColor: theme.cardBg, borderRadius: 14, padding: 14, borderWidth: 0.5, borderColor: theme.border },
    gstinValue: { fontSize: 16, fontWeight: '700', color: theme.text, letterSpacing: 1 },
    copyBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: theme.accent },
    copyBtnText: { fontSize: 12.5, fontWeight: '700', color: theme.accent },

    portalBtn: { backgroundColor: theme.btnPrimary, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 12 },
    portalBtnText: { color: theme.btnPrimaryText, fontSize: 14, fontWeight: '700' },
    portalHint: { fontSize: 11.5, color: theme.textTertiary, marginTop: 8, lineHeight: 16 },

    viewDocBtn: { backgroundColor: theme.cardBg, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 0.5, borderColor: theme.border },
    viewDocBtnText: { fontSize: 13.5, fontWeight: '700', color: theme.accent },
    noDoc: { fontSize: 13, color: theme.textTertiary, fontStyle: 'italic' },

    notesInput: { backgroundColor: theme.bgSecondary, borderRadius: 12, padding: 14, fontSize: 14, borderWidth: 0.5, borderColor: theme.border, color: theme.text, minHeight: 90, textAlignVertical: 'top' },

    actionRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
    rejectBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#C62828', alignItems: 'center' },
    rejectBtnText: { fontSize: 14, fontWeight: '700', color: '#C62828' },
    approveBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: '#2E7D32', alignItems: 'center' },
    approveBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  });
}
