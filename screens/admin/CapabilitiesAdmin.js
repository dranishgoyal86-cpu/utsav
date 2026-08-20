import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, FlatList, ActivityIndicator, Switch, Modal, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { ArrowLeft, Plus, X, Trash } from 'phosphor-react-native';
import { showAlert, confirmDestructive } from '../../helpers';
import AppHeader from '../../components/AppHeader';
import { resolveCapabilities, resolveProviderCapabilities, isEnabled } from '../../lib/capabilities';
import { refreshCapabilityRules } from '../../hooks/useCapabilities';
import { refreshProviderCapabilityRules } from '../../hooks/useProviderCapabilities';

const TABS = [
  { id: 'event', label: 'Event rules' },
  { id: 'provider', label: 'Provider rules' },
  { id: 'tester', label: 'Rule tester' },
];

// text[] columns are edited as comma-separated text in this admin UI —
// simplest input that round-trips cleanly through Postgres arrays.
function arrToText(arr) { return (arr || []).join(', '); }
function textToArr(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  return trimmed.split(',').map(s => s.trim()).filter(Boolean);
}
function numOrNull(text) {
  const trimmed = (text || '').toString().trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

const EVENT_RULE_BLANK = {
  capability_key: '', name: '', group_key: '', priority: '0', visibility: 'gated',
  venue_types: '', event_type_slugs: '', excluded_event_type_slugs: '',
  min_guest_count: '', max_guest_count: '', min_age: '', max_age: '',
  requires_budget: false, requires_sub_events: false, requires_booking: false,
  requires_completed_booking: false, suppressed_when_dry: false, suppressed_when_veg: false,
  description: '',
};

const PROVIDER_RULE_BLANK = {
  capability_key: '', name: '', categories: '', min_service_price: '',
  requires_verified: false, min_completed_bookings: '', config_value: '', description: '',
};

export default function CapabilitiesAdmin({ navigation }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const [tab, setTab] = useState('event');

  const [eventRules, setEventRules] = useState([]);
  const [providerRules, setProviderRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editModal, setEditModal] = useState(null); // { kind: 'event'|'provider', row }
  const [form, setForm] = useState(null);

  // Rule tester state
  const [testEventTypeSlug, setTestEventTypeSlug] = useState('');
  const [testVenueType, setTestVenueType] = useState('');
  const [testGuestCount, setTestGuestCount] = useState('');
  const [testAge, setTestAge] = useState('');
  const [testDry, setTestDry] = useState(false);
  const [testVeg, setTestVeg] = useState(false);
  const [testBudget, setTestBudget] = useState(false);
  const [testSubEvents, setTestSubEvents] = useState(false);
  const [testBooking, setTestBooking] = useState(false);
  const [testCompletedBooking, setTestCompletedBooking] = useState(false);
  const [testProviderCategory, setTestProviderCategory] = useState('');

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    try {
      setLoading(true);
      const [{ data: ev, error: evErr }, { data: pv, error: pvErr }] = await Promise.all([
        supabase.from('capability_rules').select('*').order('priority', { ascending: false }),
        supabase.from('provider_capability_rules').select('*').order('capability_key', { ascending: true }),
      ]);
      if (evErr) throw evErr;
      if (pvErr) throw pvErr;
      setEventRules(ev || []);
      setProviderRules(pv || []);
    } catch (err) {
      console.log('CapabilitiesAdmin fetch error:', err.message);
      showAlert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  function openNewEvent() {
    setForm({ ...EVENT_RULE_BLANK });
    setEditModal({ kind: 'event', row: null });
  }
  function openEditEvent(row) {
    setForm({
      ...row,
      priority: String(row.priority ?? 0),
      venue_types: arrToText(row.venue_types),
      event_type_slugs: arrToText(row.event_type_slugs),
      excluded_event_type_slugs: arrToText(row.excluded_event_type_slugs),
      min_guest_count: row.min_guest_count ?? '', max_guest_count: row.max_guest_count ?? '',
      min_age: row.min_age ?? '', max_age: row.max_age ?? '',
      description: row.description || '',
    });
    setEditModal({ kind: 'event', row });
  }
  function openNewProvider() {
    setForm({ ...PROVIDER_RULE_BLANK });
    setEditModal({ kind: 'provider', row: null });
  }
  function openEditProvider(row) {
    setForm({
      ...row,
      categories: arrToText(row.categories),
      min_service_price: row.min_service_price ?? '',
      min_completed_bookings: row.min_completed_bookings ?? '',
      config_value: row.config_value ?? '',
      description: row.description || '',
    });
    setEditModal({ kind: 'provider', row });
  }

  function closeModal() { setEditModal(null); setForm(null); }

  async function saveRule() {
    if (!form.capability_key.trim() || !form.name.trim()) {
      showAlert('Missing details', 'capability_key and name are required.');
      return;
    }
    setSaving(true);
    try {
      if (editModal.kind === 'event') {
        const payload = {
          capability_key: form.capability_key.trim(),
          name: form.name.trim(),
          group_key: form.group_key?.trim() || null,
          priority: numOrNull(form.priority) ?? 0,
          visibility: form.visibility,
          venue_types: textToArr(form.venue_types),
          event_type_slugs: textToArr(form.event_type_slugs),
          excluded_event_type_slugs: textToArr(form.excluded_event_type_slugs),
          min_guest_count: numOrNull(form.min_guest_count),
          max_guest_count: numOrNull(form.max_guest_count),
          min_age: numOrNull(form.min_age),
          max_age: numOrNull(form.max_age),
          requires_budget: !!form.requires_budget,
          requires_sub_events: !!form.requires_sub_events,
          requires_booking: !!form.requires_booking,
          requires_completed_booking: !!form.requires_completed_booking,
          suppressed_when_dry: !!form.suppressed_when_dry,
          suppressed_when_veg: !!form.suppressed_when_veg,
          description: form.description?.trim() || null,
        };
        const { error } = editModal.row
          ? await supabase.from('capability_rules').update(payload).eq('id', editModal.row.id)
          : await supabase.from('capability_rules').insert(payload);
        if (error) throw error;
        refreshCapabilityRules();
      } else {
        const payload = {
          capability_key: form.capability_key.trim(),
          name: form.name.trim(),
          categories: textToArr(form.categories),
          min_service_price: numOrNull(form.min_service_price),
          requires_verified: !!form.requires_verified,
          min_completed_bookings: numOrNull(form.min_completed_bookings),
          config_value: numOrNull(form.config_value),
          description: form.description?.trim() || null,
        };
        const { error } = editModal.row
          ? await supabase.from('provider_capability_rules').update(payload).eq('id', editModal.row.id)
          : await supabase.from('provider_capability_rules').insert(payload);
        if (error) throw error;
        refreshProviderCapabilityRules();
      }
      closeModal();
      await fetchAll();
    } catch (err) {
      showAlert('Error saving rule', err.message);
    } finally {
      setSaving(false);
    }
  }

  function deleteRule(kind, row) {
    confirmDestructive(
      'Delete this rule?',
      `"${row.name}" (${row.capability_key}) will be permanently removed.`,
      'Delete',
      async () => {
        try {
          const table = kind === 'event' ? 'capability_rules' : 'provider_capability_rules';
          const { error } = await supabase.from(table).delete().eq('id', row.id);
          if (error) throw error;
          if (kind === 'event') refreshCapabilityRules(); else refreshProviderCapabilityRules();
          await fetchAll();
        } catch (err) {
          showAlert('Error', err.message);
        }
      }
    );
  }

  const testResolved = resolveCapabilities(eventRules, {
    eventTypeSlug: testEventTypeSlug.trim() || null,
    venueType: testVenueType.trim() || null,
    guestCount: numOrNull(testGuestCount),
    age: numOrNull(testAge),
    isDryEvent: testDry,
    isVegOnly: testVeg,
    hasBudget: testBudget,
    hasSubEvents: testSubEvents,
    hasBooking: testBooking,
    hasCompletedBooking: testCompletedBooking,
  });
  const testProviderResolved = resolveProviderCapabilities(providerRules, {
    category: testProviderCategory.trim() || null,
  });

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Capabilities" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      <View style={s.tabRow}>
        {TABS.map(t => (
          <TouchableOpacity key={t.id} style={[s.tabChip, tab === t.id && s.tabChipActive]} onPress={() => setTab(t.id)}>
            <Text style={[s.tabChipText, tab === t.id && s.tabChipTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      ) : tab === 'event' ? (
        <FlatList
          data={eventRules}
          keyExtractor={r => r.id}
          contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 60 }}
          ListHeaderComponent={
            <TouchableOpacity style={s.addBtn} onPress={openNewEvent}>
              <Plus size={16} color={theme.btnPrimaryText} />
              <Text style={s.addBtnText}>Add event rule</Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={s.ruleCard} onPress={() => openEditEvent(item)}>
              <View style={{ flex: 1 }}>
                <Text style={s.ruleTitle}>{item.name}</Text>
                <Text style={s.ruleMeta}>{item.capability_key} · {item.visibility}{item.group_key ? ` · group: ${item.group_key} (p${item.priority})` : ''}</Text>
              </View>
              <TouchableOpacity onPress={() => deleteRule('event', item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Trash size={17} color="#F44336" />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      ) : tab === 'provider' ? (
        <FlatList
          data={providerRules}
          keyExtractor={r => r.id}
          contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 60 }}
          ListHeaderComponent={
            <TouchableOpacity style={s.addBtn} onPress={openNewProvider}>
              <Plus size={16} color={theme.btnPrimaryText} />
              <Text style={s.addBtnText}>Add provider rule</Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={s.ruleCard} onPress={() => openEditProvider(item)}>
              <View style={{ flex: 1 }}>
                <Text style={s.ruleTitle}>{item.name}</Text>
                <Text style={s.ruleMeta}>{item.capability_key}{item.categories?.length ? ` · ${item.categories.join(', ')}` : ''}</Text>
              </View>
              <TouchableOpacity onPress={() => deleteRule('provider', item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Trash size={17} color="#F44336" />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }}>
          <Text style={s.sectionLabel}>EVENT CONTEXT</Text>
          <View style={s.testerCard}>
            <Text style={s.fieldLabel}>event_type_slug</Text>
            <TextInput style={s.input} value={testEventTypeSlug} onChangeText={setTestEventTypeSlug} placeholder="e.g. hindu-wedding" placeholderTextColor={theme.textTertiary} autoCapitalize="none" />
            <Text style={s.fieldLabel}>venue_type</Text>
            <TextInput style={s.input} value={testVenueType} onChangeText={setTestVenueType} placeholder="e.g. banquet_hall" placeholderTextColor={theme.textTertiary} autoCapitalize="none" />
            <Text style={s.fieldLabel}>guest_count</Text>
            <TextInput style={s.input} value={testGuestCount} onChangeText={setTestGuestCount} placeholder="e.g. 150" placeholderTextColor={theme.textTertiary} keyboardType="number-pad" />
            <Text style={s.fieldLabel}>age (child_age)</Text>
            <TextInput style={s.input} value={testAge} onChangeText={setTestAge} placeholder="optional" placeholderTextColor={theme.textTertiary} keyboardType="number-pad" />
            <SwitchRow label="Dry event" value={testDry} onChange={setTestDry} theme={theme} s={s} />
            <SwitchRow label="Veg only" value={testVeg} onChange={setTestVeg} theme={theme} s={s} />
            <SwitchRow label="Has budget set" value={testBudget} onChange={setTestBudget} theme={theme} s={s} />
            <SwitchRow label="Has sub-events" value={testSubEvents} onChange={setTestSubEvents} theme={theme} s={s} />
            <SwitchRow label="Has a booking" value={testBooking} onChange={setTestBooking} theme={theme} s={s} />
            <SwitchRow label="Has a completed booking" value={testCompletedBooking} onChange={setTestCompletedBooking} theme={theme} s={s} />
          </View>

          <Text style={s.sectionLabel}>RESOLVED — VISIBLE ({testResolved.visible.length})</Text>
          <View style={s.testerCard}>
            {testResolved.visible.length === 0 ? <Text style={s.emptyText}>None</Text> : testResolved.visible.map(r => (
              <Text key={r.capability_key} style={s.resultRow}>✓ {r.label} <Text style={s.resultKey}>({r.capability_key})</Text></Text>
            ))}
          </View>
          <Text style={s.sectionLabel}>RESOLVED — SECONDARY ({testResolved.secondary.length})</Text>
          <View style={s.testerCard}>
            {testResolved.secondary.length === 0 ? <Text style={s.emptyText}>None</Text> : testResolved.secondary.map(r => (
              <Text key={r.capability_key} style={s.resultRow}>• {r.label} <Text style={s.resultKey}>({r.capability_key})</Text></Text>
            ))}
          </View>

          <Text style={s.sectionLabel}>PROVIDER CONTEXT</Text>
          <View style={s.testerCard}>
            <Text style={s.fieldLabel}>category</Text>
            <TextInput style={s.input} value={testProviderCategory} onChangeText={setTestProviderCategory} placeholder="e.g. Caterers" placeholderTextColor={theme.textTertiary} />
          </View>
          <Text style={s.sectionLabel}>RESOLVED — ENABLED ({testProviderResolved.enabled.length})</Text>
          <View style={s.testerCard}>
            {testProviderResolved.enabled.length === 0 ? <Text style={s.emptyText}>None</Text> : testProviderResolved.enabled.map(r => (
              <Text key={r.capability_key} style={s.resultRow}>✓ {r.name} <Text style={s.resultKey}>({r.capability_key})</Text></Text>
            ))}
          </View>
        </ScrollView>
        </KeyboardAvoidingView>
      )}

      <Modal visible={!!editModal} transparent animationType="fade" onRequestClose={closeModal}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editModal?.row ? 'Edit rule' : 'New rule'}</Text>
              <TouchableOpacity onPress={closeModal}><X size={20} color={theme.text} /></TouchableOpacity>
            </View>
            {form && (
              <ScrollView contentContainerStyle={{ paddingBottom: 10 }} keyboardShouldPersistTaps="handled">
                <Text style={s.fieldLabel}>capability_key *</Text>
                <TextInput style={s.input} value={form.capability_key} onChangeText={v => setForm(f => ({ ...f, capability_key: v }))} autoCapitalize="none" />
                <Text style={s.fieldLabel}>name *</Text>
                <TextInput style={s.input} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} />
                <Text style={s.fieldLabel}>description</Text>
                <TextInput style={s.input} value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} />

                {editModal.kind === 'event' ? (
                  <>
                    <Text style={s.fieldLabel}>group_key</Text>
                    <TextInput style={s.input} value={form.group_key || ''} onChangeText={v => setForm(f => ({ ...f, group_key: v }))} autoCapitalize="none" />
                    <Text style={s.fieldLabel}>priority</Text>
                    <TextInput style={s.input} value={String(form.priority)} onChangeText={v => setForm(f => ({ ...f, priority: v }))} keyboardType="number-pad" />
                    <Text style={s.fieldLabel}>visibility (always / gated / secondary)</Text>
                    <TextInput style={s.input} value={form.visibility} onChangeText={v => setForm(f => ({ ...f, visibility: v }))} autoCapitalize="none" />
                    <Text style={s.fieldLabel}>venue_types (comma-separated)</Text>
                    <TextInput style={s.input} value={form.venue_types} onChangeText={v => setForm(f => ({ ...f, venue_types: v }))} autoCapitalize="none" />
                    <Text style={s.fieldLabel}>event_type_slugs (comma-separated)</Text>
                    <TextInput style={s.input} value={form.event_type_slugs} onChangeText={v => setForm(f => ({ ...f, event_type_slugs: v }))} autoCapitalize="none" />
                    <Text style={s.fieldLabel}>excluded_event_type_slugs (comma-separated)</Text>
                    <TextInput style={s.input} value={form.excluded_event_type_slugs} onChangeText={v => setForm(f => ({ ...f, excluded_event_type_slugs: v }))} autoCapitalize="none" />
                    <Text style={s.fieldLabel}>min_guest_count / max_guest_count</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TextInput style={[s.input, { flex: 1 }]} value={String(form.min_guest_count)} onChangeText={v => setForm(f => ({ ...f, min_guest_count: v }))} keyboardType="number-pad" />
                      <TextInput style={[s.input, { flex: 1 }]} value={String(form.max_guest_count)} onChangeText={v => setForm(f => ({ ...f, max_guest_count: v }))} keyboardType="number-pad" />
                    </View>
                    <Text style={s.fieldLabel}>min_age / max_age</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TextInput style={[s.input, { flex: 1 }]} value={String(form.min_age)} onChangeText={v => setForm(f => ({ ...f, min_age: v }))} keyboardType="number-pad" />
                      <TextInput style={[s.input, { flex: 1 }]} value={String(form.max_age)} onChangeText={v => setForm(f => ({ ...f, max_age: v }))} keyboardType="number-pad" />
                    </View>
                    <SwitchRow label="requires_budget" value={form.requires_budget} onChange={v => setForm(f => ({ ...f, requires_budget: v }))} theme={theme} s={s} />
                    <SwitchRow label="requires_sub_events" value={form.requires_sub_events} onChange={v => setForm(f => ({ ...f, requires_sub_events: v }))} theme={theme} s={s} />
                    <SwitchRow label="requires_booking" value={form.requires_booking} onChange={v => setForm(f => ({ ...f, requires_booking: v }))} theme={theme} s={s} />
                    <SwitchRow label="requires_completed_booking" value={form.requires_completed_booking} onChange={v => setForm(f => ({ ...f, requires_completed_booking: v }))} theme={theme} s={s} />
                    <SwitchRow label="suppressed_when_dry" value={form.suppressed_when_dry} onChange={v => setForm(f => ({ ...f, suppressed_when_dry: v }))} theme={theme} s={s} />
                    <SwitchRow label="suppressed_when_veg" value={form.suppressed_when_veg} onChange={v => setForm(f => ({ ...f, suppressed_when_veg: v }))} theme={theme} s={s} />
                  </>
                ) : (
                  <>
                    <Text style={s.fieldLabel}>categories (comma-separated)</Text>
                    <TextInput style={s.input} value={form.categories} onChangeText={v => setForm(f => ({ ...f, categories: v }))} />
                    <Text style={s.fieldLabel}>min_service_price</Text>
                    <TextInput style={s.input} value={String(form.min_service_price)} onChangeText={v => setForm(f => ({ ...f, min_service_price: v }))} keyboardType="number-pad" />
                    <Text style={s.fieldLabel}>min_completed_bookings</Text>
                    <TextInput style={s.input} value={String(form.min_completed_bookings)} onChangeText={v => setForm(f => ({ ...f, min_completed_bookings: v }))} keyboardType="number-pad" />
                    <Text style={s.fieldLabel}>config_value</Text>
                    <TextInput style={s.input} value={String(form.config_value)} onChangeText={v => setForm(f => ({ ...f, config_value: v }))} keyboardType="number-pad" />
                    <SwitchRow label="requires_verified" value={form.requires_verified} onChange={v => setForm(f => ({ ...f, requires_verified: v }))} theme={theme} s={s} />
                  </>
                )}

                <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={saveRule} disabled={saving}>
                  {saving ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.saveBtnText}>Save rule</Text>}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function SwitchRow({ label, value, onChange, theme, s }) {
  return (
    <View style={s.switchRow}>
      <Text style={s.switchLabel}>{label}</Text>
      <Switch value={!!value} onValueChange={onChange} trackColor={{ true: theme.accent }} />
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backBtn: { width: 30 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: theme.text },

    tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
    tabChip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 14, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border },
    tabChipActive: { backgroundColor: theme.text, borderColor: theme.text },
    tabChipText: { fontSize: 12.5, fontWeight: '600', color: theme.textSecondary },
    tabChipTextActive: { color: theme.bg },

    addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.btnPrimary, borderRadius: 14, paddingVertical: 13, marginBottom: 6 },
    addBtnText: { color: theme.btnPrimaryText, fontSize: 14, fontWeight: '700' },

    ruleCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border, padding: 14 },
    ruleTitle: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 3 },
    ruleMeta: { fontSize: 11.5, color: theme.textSecondary },

    sectionLabel: { fontSize: 11, fontWeight: '700', color: theme.textTertiary, letterSpacing: 0.5 },
    testerCard: { backgroundColor: theme.cardBg, borderRadius: 16, borderWidth: 0.5, borderColor: theme.border, padding: 14, gap: 4 },
    fieldLabel: { fontSize: 11.5, fontWeight: '700', color: theme.textSecondary, marginTop: 10, marginBottom: 5 },
    input: { backgroundColor: theme.bg, borderRadius: 10, borderWidth: 0.5, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13.5, color: theme.text },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
    switchLabel: { fontSize: 13, color: theme.text },
    emptyText: { fontSize: 13, color: theme.textTertiary },
    resultRow: { fontSize: 13, color: theme.text, paddingVertical: 3 },
    resultKey: { fontSize: 11, color: theme.textTertiary },

    overlay: { flex: 1, backgroundColor: '#00000088', alignItems: 'center', justifyContent: 'center', padding: 20 },
    modal: { backgroundColor: theme.cardBg, borderRadius: 20, padding: 20, width: '100%', maxWidth: 460, maxHeight: '85%' },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    modalTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
    saveBtn: { backgroundColor: theme.btnPrimary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
    saveBtnText: { color: theme.btnPrimaryText, fontSize: 14, fontWeight: '700' },
  });
}
