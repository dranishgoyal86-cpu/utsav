import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, FlatList, Modal, ActivityIndicator, Platform, KeyboardAvoidingView, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import { ArrowLeft, X } from 'phosphor-react-native';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { showAlert } from '../../helpers';
import { computeEventMedian, computeReciprocityFlags, summarizeReturnGifts } from '../../lib/reciprocity';
import { useEventCapabilities } from '../../hooks/useEventCapabilities';
import { isEnabled } from '../../lib/capabilities';
import CapabilityBlocked from '../../components/CapabilityBlocked';
import AppHeader from '../../components/AppHeader';
import DesktopEventShell from '../../components/desktop/DesktopEventShell';
import { useEventShellData } from '../../hooks/useEventShellData';
import { SectionEyebrow } from '../../components/desktop/DesktopKit';
import { TEXT } from '../../lib/desktopTheme';

const DESKTOP_BREAKPOINT = 768;

// CSV export needs a real file (so the host can open it in Excel/Sheets),
// which is a native-only capability in this codebase's established
// convention — GuestList.js gates expo-file-system the same way, only
// require()'d off the module's own top level when not on web.
let FileSystem;
if (Platform.OS !== 'web') {
  FileSystem = require('expo-file-system/legacy');
}

const SUGGESTED_TIERS = [
  { name: 'Premium', description: 'e.g. silver coin or dry fruit box', estimated_value: 800, is_default: false },
  { name: 'Standard', description: 'e.g. mithai box', estimated_value: 250, is_default: true },
  { name: 'Children', description: 'e.g. sweet packet or small toy', estimated_value: 100, is_default: false },
];

const STATUS_OPTIONS = [
  { key: 'pending', label: 'Pending' },
  { key: 'given', label: 'Given at event' },
  { key: 'to_be_posted', label: 'To be posted' },
  { key: 'posted', label: 'Posted' },
  { key: 'not_applicable', label: 'Not applicable' },
];
const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map(o => [o.key, o.label]));

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'given', label: 'Given' },
  { key: 'posted', label: 'Posted' },
];

