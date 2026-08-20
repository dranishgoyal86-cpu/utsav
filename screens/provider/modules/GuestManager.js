import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Modal, ActivityIndicator, Dimensions, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../ThemeContext';
import { supabase } from '../../../supabase';
import { showAlert, confirmDestructive } from '../../../helpers';
import AppHeader from '../../../components/AppHeader';
import {
  ArrowLeft, Plus, X, PencilSimple,
  Phone, CaretDown, CaretUp, Users
} from 'phosphor-react-native';
import SwipeableRow from '../../../components/SwipeableRow';

const { width } = Dimensions.get('window');

const GROUPS = [
  "Bride's Side", "Groom's Side", 'Family', 'Friends', 'Colleagues', 'Other'
];

const RSVP_STATUS = {
  pending:   { label: 'Pending',   color: '#9E9E9E', bg: '#9E9E9E22' },
  confirmed: { label: 'Confirmed', color: '#4CAF50', bg: '#4CAF5022' },
  declined:  { label: 'Declined',  color: '#F44336', bg: '#F4433622' },
};

const EMPTY_FORM = {
  name: '', phone: '', guest_group: GROUPS[0],
  headcount: '1', rsvp_status: 'pending', notes: '',
};

export default function GuestManager({ route, navigation }) {
  const { workspace } = route.params;
  const { theme } = useTheme();
  const s = styles(theme);

  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [groupPickerVisible, setGroupPickerVisible] = useState(false);

  useEffect(() => { fetchGuests(); }, []);

  async function fetchGuests() {
    try {
      const { data, error } = await supabase
        .from('event_guest_list')
        .select('*')
        .eq('workspace_id', workspace.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setGuests(data || []);
    } catch (err) {
      console.log('fetchGuests error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveGuest() {
    if (!form.name.trim()) {
      showAlert('Required', 'Enter guest name.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        workspace_id: workspace.id,
        name: form.name.trim(),
        phone: form.phone.trim(),
        guest_group: form.guest_group,
        headcount: parseInt(form.headcount, 10) || 1,
        rsvp_status: form.rsvp_status,
        notes: form.notes.trim(),
      };

      if (editingId) {
        const { data, error } = await supabase
          .from('event_guest_list').update(payload).eq('id', editingId).select().single();
        if (error) throw error;
        setGuests(prev => prev.map(g => g.id === editingId ? data : g));
      } else {
        const { data, error } = await supabase
          .from('event_guest_list').insert(payload).select().single();
        if (error) throw error;
        setGuests(prev => [...prev, data]);
      }
      closeModal();
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteGuest(id) {
    confirmDestructive('Remove guest?', 'This cannot be undone.', 'Remove', async () => {
      await supabase.from('event_guest_list').delete().eq('id', id);
      setGuests(prev => prev.filter(g => g.id !== id));
    });
  }

  function openEdit(guest) {
    setForm({
      name: guest.name,
      phone: guest.phone || '',
      guest_group: guest.guest_group,
      headcount: String(guest.headcount || 1),
      rsvp_status: guest.rsvp_status,
      notes: guest.notes || '',
    });
    setEditingId(guest.id);
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  const filters = ['all', 'confirmed', 'pending', 'declined'];
  const filtered = activeFilter === 'all'
    ? guests
    : guests.filter(g => g.rsvp_status === activeFilter);

  const totalHeadcount = guests.reduce((sum, g) => sum + (g.headcount || 0), 0);
  const confirmedHeadcount = guests
    .filter(g => g.rsvp_status === 'confirmed')
    .reduce((sum, g) => sum + (g.headcount || 0), 0);
  const confirmedCount = guests.filter(g => g.rsvp_status === 'confirmed').length;
  const pendingCount = guests.filter(g => g.rsvp_status === 'pending').length;

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <AppHeader
        title="Guest & RSVP"
        onBack={() => navigation.goBack()}
        theme={theme}
        navigation={navigation}
        rightActions={[
          <TouchableOpacity key="add" style={s.addBtn} onPress={() => setModalVisible(true)}>
            <Plus size={20} color={theme.bg} />
          </TouchableOpacity>,
        ]}
      />

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

          {/* Summary Card */}
          <View style={s.summaryCard}>
            <View style={s.summaryRow}>
              <View style={s.summaryItem}>
                <Text style={s.summaryLabel}>Guest Entries</Text>
                <Text style={s.summaryValue}>{guests.length}</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryItem}>
                <Text style={s.summaryLabel}>Total Headcount</Text>
                <Text style={s.summaryValue}>{totalHeadcount}</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryItem}>
                <Text style={s.summaryLabel}>Confirmed</Text>
                <Text style={[s.summaryValue, { color: '#4CAF50' }]}>{confirmedCount}</Text>
              </View>
            </View>
            <View style={s.summaryDivider2} />
            <View style={s.summaryRow}>
              <View style={s.summaryItem}>
                <Text style={s.summaryLabel}>Confirmed Headcount</Text>
                <Text style={[s.summaryValue, { color: '#4CAF50' }]}>{confirmedHeadcount}</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryItem}>
                <Text style={s.summaryLabel}>Pending</Text>
                <Text style={[s.summaryValue, { color: '#FF9800' }]}>{pendingCount}</Text>
              </View>
            </View>
          </View>

          {/* Filter Pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            {filters.map(f => (
              <TouchableOpacity
                key={f}
                style={[s.filterPill, activeFilter === f && s.filterPillActive]}
                onPress={() => setActiveFilter(f)}
              >
                <Text style={[s.filterPillText, activeFilter === f && s.filterPillTextActive]}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                  {f !== 'all' && ` (${guests.filter(g => g.rsvp_status === f).length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Guest List */}
          {filtered.length === 0 ? (
            <View style={s.empty}>
              <Text style={{ fontSize: 40 }}>👥</Text>
              <Text style={s.emptyTitle}>No guests yet</Text>
              <Text style={s.emptySubtitle}>Tap + to add your first guest</Text>
            </View>
          ) : (
            filtered.map(guest => {
              const isExpanded = expanded === guest.id;
              const rs = RSVP_STATUS[guest.rsvp_status];
              return (
                <SwipeableRow
                  key={guest.id}
                  style={s.guestCardWrap}
                  onPress={() => setExpanded(isExpanded ? null : guest.id)}
                  onDelete={() => deleteGuest(guest.id)}
                >
                  <View style={s.guestCard}>
                    {/* Card Header */}
                    <View style={s.guestCardTop}>
                      <View style={s.guestAvatar}>
                        <Text style={s.guestAvatarText}>{guest.name[0]?.toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.guestName}>{guest.name}</Text>
                        <Text style={s.guestGroup}>{guest.guest_group} · {guest.headcount} {guest.headcount === 1 ? 'guest' : 'guests'}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <View style={[s.statusBadge, { backgroundColor: rs.bg }]}>
                          <Text style={[s.statusText, { color: rs.color }]}>{rs.label}</Text>
                        </View>
                        {isExpanded
                          ? <CaretUp size={16} color={theme.subtext} />
                          : <CaretDown size={16} color={theme.subtext} />
                        }
                      </View>
                    </View>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <View style={s.guestDetails}>
                        <View style={s.detailsDivider} />

                        {guest.phone ? (
                          <View style={s.contactItem}>
                            <Phone size={13} color={theme.subtext} />
                            <Text style={s.contactText}>{guest.phone}</Text>
                          </View>
                        ) : null}

                        {guest.notes ? (
                          <View style={s.notesBox}>
                            <Text style={s.notesText}>💬 {guest.notes}</Text>
                          </View>
                        ) : null}

                        <View style={s.guestActions}>
                          <TouchableOpacity style={s.editBtn} onPress={() => openEdit(guest)}>
                            <PencilSimple size={14} color={theme.text} />
                            <Text style={s.editBtnText}>Edit</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                </SwipeableRow>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editingId ? 'Edit Guest' : 'Add Guest'}</Text>
              <TouchableOpacity onPress={closeModal}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }} contentContainerStyle={{ gap: 10 }}>

              <TextInput style={s.input} placeholder="Guest / family name *" placeholderTextColor={theme.subtext}
                value={form.name} onChangeText={v => setForm(p => ({ ...p, name: v }))} />

              {/* Group Picker */}
              <TouchableOpacity style={s.input} onPress={() => setGroupPickerVisible(true)}>
                <Text style={{ color: theme.text, fontSize: 15 }}>{form.guest_group}</Text>
              </TouchableOpacity>

              <TextInput style={s.input} placeholder="Phone" placeholderTextColor={theme.subtext}
                value={form.phone} onChangeText={v => setForm(p => ({ ...p, phone: v }))} keyboardType="phone-pad" />

              <TextInput style={s.input} placeholder="Headcount (incl. plus-ones)" placeholderTextColor={theme.subtext}
                value={form.headcount} onChangeText={v => setForm(p => ({ ...p, headcount: v }))} keyboardType="numeric" />

              {/* RSVP Status */}
              <Text style={s.fieldLabel}>RSVP Status</Text>
              <View style={s.chipRow}>
                {Object.entries(RSVP_STATUS).map(([key, val]) => (
                  <TouchableOpacity
                    key={key}
                    style={[s.chip, form.rsvp_status === key && { backgroundColor: val.bg, borderColor: val.color }]}
                    onPress={() => setForm(p => ({ ...p, rsvp_status: key }))}
                  >
                    <Text style={[s.chipText, form.rsvp_status === key && { color: val.color }]}>{val.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput style={[s.input, { minHeight: 70 }]} placeholder="Notes" placeholderTextColor={theme.subtext}
                value={form.notes} onChangeText={v => setForm(p => ({ ...p, notes: v }))}
                multiline textAlignVertical="top" />
            </ScrollView>

            <TouchableOpacity style={s.saveBtn} onPress={saveGuest} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color={theme.bg} />
                : <Text style={s.saveBtnText}>{editingId ? 'Update Guest' : 'Add Guest'}</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Group Picker Modal */}
      <Modal visible={groupPickerVisible} transparent animationType="fade" onRequestClose={() => setGroupPickerVisible(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, { maxHeight: 420 }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Select Group</Text>
              <TouchableOpacity onPress={() => setGroupPickerVisible(false)}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {GROUPS.map(group => (
                <TouchableOpacity
                  key={group}
                  style={[s.groupOption, form.guest_group === group && s.groupOptionActive]}
                  onPress={() => { setForm(p => ({ ...p, guest_group: group })); setGroupPickerVisible(false); }}
                >
                  <Text style={[s.groupOptionText, form.guest_group === group && { color: theme.accent, fontWeight: '700' }]}>
                    {group}
                  </Text>
                  {form.guest_group === group && <Text style={{ color: theme.accent }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = theme => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
    borderBottomWidth: 0.5, borderBottomColor: theme.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: theme.text },
  backBtn: { padding: 4 },
  addBtn: {
    backgroundColor: theme.accent, borderRadius: 20,
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
  },
  summaryCard: {
    backgroundColor: theme.card, borderRadius: 16,
    borderWidth: 0.5, borderColor: theme.border, overflow: 'hidden',
  },
  summaryRow: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 8 },
  summaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  summaryLabel: { fontSize: 11, color: theme.subtext, textAlign: 'center' },
  summaryValue: { fontSize: 15, fontWeight: '700', color: theme.text },
  summaryDivider: { width: 0.5, backgroundColor: theme.border },
  summaryDivider2: { height: 0.5, backgroundColor: theme.border },
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18,
    backgroundColor: theme.card, borderWidth: 0.5, borderColor: theme.border,
  },
  filterPillActive: { backgroundColor: theme.text, borderColor: theme.text },
  filterPillText: { fontSize: 12, fontWeight: '600', color: theme.subtext },
  filterPillTextActive: { color: theme.bg },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
  emptySubtitle: { fontSize: 13, color: theme.subtext },
  guestCardWrap: { borderRadius: 16 },
  guestCard: {
    backgroundColor: theme.card, borderRadius: 16,
    borderWidth: 0.5, borderColor: theme.border, overflow: 'hidden',
  },
  guestCardTop: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  guestAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.accent + '22', alignItems: 'center', justifyContent: 'center',
  },
  guestAvatarText: { fontSize: 16, fontWeight: '700', color: theme.accent },
  guestName: { fontSize: 15, fontWeight: '700', color: theme.text },
  guestGroup: { fontSize: 12, color: theme.subtext, marginTop: 1 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  guestDetails: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  detailsDivider: { height: 0.5, backgroundColor: theme.border, marginBottom: 4 },
  contactItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  contactText: { fontSize: 13, color: theme.subtext },
  notesBox: {
    backgroundColor: theme.inputBg, borderRadius: 10,
    padding: 10, borderWidth: 0.5, borderColor: theme.border,
  },
  notesText: { fontSize: 12, color: theme.subtext, lineHeight: 18 },
  guestActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  editBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10,
    backgroundColor: theme.inputBg, borderWidth: 0.5, borderColor: theme.border,
  },
  editBtnText: { fontSize: 13, fontWeight: '600', color: theme.text },
  overlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: theme.card, borderTopLeftRadius: 24,
    borderTopRightRadius: 24, padding: 24, gap: 14,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  input: {
    backgroundColor: theme.inputBg, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 15, color: theme.text,
    borderWidth: 0.5, borderColor: theme.border,
  },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: theme.subtext },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18,
    backgroundColor: theme.inputBg, borderWidth: 1, borderColor: theme.border,
  },
  chipText: { fontSize: 12, fontWeight: '600', color: theme.subtext },
  saveBtn: {
    backgroundColor: theme.accent, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: theme.bg },
  groupOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border,
  },
  groupOptionActive: { backgroundColor: theme.inputBg },
  groupOptionText: { fontSize: 14, color: theme.text },
});
