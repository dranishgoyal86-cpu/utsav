import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Modal, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../ThemeContext';
import { supabase } from '../../../supabase';
import { showAlert, confirmDestructive } from '../../../helpers';
import AppHeader from '../../../components/AppHeader';
import {
  ArrowLeft, Plus, X, PencilSimple,
  Phone, CaretDown, CaretUp
} from 'phosphor-react-native';
import SwipeableRow from '../../../components/SwipeableRow';

const ROLES = [
  'Coordinator', 'Photographer', 'Videographer', 'Decor Team',
  'Catering Staff', 'DJ / Sound', 'Security', 'Driver', 'Other'
];

const STAFF_STATUS = {
  tentative: { label: 'Tentative', color: '#FF9800', bg: '#FF980022' },
  confirmed: { label: 'Confirmed', color: '#4CAF50', bg: '#4CAF5022' },
};

const EMPTY_FORM = {
  name: '', role: ROLES[0], phone: '', daily_rate: '', status: 'tentative', notes: '',
};

export default function TeamManager({ route, navigation }) {
  const { workspace } = route.params;
  const { theme } = useTheme();
  const s = styles(theme);

  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [rolePickerVisible, setRolePickerVisible] = useState(false);

  useEffect(() => { fetchTeam(); }, []);

  async function fetchTeam() {
    try {
      const { data, error } = await supabase
        .from('event_team')
        .select('*')
        .eq('workspace_id', workspace.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setTeam(data || []);
    } catch (err) {
      console.log('fetchTeam error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveMember() {
    if (!form.name.trim()) {
      showAlert('Required', 'Enter team member name.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        workspace_id: workspace.id,
        name: form.name.trim(),
        role: form.role,
        phone: form.phone.trim(),
        daily_rate: parseFloat(form.daily_rate) || 0,
        status: form.status,
        notes: form.notes.trim(),
      };

      if (editingId) {
        const { data, error } = await supabase
          .from('event_team').update(payload).eq('id', editingId).select().single();
        if (error) throw error;
        setTeam(prev => prev.map(m => m.id === editingId ? data : m));
      } else {
        const { data, error } = await supabase
          .from('event_team').insert(payload).select().single();
        if (error) throw error;
        setTeam(prev => [...prev, data]);
      }
      closeModal();
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteMember(id) {
    confirmDestructive('Remove team member?', 'This cannot be undone.', 'Remove', async () => {
      await supabase.from('event_team').delete().eq('id', id);
      setTeam(prev => prev.filter(m => m.id !== id));
    });
  }

  function openEdit(member) {
    setForm({
      name: member.name,
      role: member.role,
      phone: member.phone || '',
      daily_rate: String(member.daily_rate || ''),
      status: member.status,
      notes: member.notes || '',
    });
    setEditingId(member.id);
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function fmt(n) {
    return '₹' + Number(n || 0).toLocaleString('en-IN');
  }

  const confirmedCount = team.filter(m => m.status === 'confirmed').length;
  const totalCost = team.reduce((sum, m) => sum + (m.daily_rate || 0), 0);

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <AppHeader
        title="Team & Staff"
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
                <Text style={s.summaryLabel}>Team Size</Text>
                <Text style={s.summaryValue}>{team.length}</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryItem}>
                <Text style={s.summaryLabel}>Confirmed</Text>
                <Text style={[s.summaryValue, { color: '#4CAF50' }]}>{confirmedCount}</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryItem}>
                <Text style={s.summaryLabel}>Total Cost</Text>
                <Text style={s.summaryValue}>{fmt(totalCost)}</Text>
              </View>
            </View>
          </View>

          {/* Team List */}
          {team.length === 0 ? (
            <View style={s.empty}>
              <Text style={{ fontSize: 40 }}>🧑‍🤝‍🧑</Text>
              <Text style={s.emptyTitle}>No team members yet</Text>
              <Text style={s.emptySubtitle}>Tap + to add your first team member</Text>
            </View>
          ) : (
            team.map(member => {
              const isExpanded = expanded === member.id;
              const st = STAFF_STATUS[member.status];
              return (
                <SwipeableRow
                  key={member.id}
                  style={s.memberCardWrap}
                  onPress={() => setExpanded(isExpanded ? null : member.id)}
                  onDelete={() => deleteMember(member.id)}
                >
                  <View style={s.memberCard}>
                    <View style={s.memberCardTop}>
                      <View style={s.memberAvatar}>
                        <Text style={s.memberAvatarText}>{member.name[0]?.toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.memberName}>{member.name}</Text>
                        <Text style={s.memberRole}>{member.role}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                          <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
                        </View>
                        {isExpanded
                          ? <CaretUp size={16} color={theme.subtext} />
                          : <CaretDown size={16} color={theme.subtext} />
                        }
                      </View>
                    </View>

                    {isExpanded && (
                      <View style={s.memberDetails}>
                        <View style={s.detailsDivider} />
                        {member.phone ? (
                          <View style={s.contactItem}>
                            <Phone size={13} color={theme.subtext} />
                            <Text style={s.contactText}>{member.phone}</Text>
                          </View>
                        ) : null}
                        {member.daily_rate > 0 ? (
                          <Text style={s.detailText}>💰 Rate: {fmt(member.daily_rate)}</Text>
                        ) : null}
                        {member.notes ? (
                          <View style={s.notesBox}>
                            <Text style={s.notesText}>💬 {member.notes}</Text>
                          </View>
                        ) : null}
                        <View style={s.memberActions}>
                          <TouchableOpacity style={s.editBtn} onPress={() => openEdit(member)}>
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
              <Text style={s.modalTitle}>{editingId ? 'Edit Team Member' : 'Add Team Member'}</Text>
              <TouchableOpacity onPress={closeModal}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }} contentContainerStyle={{ gap: 10 }}>
              <TextInput style={s.input} placeholder="Name *" placeholderTextColor={theme.subtext}
                value={form.name} onChangeText={v => setForm(p => ({ ...p, name: v }))} />

              <TouchableOpacity style={s.input} onPress={() => setRolePickerVisible(true)}>
                <Text style={{ color: theme.text, fontSize: 15 }}>{form.role}</Text>
              </TouchableOpacity>

              <TextInput style={s.input} placeholder="Phone" placeholderTextColor={theme.subtext}
                value={form.phone} onChangeText={v => setForm(p => ({ ...p, phone: v }))} keyboardType="phone-pad" />

              <TextInput style={s.input} placeholder="Rate / payment (₹)" placeholderTextColor={theme.subtext}
                value={form.daily_rate} onChangeText={v => setForm(p => ({ ...p, daily_rate: v }))} keyboardType="numeric" />

              <Text style={s.fieldLabel}>Status</Text>
              <View style={s.chipRow}>
                {Object.entries(STAFF_STATUS).map(([key, val]) => (
                  <TouchableOpacity
                    key={key}
                    style={[s.chip, form.status === key && { backgroundColor: val.bg, borderColor: val.color }]}
                    onPress={() => setForm(p => ({ ...p, status: key }))}
                  >
                    <Text style={[s.chipText, form.status === key && { color: val.color }]}>{val.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput style={[s.input, { minHeight: 70 }]} placeholder="Notes" placeholderTextColor={theme.subtext}
                value={form.notes} onChangeText={v => setForm(p => ({ ...p, notes: v }))}
                multiline textAlignVertical="top" />
            </ScrollView>

            <TouchableOpacity style={s.saveBtn} onPress={saveMember} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color={theme.bg} />
                : <Text style={s.saveBtnText}>{editingId ? 'Update Member' : 'Add Member'}</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Role Picker Modal */}
      <Modal visible={rolePickerVisible} transparent animationType="fade" onRequestClose={() => setRolePickerVisible(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, { maxHeight: 420 }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Select Role</Text>
              <TouchableOpacity onPress={() => setRolePickerVisible(false)}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {ROLES.map(role => (
                <TouchableOpacity
                  key={role}
                  style={[s.roleOption, form.role === role && s.roleOptionActive]}
                  onPress={() => { setForm(p => ({ ...p, role })); setRolePickerVisible(false); }}
                >
                  <Text style={[s.roleOptionText, form.role === role && { color: theme.accent, fontWeight: '700' }]}>
                    {role}
                  </Text>
                  {form.role === role && <Text style={{ color: theme.accent }}>✓</Text>}
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
  summaryLabel: { fontSize: 11, color: theme.subtext },
  summaryValue: { fontSize: 15, fontWeight: '700', color: theme.text },
  summaryDivider: { width: 0.5, backgroundColor: theme.border },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
  emptySubtitle: { fontSize: 13, color: theme.subtext },
  memberCardWrap: { borderRadius: 16 },
  memberCard: {
    backgroundColor: theme.card, borderRadius: 16,
    borderWidth: 0.5, borderColor: theme.border, overflow: 'hidden',
  },
  memberCardTop: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  memberAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.accent + '22', alignItems: 'center', justifyContent: 'center',
  },
  memberAvatarText: { fontSize: 16, fontWeight: '700', color: theme.accent },
  memberName: { fontSize: 15, fontWeight: '700', color: theme.text },
  memberRole: { fontSize: 12, color: theme.subtext, marginTop: 1 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  memberDetails: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  detailsDivider: { height: 0.5, backgroundColor: theme.border, marginBottom: 4 },
  detailText: { fontSize: 13, color: theme.subtext },
  contactItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  contactText: { fontSize: 13, color: theme.subtext },
  notesBox: {
    backgroundColor: theme.inputBg, borderRadius: 10,
    padding: 10, borderWidth: 0.5, borderColor: theme.border,
  },
  notesText: { fontSize: 12, color: theme.subtext, lineHeight: 18 },
  memberActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
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
  roleOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border,
  },
  roleOptionActive: { backgroundColor: theme.inputBg },
  roleOptionText: { fontSize: 14, color: theme.text },
});