function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export default function ReturnGifts({ route, navigation }) {
  const { eventId } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const { event, guestCount, currentUserName } = useEventShellData(eventId);

  const [guests, setGuests] = useState([]);
  const [gifts, setGifts] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [returnGifts, setReturnGifts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [creatingDefaults, setCreatingDefaults] = useState(false);
  const [customTierModal, setCustomTierModal] = useState(false);
  const [customTierName, setCustomTierName] = useState('');
  const [customTierDesc, setCustomTierDesc] = useState('');
  const [customTierValue, setCustomTierValue] = useState('');
  const [savingCustomTier, setSavingCustomTier] = useState(false);

  const [statusFilter, setStatusFilter] = useState('all');
  const [pickerGuestId, setPickerGuestId] = useState(null);
  const [pickerType, setPickerType] = useState(null); // 'tier' | 'status'
  const [trackingModalGuestId, setTrackingModalGuestId] = useState(null);
  const [trackingInput, setTrackingInput] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    try {
      setLoading(true);
      const [guestsRes, giftsRes, tiersRes, rgRes] = await Promise.all([
        supabase.from('event_invitees').select('id, name, phone').eq('event_id', eventId),
        supabase.from('gift_stickers').select('guest_id, gift_type, amount, item_description').eq('event_id', eventId).not('guest_id', 'is', null),
        supabase.from('return_gift_tiers').select('*').eq('event_id', eventId).order('estimated_value', { ascending: true }),
        supabase.from('return_gifts').select('*').eq('event_id', eventId),
      ]);
      if (guestsRes.error) throw guestsRes.error;
      if (giftsRes.error) throw giftsRes.error;
      if (tiersRes.error) throw tiersRes.error;
      if (rgRes.error) throw rgRes.error;
      setGuests(guestsRes.data || []);
      setGifts(giftsRes.data || []);
      setTiers(tiersRes.data || []);
      setReturnGifts(rgRes.data || []);
    } catch (err) {
      console.log('fetchAll error:', err.message);
      showAlert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  // Every guest gets the default tier on first load — settles itself after
  // one extra pass (newly-inserted rows make `missing` empty next render),
  // never loops.
  useEffect(() => {
    if (loading || tiers.length === 0 || guests.length === 0) return;
    const defaultTier = tiers.find(t => t.is_default) || tiers[0];
    const assignedIds = new Set(returnGifts.map(rg => rg.guest_id));
    const missing = guests.filter(g => !assignedIds.has(g.id));
    if (missing.length === 0) return;
    (async () => {
      try {
        const rows = missing.map(g => ({ event_id: eventId, guest_id: g.id, tier_id: defaultTier.id, status: 'pending' }));
        const { data, error } = await supabase.from('return_gifts').insert(rows).select();
        if (error) throw error;
        setReturnGifts(prev => [...prev, ...(data || [])]);
      } catch (err) {
        console.log('default tier assignment error:', err.message);
      }
    })();
  }, [loading, tiers, guests, returnGifts]);

  async function createSuggestedTiers() {
    setCreatingDefaults(true);
    try {
      const rows = SUGGESTED_TIERS.map((t, i) => ({
        event_id: eventId, name: t.name, description: t.description,
        estimated_value: t.estimated_value, is_default: t.is_default, sort_order: i,
      }));
      const { data, error } = await supabase.from('return_gift_tiers').insert(rows).select();
      if (error) throw error;
      setTiers((data || []).sort((a, b) => (a.estimated_value || 0) - (b.estimated_value || 0)));
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setCreatingDefaults(false);
    }
  }

  async function saveCustomTier() {
    if (!customTierName.trim()) {
      showAlert('Required', 'Enter a tier name.');
      return;
    }
    setSavingCustomTier(true);
    try {
      const { data, error } = await supabase.from('return_gift_tiers').insert({
        event_id: eventId,
        name: customTierName.trim(),
        description: customTierDesc.trim() || null,
        estimated_value: customTierValue ? parseInt(customTierValue, 10) : null,
        is_default: tiers.length === 0,
        sort_order: tiers.length,
      }).select().single();
      if (error) throw error;
      setTiers(prev => [...prev, data].sort((a, b) => (a.estimated_value || 0) - (b.estimated_value || 0)));
      setCustomTierModal(false);
      setCustomTierName(''); setCustomTierDesc(''); setCustomTierValue('');
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSavingCustomTier(false);
    }
  }

  const returnGiftByGuest = useMemo(() => new Map(returnGifts.map(rg => [rg.guest_id, rg])), [returnGifts]);
  const guestsById = useMemo(() => new Map(guests.map(g => [g.id, g])), [guests]);
  const giftByGuest = useMemo(() => {
    const map = new Map();
    gifts.forEach(g => { if (g.guest_id && !map.has(g.guest_id)) map.set(g.guest_id, g); });
    return map;
  }, [gifts]);

  const enrichedGifts = useMemo(
    () => gifts.map(g => ({ ...g, guestName: guestsById.get(g.guest_id)?.name || '' })),
    [gifts, guestsById]
  );
  const median = useMemo(() => computeEventMedian(enrichedGifts), [enrichedGifts]);
  const flags = useMemo(
    () => computeReciprocityFlags(enrichedGifts, returnGifts, tiers, median),
    [enrichedGifts, returnGifts, tiers, median]
  );
  const summary = useMemo(() => summarizeReturnGifts(guests, returnGifts, tiers), [guests, returnGifts, tiers]);

  const guestsSorted = useMemo(
    () => [...guests].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [guests]
  );
  const displayedGuests = useMemo(() => {
    if (statusFilter === 'all') return guestsSorted;
    return guestsSorted.filter(g => {
      const status = returnGiftByGuest.get(g.id)?.status || 'pending';
      if (statusFilter === 'posted') return status === 'posted' || status === 'to_be_posted';
      return status === statusFilter;
    });
  }, [guestsSorted, returnGiftByGuest, statusFilter]);

  async function applyTierAssignment(guestId, tierId) {
    setReturnGifts(prev => prev.map(rg => rg.guest_id === guestId ? { ...rg, tier_id: tierId } : rg));
    try {
      const { error } = await supabase.from('return_gifts').update({ tier_id: tierId }).eq('event_id', eventId).eq('guest_id', guestId);
      if (error) throw error;
    } catch (err) {
      showAlert('Error', err.message);
    }
  }

  async function applyStatus(guestId, status) {
    setReturnGifts(prev => prev.map(rg => rg.guest_id === guestId ? { ...rg, status } : rg));
    try {
      const patch = { status };
      if (status === 'given') patch.given_at = new Date().toISOString();
      const { error } = await supabase.from('return_gifts').update(patch).eq('event_id', eventId).eq('guest_id', guestId);
      if (error) throw error;
    } catch (err) {
      showAlert('Error', err.message);
    }
  }

  function closePicker() { setPickerGuestId(null); setPickerType(null); }

  function selectFromPicker(value) {
    if (!pickerGuestId) return;
    if (pickerType === 'tier') applyTierAssignment(pickerGuestId, value);
    else if (pickerType === 'status') {
      applyStatus(pickerGuestId, value);
      if (value === 'posted') {
        setTrackingInput(returnGiftByGuest.get(pickerGuestId)?.courier_tracking || '');
        setTrackingModalGuestId(pickerGuestId);
      }
    }
    closePicker();
  }

  async function saveTracking() {
    if (!trackingModalGuestId) return;
    const guestId = trackingModalGuestId;
    setReturnGifts(prev => prev.map(rg => rg.guest_id === guestId ? { ...rg, courier_tracking: trackingInput.trim() || null } : rg));
    setTrackingModalGuestId(null);
    try {
      const { error } = await supabase.from('return_gifts').update({ courier_tracking: trackingInput.trim() || null }).eq('event_id', eventId).eq('guest_id', guestId);
      if (error) throw error;
    } catch (err) {
      showAlert('Error', err.message);
    }
  }

  function upgradeTier(flag) {
    applyTierAssignment(flag.guestId, flag.suggestedTierId);
  }

  async function dismissSuggestion(flag) {
    setReturnGifts(prev => prev.map(rg => rg.guest_id === flag.guestId ? { ...rg, suggestion_dismissed: true } : rg));
    try {
      const { error } = await supabase.from('return_gifts').update({ suggestion_dismissed: true }).eq('event_id', eventId).eq('guest_id', flag.guestId);
      if (error) throw error;
    } catch (err) {
      showAlert('Error', err.message);
    }
  }

  async function exportCsv() {
    if (Platform.OS === 'web') {
      showAlert('Not available on web', 'CSV export works in the Utsav mobile app.');
      return;
    }
    setExporting(true);
    try {
      const header = ['Guest name', 'Phone', 'Gift type', 'Amount', 'Return gift tier', 'Return gift status', 'Courier tracking', 'Notes'];
      const rows = guestsSorted.map(g => {
        const rg = returnGiftByGuest.get(g.id);
        const gift = giftByGuest.get(g.id);
        const tier = tiers.find(t => t.id === rg?.tier_id);
        return [
          g.name, g.phone || '',
          gift?.gift_type || '', gift?.amount ?? '',
          tier?.name || '', STATUS_LABEL[rg?.status || 'pending'],
          rg?.courier_tracking || '', rg?.notes || '',
        ].map(csvEscape).join(',');
      });
      const csv = [header.map(csvEscape).join(','), ...rows].join('\n');
      const fileUri = FileSystem.documentDirectory + `return-gifts-${eventId}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Return gifts export', UTI: 'public.comma-separated-values-text' });
      } else {
        showAlert('Saved', 'CSV file created.');
      }
    } catch (err) {
      console.log('exportCsv error:', err.message);
      showAlert('Error', err.message || 'Could not export CSV.');
    } finally {
      setExporting(false);
    }
  }

  const capabilities = useEventCapabilities(eventId);

  if (loading || capabilities.loading) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (!isEnabled(capabilities, 'return_gifts')) {
    return <CapabilityBlocked navigation={navigation} />;
  }

  // Falls back to the plain "Return gifts" name when the event type has no
  // contextual_labels override — same field the capability resolver already
  // computes for every screen, just reused here for the header text.
  const headerLabel = capabilities.byKey.return_gifts?.label || 'Return gifts';

  // Same content either way -- real tier-assignment/reciprocity logic, so
  // shared rather than duplicated a second time (same call as PlanView.js/
  // GatePass.js/BookingsScreen.js).
  const body = (
    <>
        {tiers.length === 0 ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Set up return gift tiers</Text>
            <Text style={s.cardHint}>Create tiers first — every guest gets assigned the default one to start.</Text>
            {SUGGESTED_TIERS.map(t => (
              <View key={t.name} style={s.suggestedTierRow}>
                <Text style={s.suggestedTierName}>{t.name}{t.is_default ? ' · default' : ''}</Text>
                <Text style={s.suggestedTierDesc}>{t.description} · ₹{t.estimated_value}</Text>
              </View>
            ))}
            <TouchableOpacity style={s.saveBtn} onPress={createSuggestedTiers} disabled={creatingDefaults}>
              {creatingDefaults ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.saveBtnText}>Create these 3 tiers</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.linkBtn} onPress={() => setCustomTierModal(true)}>
              <Text style={s.linkBtnText}>+ Add a custom tier instead</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── Summary ── */}
            <View style={s.statsRow}>
              <View style={s.statCard}><Text style={s.statValue}>{summary.pending}</Text><Text style={s.statLabel}>Pending</Text></View>
              <View style={s.statCard}><Text style={s.statValue}>{summary.given}</Text><Text style={s.statLabel}>Given</Text></View>
              <View style={s.statCard}><Text style={s.statValue}>{summary.posted}</Text><Text style={s.statLabel}>Posted</Text></View>
              <View style={s.statCard}><Text style={s.statValue}>₹{summary.totalEstimatedCost.toLocaleString('en-IN')}</Text><Text style={s.statLabel}>Est. cost</Text></View>
            </View>

            <View style={s.rowGap}>
              <TouchableOpacity style={s.linkBtn} onPress={() => setCustomTierModal(true)}>
                <Text style={s.linkBtnText}>+ Add tier</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.linkBtn} onPress={exportCsv} disabled={exporting}>
                {exporting ? <ActivityIndicator size="small" color={theme.accent} /> : <Text style={s.linkBtnText}>Export CSV</Text>}
              </TouchableOpacity>
            </View>

            {/* ── Reciprocity suggestions ── */}
            {flags.length > 0 && (
              <View>
                <Text style={s.sectionLabel}>Suggestions</Text>
                <Text style={s.cardHint}>
                  These guests gave notably more than typical at this event — shown so you can acknowledge them if you wish.
                </Text>
                <View style={{ gap: 10, marginTop: 10 }}>
                  {flags.map(flag => {
                    const currentTier = tiers.find(t => t.id === flag.currentTierId);
                    const suggestedTier = tiers.find(t => t.id === flag.suggestedTierId);
                    return (
                      <View
                        key={flag.guestId}
                        style={[s.suggestionCard, flag.level === 'high' ? s.suggestionCardHigh : s.suggestionCardModerate]}
                      >
                        <Text style={s.suggestionGuestName}>{flag.guestName}</Text>
                        <Text style={s.suggestionReason}>{flag.reason}</Text>
                        <Text style={s.suggestionTierLine}>
                          {currentTier?.name || 'No tier'} → {suggestedTier?.name || '—'}
                        </Text>
                        <View style={s.rowGap}>
                          <TouchableOpacity style={s.suggestionUpgradeBtn} onPress={() => upgradeTier(flag)}>
                            <Text style={s.suggestionUpgradeBtnText}>Upgrade tier</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.suggestionDismissBtn} onPress={() => dismissSuggestion(flag)}>
                            <Text style={s.suggestionDismissBtnText}>Dismiss</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ── Guest list ── */}
            <View>
              <Text style={s.sectionLabel}>Guests</Text>
              <View style={s.chipsWrap}>
                {FILTER_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[s.filterChip, statusFilter === opt.key && s.filterChipActive]}
                    onPress={() => setStatusFilter(opt.key)}
                  >
                    <Text style={[s.filterChipText, statusFilter === opt.key && s.filterChipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {guests.length === 0 ? (
                <Text style={s.cardHint}>No guests on this event yet.</Text>
              ) : (
                <View style={{ gap: 10, marginTop: 12 }}>
                  {displayedGuests.map(g => {
                    const rg = returnGiftByGuest.get(g.id);
                    const tier = tiers.find(t => t.id === rg?.tier_id);
                    const status = rg?.status || 'pending';
                    return (
                      <View key={g.id} style={s.guestRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.guestRowName}>{g.name}</Text>
                          {status === 'posted' && rg?.courier_tracking ? (
                            <Text style={s.guestRowTracking}>Tracking: {rg.courier_tracking}</Text>
                          ) : null}
                        </View>
                        <TouchableOpacity
                          style={s.pickerChip}
                          onPress={() => { setPickerGuestId(g.id); setPickerType('tier'); }}
                        >
                          <Text style={s.pickerChipText}>{tier?.name || 'No tier'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={s.pickerChip}
                          onPress={() => { setPickerGuestId(g.id); setPickerType('status'); }}
                        >
                          <Text style={s.pickerChipText}>{STATUS_LABEL[status]}</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        )}
    </>
  );

  const modalsEl = (
    <>
      {/* ── Tier/status picker ── */}
      <Modal visible={!!pickerGuestId} transparent animationType="fade" onRequestClose={closePicker}>
        <View style={s.overlay}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{pickerType === 'tier' ? 'Assign tier' : 'Set status'}</Text>
              <TouchableOpacity onPress={closePicker}><X size={20} color={theme.text} /></TouchableOpacity>
            </View>
            <FlatList
              data={pickerType === 'tier' ? tiers : STATUS_OPTIONS}
              keyExtractor={item => pickerType === 'tier' ? item.id : item.key}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={s.pickerOptionRow}
                  onPress={() => selectFromPicker(pickerType === 'tier' ? item.id : item.key)}
                >
                  <Text style={s.pickerOptionText}>
                    {pickerType === 'tier' ? `${item.name}${item.estimated_value ? ` · ₹${item.estimated_value}` : ''}` : item.label}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* ── Courier tracking ── */}
      <Modal visible={!!trackingModalGuestId} transparent animationType="fade" onRequestClose={() => setTrackingModalGuestId(null)}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Courier tracking</Text>
              <TouchableOpacity onPress={() => setTrackingModalGuestId(null)}><X size={20} color={theme.text} /></TouchableOpacity>
            </View>
            <TextInput
              style={s.input}
              placeholder="Tracking number (optional)"
              placeholderTextColor={theme.textTertiary}
              value={trackingInput}
              onChangeText={setTrackingInput}
              autoFocus
            />
            <TouchableOpacity style={s.saveBtn} onPress={saveTracking}>
              <Text style={s.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Custom tier ── */}
      <Modal visible={customTierModal} transparent animationType="fade" onRequestClose={() => setCustomTierModal(false)}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>New tier</Text>
              <TouchableOpacity onPress={() => setCustomTierModal(false)}><X size={20} color={theme.text} /></TouchableOpacity>
            </View>
            <TextInput style={s.input} placeholder="Tier name *" placeholderTextColor={theme.textTertiary} value={customTierName} onChangeText={setCustomTierName} />
            <TextInput style={[s.input, { marginTop: 10 }]} placeholder="Description (optional)" placeholderTextColor={theme.textTertiary} value={customTierDesc} onChangeText={setCustomTierDesc} />
            <TextInput style={[s.input, { marginTop: 10 }]} placeholder="Estimated value ₹ (optional)" placeholderTextColor={theme.textTertiary} value={customTierValue} onChangeText={setCustomTierValue} keyboardType="number-pad" />
            <TouchableOpacity style={s.saveBtn} onPress={saveCustomTier} disabled={savingCustomTier}>
              {savingCustomTier ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.saveBtnText}>Add tier</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );

  if (isDesktopWeb) {
    return (
      <DesktopEventShell activeItem="gifts" event={event} guestCount={guestCount} currentUserName={currentUserName} navigation={navigation}>
        <SectionEyebrow>GIFTS</SectionEyebrow>
        <Text style={ds.title}>{headerLabel}</Text>
        <View style={ds.body}>{body}</View>
        {modalsEl}
      </DesktopEventShell>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title={headerLabel} onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {body}
      </ScrollView>
      {modalsEl}
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

    card: {
      backgroundColor: theme.cardBg, borderRadius: 14, padding: 16,
      borderWidth: 0.5, borderColor: theme.border,
    },
    cardTitle: { fontSize: 15, fontWeight: '700', color: theme.text },
    cardHint: { fontSize: 12.5, color: theme.textSecondary, marginTop: 4, lineHeight: 18 },

    suggestedTierRow: { marginTop: 14 },
    suggestedTierName: { fontSize: 14, fontWeight: '700', color: theme.text },
    suggestedTierDesc: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },

    saveBtn: { backgroundColor: theme.btnPrimary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
    saveBtnText: { fontSize: 14.5, fontWeight: '700', color: theme.btnPrimaryText },
    linkBtn: { paddingVertical: 10 },
    linkBtnText: { fontSize: 13, fontWeight: '700', color: theme.accent },

    rowGap: { flexDirection: 'row', alignItems: 'center', gap: 16 },

    statsRow: { flexDirection: 'row', gap: 8 },
    statCard: {
      flex: 1, alignItems: 'center', backgroundColor: theme.cardBg, borderRadius: 14, paddingVertical: 12,
      borderWidth: 0.5, borderColor: theme.border,
    },
    statValue: { fontSize: 15, fontWeight: '800', color: theme.text },
    statLabel: { fontSize: 10, color: theme.textSecondary, marginTop: 2, textAlign: 'center' },

    sectionLabel: { fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 6 },

    suggestionCard: {
      backgroundColor: theme.cardBg, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: theme.border,
    },
    suggestionCardHigh: { borderColor: theme.accent },
    suggestionCardModerate: { borderColor: theme.border },
    suggestionGuestName: { fontSize: 14.5, fontWeight: '700', color: theme.text },
    suggestionReason: { fontSize: 12.5, color: theme.textSecondary, marginTop: 3 },
    suggestionTierLine: { fontSize: 12.5, color: theme.text, marginTop: 8, fontWeight: '600' },
    suggestionUpgradeBtn: { backgroundColor: theme.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, marginTop: 12 },
    suggestionUpgradeBtnText: { fontSize: 12.5, fontWeight: '700', color: '#fff' },
    suggestionDismissBtn: {
      borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, marginTop: 12,
      backgroundColor: theme.bgSecondary, borderWidth: 0.5, borderColor: theme.border,
    },
    suggestionDismissBtnText: { fontSize: 12.5, fontWeight: '700', color: theme.textSecondary },

    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    filterChip: {
      paddingHorizontal: 13, paddingVertical: 8, borderRadius: 16,
      backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border,
    },
    filterChipActive: { backgroundColor: theme.accent + '18', borderColor: theme.accent },
    filterChipText: { fontSize: 12.5, fontWeight: '600', color: theme.textSecondary },
    filterChipTextActive: { color: theme.accent },

    guestRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: theme.cardBg, borderRadius: 14, padding: 12,
      borderWidth: 0.5, borderColor: theme.border,
    },
    guestRowName: { fontSize: 14, fontWeight: '700', color: theme.text },
    guestRowTracking: { fontSize: 11, color: theme.textSecondary, marginTop: 2 },
    pickerChip: {
      backgroundColor: theme.bgSecondary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
      borderWidth: 0.5, borderColor: theme.border,
    },
    pickerChipText: { fontSize: 11.5, fontWeight: '600', color: theme.text },

    overlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 },
    modal: { backgroundColor: theme.cardBg, borderRadius: 20, padding: 24, maxHeight: '75%' },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    modalTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
    pickerOptionRow: { paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    pickerOptionText: { fontSize: 14.5, color: theme.text, fontWeight: '600' },
    input: {
      backgroundColor: theme.bgSecondary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 14, color: theme.text, borderWidth: 0.5, borderColor: theme.border,
    },
  });
}

// Desktop: title chrome only -- `body`'s real tier/reciprocity logic keeps
// its proven mobile styling (`s`), same trade-off as PlanView/GatePass.
const ds = StyleSheet.create({
  title: { fontFamily: 'Fraunces-SemiBold', fontSize: 24, color: TEXT, marginTop: 2, marginBottom: 20 },
  body: { maxWidth: 720 },
});
