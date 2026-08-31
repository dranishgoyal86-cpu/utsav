import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, X, MagnifyingGlass } from 'phosphor-react-native';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { showAlert } from '../../helpers';
import AppHeader from '../../components/AppHeader';
import DesktopStandalonePage from '../../components/desktop/DesktopStandalonePage';
import { MAROON, CARD, LINE, TEXT, MUTED, CREAM, OK, OK_BG } from '../../lib/desktopTheme';

const DESKTOP_BREAKPOINT = 768;

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'unsettled', label: 'Unsettled' },
  { key: 'settled', label: 'Settled' },
];

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Cross-event — not scoped to route.params.event at all, this spans
// everything the host has ever recorded (the digital bahi khata).
export default function ReciprocityLedger({ navigation }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;

  const [entries, setEntries] = useState([]);
  const [eventNameById, setEventNameById] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const [settleModalEntry, setSettleModalEntry] = useState(null);
  const [settleNote, setSettleNote] = useState('');
  const [savingSettle, setSavingSettle] = useState(false);

  useEffect(() => { fetchEntries(); }, []);

  async function fetchEntries() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [ledgerRes, eventsRes] = await Promise.all([
        supabase.from('reciprocity_ledger').select('*').eq('host_id', user.id),
        supabase.from('events').select('id, name').eq('host_id', user.id),
      ]);
      if (ledgerRes.error) throw ledgerRes.error;
      if (eventsRes.error) throw eventsRes.error;
      setEntries(ledgerRes.data || []);
      setEventNameById(new Map((eventsRes.data || []).map(e => [e.id, e.name])));
    } catch (err) {
      console.log('fetchEntries error:', err.message);
      showAlert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  // Reads gift_stickers across every event this host owns and creates a
  // ledger entry for any (event, guest) pair not already present — guest
  // name/phone are copied as plain text onto the ledger row so it survives
  // even if the source event or guest is later deleted (both FKs are
  // ON DELETE SET NULL, not CASCADE, for exactly this reason).
  async function syncFromEvents() {
    setSyncing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in.');

      const { data: myEvents, error: eventsErr } = await supabase
        .from('events').select('id, name, event_date').eq('host_id', user.id);
      if (eventsErr) throw eventsErr;
      const eventIds = (myEvents || []).map(e => e.id);
      if (eventIds.length === 0) {
        showAlert('Nothing to sync', "You don't have any events yet.");
        return;
      }
      const eventById = new Map((myEvents || []).map(e => [e.id, e]));

      const { data: stickers, error: stickersErr } = await supabase
        .from('gift_stickers').select('*').in('event_id', eventIds).not('guest_id', 'is', null);
      if (stickersErr) throw stickersErr;

      const guestIds = [...new Set((stickers || []).map(s => s.guest_id))];
      let guestById = new Map();
      if (guestIds.length > 0) {
        const { data: guestRows, error: guestErr } = await supabase
          .from('event_invitees').select('id, name, phone').in('id', guestIds);
        if (guestErr) throw guestErr;
        guestById = new Map((guestRows || []).map(g => [g.id, g]));
      }

      // One ledger entry per (event, guest) pair — matches return_gifts'
      // own unique(event_id, guest_id) granularity. A guest with more than
      // one physical gift bound at the same event only produces one entry
      // (the schema has no per-sticker key to dedupe on more finely).
      const existingKeys = new Set(entries.map(e => `${e.source_event_id}:${e.guest_id}`));
      const newRows = [];
      for (const sticker of stickers || []) {
        const key = `${sticker.event_id}:${sticker.guest_id}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        const guest = guestById.get(sticker.guest_id);
        const eventRow = eventById.get(sticker.event_id);
        newRows.push({
          host_id: user.id,
          guest_id: sticker.guest_id,
          source_event_id: sticker.event_id,
          guest_name: guest?.name || 'Unknown guest',
          guest_phone: guest?.phone || null,
          amount_received: (sticker.gift_type === 'cash' || sticker.gift_type === 'upi') ? sticker.amount : null,
          gift_description: sticker.gift_type === 'item' ? sticker.item_description : null,
          received_on: eventRow?.event_date || null,
        });
      }

      if (newRows.length === 0) {
        showAlert('Up to date', 'No new gifts to sync.');
        return;
      }

      const { data: inserted, error: insertErr } = await supabase.from('reciprocity_ledger').insert(newRows).select();
      if (insertErr) throw insertErr;
      setEntries(prev => [...prev, ...(inserted || [])]);
      showAlert('Synced', `Added ${inserted.length} new ledger ${inserted.length === 1 ? 'entry' : 'entries'}.`);
    } catch (err) {
      console.log('syncFromEvents error:', err.message);
      showAlert('Error', err.message);
    } finally {
      setSyncing(false);
    }
  }

  function openSettleModal(entry) {
    setSettleModalEntry(entry);
    setSettleNote(entry.settled_note || '');
  }

  async function saveSettled(nextSettled) {
    if (!settleModalEntry) return;
    const id = settleModalEntry.id;
    setSavingSettle(true);
    try {
      const patch = { is_settled: nextSettled, settled_note: settleNote.trim() || null };
      const { error } = await supabase.from('reciprocity_ledger').update(patch).eq('id', id);
      if (error) throw error;
      setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
      setSettleModalEntry(null);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSavingSettle(false);
    }
  }

  const filteredEntries = useMemo(() => {
    let list = [...entries].sort((a, b) => (a.guest_name || '').localeCompare(b.guest_name || ''));
    if (filter === 'unsettled') list = list.filter(e => !e.is_settled);
    if (filter === 'settled') list = list.filter(e => e.is_settled);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(e => (e.guest_name || '').toLowerCase().includes(q));
    }
    return list;
  }, [entries, filter, search]);

  const settleModalEl = (
    <Modal visible={!!settleModalEntry} transparent animationType="fade" onRequestClose={() => setSettleModalEntry(null)}>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{settleModalEntry?.guest_name}</Text>
            <TouchableOpacity onPress={() => setSettleModalEntry(null)}><X size={20} color={theme.text} /></TouchableOpacity>
          </View>
          <Text style={s.modalHint}>Optional note — e.g. "returned at their son's wedding, June 2027"</Text>
          <TextInput
            style={[s.input, { minHeight: 70, textAlignVertical: 'top' }]}
            placeholder="Note (optional)"
            placeholderTextColor={theme.textTertiary}
            value={settleNote}
            onChangeText={setSettleNote}
            multiline
          />
          <TouchableOpacity style={s.saveBtn} onPress={() => saveSettled(true)} disabled={savingSettle}>
            {savingSettle ? <ActivityIndicator color={theme.btnPrimaryText} /> : (
              <Text style={s.saveBtnText}>{settleModalEntry?.is_settled ? 'Update note' : 'Mark as settled'}</Text>
            )}
          </TouchableOpacity>
          {settleModalEntry?.is_settled && (
            <TouchableOpacity style={s.linkBtn} onPress={() => saveSettled(false)} disabled={savingSettle}>
              <Text style={s.linkBtnText}>Mark as unsettled instead</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  if (isDesktopWeb) {
    return (
      <DesktopStandalonePage onBack={() => navigation.goBack()} title="Gift ledger" maxWidth={1000}>
        <Text style={ds.subtitle}>Records what guests have given across every function you've hosted, so you can reciprocate at theirs later.</Text>

        <View style={ds.controlsRow}>
          <View style={ds.searchBox}>
            <MagnifyingGlass size={16} color={MUTED} />
            <TextInput style={ds.searchInput} placeholder="Search by guest name" placeholderTextColor={MUTED} value={search} onChangeText={setSearch} />
          </View>
          <View style={ds.chipsWrap}>
            {FILTER_OPTIONS.map(opt => (
              <TouchableOpacity key={opt.key} style={[ds.filterChip, filter === opt.key && ds.filterChipActive]} onPress={() => setFilter(opt.key)}>
                <Text style={[ds.filterChipText, filter === opt.key && ds.filterChipTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={ds.syncBtn} onPress={syncFromEvents} disabled={syncing}>
            {syncing ? <ActivityIndicator size="small" color={MAROON} /> : <Text style={ds.syncBtnText}>Sync from events</Text>}
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 50, alignItems: 'center' }}><ActivityIndicator color={MAROON} /></View>
        ) : entries.length === 0 ? (
          <View style={ds.emptyCard}>
            <Text style={ds.emptyTitle}>No ledger entries yet</Text>
            <Text style={ds.emptySub}>Tap "Sync from events" to pull in gifts you've already recorded via Gift Stickers.</Text>
          </View>
        ) : filteredEntries.length === 0 ? (
          <View style={ds.emptyCard}><Text style={ds.emptyTitle}>No matches</Text></View>
        ) : (
          <View style={ds.grid}>
            {filteredEntries.map(item => (
              <TouchableOpacity key={item.id} style={ds.entryCard} onPress={() => openSettleModal(item)}>
                <View style={{ flex: 1 }}>
                  <Text style={ds.entryName}>{item.guest_name}</Text>
                  <Text style={ds.entryMeta}>
                    {eventNameById.get(item.source_event_id) || 'Event no longer available'}
                    {item.received_on ? ` · ${formatDate(item.received_on)}` : ''}
                  </Text>
                  {item.is_settled && item.settled_note ? <Text style={ds.entryNote}>{item.settled_note}</Text> : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6, marginTop: 10 }}>
                  <Text style={ds.entryAmount}>{item.amount_received ? `₹${item.amount_received.toLocaleString('en-IN')}` : (item.gift_description || '—')}</Text>
                  <View style={[ds.settledBadge, item.is_settled ? ds.settledBadgeYes : ds.settledBadgeNo]}>
                    <Text style={[ds.settledBadgeText, item.is_settled ? ds.settledBadgeTextYes : ds.settledBadgeTextNo]}>{item.is_settled ? 'Settled' : 'Unsettled'}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {settleModalEl}
      </DesktopStandalonePage>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Gift ledger" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      <Text style={s.subtitle}>
        Records what guests have given across every function you've hosted, so you can reciprocate at theirs later.
      </Text>

      <View style={s.searchBox}>
        <MagnifyingGlass size={16} color={theme.textSecondary} />
        <TextInput
          style={s.searchInput}
          placeholder="Search by guest name"
          placeholderTextColor={theme.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View style={s.filterRow}>
        <View style={s.chipsWrap}>
          {FILTER_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[s.filterChip, filter === opt.key && s.filterChipActive]}
              onPress={() => setFilter(opt.key)}
            >
              <Text style={[s.filterChipText, filter === opt.key && s.filterChipTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={s.syncBtn} onPress={syncFromEvents} disabled={syncing}>
          {syncing ? <ActivityIndicator size="small" color={theme.accent} /> : <Text style={s.syncBtnText}>Sync from events</Text>}
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} />
      ) : entries.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No ledger entries yet</Text>
          <Text style={s.emptySubtitle}>Tap "Sync from events" to pull in gifts you've already recorded via Gift Stickers.</Text>
        </View>
      ) : filteredEntries.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No matches</Text>
        </View>
      ) : (
        <FlatList
          data={filteredEntries}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.entryRow} onPress={() => openSettleModal(item)}>
              <View style={{ flex: 1 }}>
                <Text style={s.entryName}>{item.guest_name}</Text>
                <Text style={s.entryMeta}>
                  {eventNameById.get(item.source_event_id) || 'Event no longer available'}
                  {item.received_on ? ` · ${formatDate(item.received_on)}` : ''}
                </Text>
                {item.is_settled && item.settled_note ? <Text style={s.entryNote}>{item.settled_note}</Text> : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={s.entryAmount}>
                  {item.amount_received ? `₹${item.amount_received.toLocaleString('en-IN')}` : (item.gift_description || '—')}
                </Text>
                <View style={[s.settledBadge, item.is_settled ? s.settledBadgeYes : s.settledBadgeNo]}>
                  <Text style={[s.settledBadgeText, item.is_settled ? s.settledBadgeTextYes : s.settledBadgeTextNo]}>
                    {item.is_settled ? 'Settled' : 'Unsettled'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {settleModalEl}
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
      borderBottomWidth: 0.5, borderBottomColor: theme.border,
    },
    headerTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
    backBtn: { padding: 4 },
    subtitle: { fontSize: 12.5, color: theme.textSecondary, paddingHorizontal: 20, paddingTop: 12, lineHeight: 18 },

    searchBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 14,
      backgroundColor: theme.cardBg, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
      borderWidth: 0.5, borderColor: theme.border,
    },
    searchInput: { flex: 1, fontSize: 14, color: theme.text },

    filterRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginHorizontal: 16, marginTop: 12, gap: 10,
    },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, flex: 1 },
    filterChip: {
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
      backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border,
    },
    filterChipActive: { backgroundColor: theme.accent + '18', borderColor: theme.accent },
    filterChipText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
    filterChipTextActive: { color: theme.accent },
    syncBtn: { paddingVertical: 6 },
    syncBtnText: { fontSize: 12, fontWeight: '700', color: theme.accent },

    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyTitle: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 6 },
    emptySubtitle: { fontSize: 12.5, color: theme.textSecondary, textAlign: 'center', lineHeight: 18 },

    entryRow: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      backgroundColor: theme.cardBg, borderRadius: 14, padding: 13,
      borderWidth: 0.5, borderColor: theme.border,
    },
    entryName: { fontSize: 14, fontWeight: '700', color: theme.text },
    entryMeta: { fontSize: 11.5, color: theme.textSecondary, marginTop: 2 },
    entryNote: { fontSize: 11.5, color: theme.textTertiary, marginTop: 4, fontStyle: 'italic' },
    entryAmount: { fontSize: 13.5, fontWeight: '700', color: theme.text },
    settledBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    settledBadgeYes: { backgroundColor: '#2E7D3222' },
    settledBadgeNo: { backgroundColor: theme.bgSecondary },
    settledBadgeText: { fontSize: 10, fontWeight: '700' },
    settledBadgeTextYes: { color: '#2E7D32' },
    settledBadgeTextNo: { color: theme.textSecondary },

    overlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 },
    modal: { backgroundColor: theme.cardBg, borderRadius: 20, padding: 24 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    modalTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
    modalHint: { fontSize: 12, color: theme.textSecondary, marginBottom: 10 },
    input: {
      backgroundColor: theme.bgSecondary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 14, color: theme.text, borderWidth: 0.5, borderColor: theme.border,
    },
    saveBtn: { backgroundColor: theme.btnPrimary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
    saveBtnText: { fontSize: 14.5, fontWeight: '700', color: theme.btnPrimaryText },
    linkBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
    linkBtnText: { fontSize: 12.5, fontWeight: '600', color: theme.accent },
  });
}

const ds = StyleSheet.create({
  subtitle: { fontSize: 13, color: MUTED, lineHeight: 19, marginBottom: 20, maxWidth: 640 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 22, flexWrap: 'wrap' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: CARD, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: LINE, minWidth: 260 },
  searchInput: { flex: 1, fontSize: 14, color: TEXT },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 14, backgroundColor: CARD, borderWidth: 1, borderColor: LINE },
  filterChipActive: { backgroundColor: MAROON, borderColor: MAROON },
  filterChipText: { fontSize: 12.5, fontWeight: '600', color: MUTED },
  filterChipTextActive: { color: '#fff' },
  syncBtn: { marginLeft: 'auto', paddingVertical: 10, paddingHorizontal: 14 },
  syncBtnText: { fontSize: 12.5, fontWeight: '700', color: MAROON },
  emptyCard: { backgroundColor: CARD, borderRadius: 20, borderWidth: 1, borderColor: LINE, padding: 44, alignItems: 'center', maxWidth: 480, alignSelf: 'center' },
  emptyTitle: { fontFamily: 'Fraunces-SemiBold', fontSize: 16, color: TEXT, marginBottom: 6 },
  emptySub: { fontSize: 13, color: MUTED, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  entryCard: { width: 300, backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: LINE, padding: 14 },
  entryName: { fontSize: 14.5, fontWeight: '700', color: TEXT },
  entryMeta: { fontSize: 11.5, color: MUTED, marginTop: 2 },
  entryNote: { fontSize: 11.5, color: MUTED, marginTop: 4, fontStyle: 'italic' },
  entryAmount: { fontSize: 14, fontWeight: '700', color: TEXT },
  settledBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  settledBadgeYes: { backgroundColor: OK_BG },
  settledBadgeNo: { backgroundColor: CREAM },
  settledBadgeText: { fontSize: 10, fontWeight: '700' },
  settledBadgeTextYes: { color: OK },
  settledBadgeTextNo: { color: MUTED },
});
