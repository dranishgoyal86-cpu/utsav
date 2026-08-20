import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { ArrowLeft, Star, X } from 'phosphor-react-native';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { showAlert, resolveGuestPartySize } from '../../helpers';
import { autoAssignTables } from '../../seatingLogic';
import { buildSeatingChartHtml } from '../../seatingChartTemplate';
import AppHeader from '../../components/AppHeader';

// No new event_tables table — a "table" is just an integer guests share via
// event_invitees.table_number. Tap-to-assign, not drag-and-drop: this
// codebase has zero drag-and-drop precedent (SwipeableRow's PanResponder use
// is a much simpler 1-axis swipe-reveal, not a real drop-target gesture) and
// deliberately avoids pulling in a gesture library for one feature.
export default function SeatingChart({ route, navigation }) {
  const { eventId } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const insets = useSafeAreaInsets();
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [pickerGuest, setPickerGuest] = useState(null);
  const [printing, setPrinting] = useState(false);

  useEffect(() => { fetchGuests(); }, []);

  async function fetchGuests() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Deliberately not owner_user_id-filtered — that's always the event's
      // HOST, not necessarily the viewer (a delegate reaching this screen
      // via GuestList.js's Seating chip would otherwise see nobody). RLS
      // (host-owner OR accepted event_delegates row) is what actually gates
      // access now — see supabase/migrations/event_delegates.sql.
      const { data, error } = await supabase
        .from('event_invitees').select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setGuests(data || []);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  // Seating only covers guests who are actually coming.
  const confirmedGuests = guests.filter(g => g.rsvp_status === 'yes');
  const unassigned = confirmedGuests.filter(g => !g.table_number);
  const tableNumbers = [...new Set(confirmedGuests.filter(g => g.table_number).map(g => g.table_number))].sort((a, b) => a - b);
  const maxTable = tableNumbers.length ? Math.max(...tableNumbers) : 0;

  async function assignToTable(guestId, tableNumber) {
    setGuests(prev => prev.map(g => g.id === guestId ? { ...g, table_number: tableNumber } : g));
    setPickerGuest(null);
    const { error } = await supabase.from('event_invitees').update({ table_number: tableNumber }).eq('id', guestId);
    if (error) showAlert('Error', error.message);
  }

  async function unassignFromTable(guestId) {
    setGuests(prev => prev.map(g => g.id === guestId ? { ...g, table_number: null } : g));
    const { error } = await supabase.from('event_invitees').update({ table_number: null }).eq('id', guestId);
    if (error) showAlert('Error', error.message);
  }

  async function handleAutoAssign() {
    if (unassigned.length === 0) {
      showAlert('Nothing to arrange', 'Everyone confirmed is already assigned to a table.');
      return;
    }
    setAssigning(true);
    try {
      const updates = autoAssignTables(unassigned, maxTable, 8);
      const byId = new Map(updates.map(u => [u.id, u.table_number]));
      setGuests(prev => prev.map(g => byId.has(g.id) ? { ...g, table_number: byId.get(g.id) } : g));
      await Promise.all(updates.map(u =>
        supabase.from('event_invitees').update({ table_number: u.table_number }).eq('id', u.id)
      ));
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setAssigning(false);
    }
  }

  async function handlePrint() {
    setPrinting(true);
    try {
      const tables = tableNumbers.map(n => ({
        number: n,
        guests: confirmedGuests.filter(g => g.table_number === n)
          .map(g => ({
            name: g.name, plusOnes: g.plus_ones || 0, tag: g.tag, isVip: g.is_vip,
            isHousehold: g.entry_type === 'household', partySize: resolveGuestPartySize(g),
          })),
      }));
      const { data: eventRow } = await supabase.from('events').select('name').eq('id', eventId).maybeSingle();
      const html = buildSeatingChartHtml({ eventName: eventRow?.name, tables });
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Seating chart', UTI: 'com.adobe.pdf' });
      } else {
        showAlert('Saved', 'Seating chart PDF created.');
      }
    } catch (err) {
      showAlert('Error', err.message || 'Could not create the seating chart PDF.');
    } finally {
      setPrinting(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Seating" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      {confirmedGuests.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyText}>No confirmed guests yet — seating only covers guests who RSVP'd yes.</Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={s.scroll}>
            {unassigned.length > 0 && (
              <View style={s.section}>
                <View style={s.sectionHeaderRow}>
                  <Text style={s.sectionTitle}>Unassigned ({unassigned.length})</Text>
                  <TouchableOpacity style={s.autoBtn} onPress={handleAutoAssign} disabled={assigning}>
                    {assigning ? <ActivityIndicator size="small" color={theme.accent} /> : (
                      <Text style={s.autoBtnText}>✨ Auto-arrange by group</Text>
                    )}
                  </TouchableOpacity>
                </View>
                <View style={s.chipsWrap}>
                  {unassigned.map(g => (
                    <TouchableOpacity key={g.id} style={s.guestChip} onPress={() => setPickerGuest(g)}>
                      {g.is_vip ? <Star size={11} color="#F0A93F" weight="fill" /> : null}
                      <Text style={s.guestChipText}>{g.name}{g.entry_type === 'household' ? ` 🏠${g.household_size || 1}` : (g.plus_ones > 0 ? ` +${g.plus_ones}` : '')}</Text>
                      {g.tag ? <Text style={s.guestChipTag}>{g.tag}</Text> : null}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {tableNumbers.map(n => {
              const tableGuests = confirmedGuests.filter(g => g.table_number === n);
              const seatCount = tableGuests.reduce((sum, g) => sum + resolveGuestPartySize(g), 0);
              return (
                <View key={n} style={s.section}>
                  <Text style={s.sectionTitle}>Table {n} · {seatCount} seat{seatCount !== 1 ? 's' : ''}</Text>
                  <View style={s.chipsWrap}>
                    {tableGuests.map(g => (
                      <View key={g.id} style={s.tableGuestChip}>
                        {g.is_vip ? <Star size={11} color="#F0A93F" weight="fill" /> : null}
                        <Text style={s.guestChipText}>{g.name}{g.entry_type === 'household' ? ` 🏠${g.household_size || 1}` : (g.plus_ones > 0 ? ` +${g.plus_ones}` : '')}</Text>
                        <TouchableOpacity onPress={() => unassignFromTable(g.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                          <X size={12} color={theme.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
            <View style={{ height: 90 }} />
          </ScrollView>
          <View style={[s.bottomBar, { paddingBottom: 16 + insets.bottom }]}>
            <TouchableOpacity style={s.printBtn} onPress={handlePrint} disabled={printing || tableNumbers.length === 0}>
              {printing ? <ActivityIndicator color={theme.btnPrimaryText} /> : (
                <Text style={s.printBtnText}>🖨️ Print seating chart</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Table picker — assign one guest to an existing table or a new one */}
      <Modal visible={!!pickerGuest} transparent animationType="fade" onRequestClose={() => setPickerGuest(null)}>
        <View style={s.overlay}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{pickerGuest?.name}</Text>
              <TouchableOpacity onPress={() => setPickerGuest(null)}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            <Text style={s.modalHint}>Assign to a table</Text>
            <View style={s.chipsWrap}>
              {tableNumbers.map(n => (
                <TouchableOpacity key={n} style={s.tableChip} onPress={() => assignToTable(pickerGuest.id, n)}>
                  <Text style={s.tableChipText}>Table {n}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[s.tableChip, s.tableChipNew]} onPress={() => assignToTable(pickerGuest.id, maxTable + 1)}>
                <Text style={s.tableChipNewText}>+ New table ({maxTable + 1})</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
      borderBottomWidth: 0.5, borderBottomColor: theme.border,
    },
    headerTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
    backBtn: { padding: 4 },
    scroll: { padding: 20, gap: 22 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyText: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },

    section: { gap: 10 },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { fontSize: 14.5, fontWeight: '700', color: theme.text },
    autoBtn: { paddingHorizontal: 4, paddingVertical: 4 },
    autoBtnText: { fontSize: 12.5, fontWeight: '700', color: theme.accent },

    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    guestChip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: theme.cardBg, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8,
      borderWidth: 0.5, borderColor: theme.border,
    },
    guestChipText: { fontSize: 12.5, fontWeight: '600', color: theme.text },
    guestChipTag: { fontSize: 10.5, color: theme.textSecondary },
    tableGuestChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: theme.accent + '14', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8,
      borderWidth: 0.5, borderColor: theme.accent + '40',
    },

    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: theme.bg, borderTopWidth: 0.5, borderTopColor: theme.border },
    printBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
    printBtnText: { fontSize: 15, fontWeight: '700', color: theme.btnPrimaryText },

    overlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 },
    modal: { backgroundColor: theme.cardBg, borderRadius: 20, padding: 24, gap: 12 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    modalTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
    modalHint: { fontSize: 12, color: theme.textSecondary },
    tableChip: {
      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 16,
      backgroundColor: theme.bgSecondary, borderWidth: 0.5, borderColor: theme.border,
    },
    tableChipText: { fontSize: 13, fontWeight: '600', color: theme.text },
    tableChipNew: { backgroundColor: theme.accent + '18', borderColor: theme.accent },
    tableChipNewText: { fontSize: 13, fontWeight: '700', color: theme.accent },
  });
}
