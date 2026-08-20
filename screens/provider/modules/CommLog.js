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
  ArrowLeft, Plus, X, Phone, ChatCircle,
  Envelope, Users as UsersIcon, DotsThree, WarningCircle
} from 'phosphor-react-native';
import SwipeableRow from '../../../components/SwipeableRow';

const TYPES = {
  call:    { label: 'Call',     icon: Phone },
  whatsapp:{ label: 'WhatsApp', icon: ChatCircle },
  email:   { label: 'Email',    icon: Envelope },
  meeting: { label: 'Meeting',  icon: UsersIcon },
  other:   { label: 'Other',    icon: DotsThree },
};

const EMPTY_FORM = {
  contact_type: 'call', summary: '', notes: '', follow_up_needed: false,
};

export default function CommLog({ route, navigation }) {
  const { workspace } = route.params;
  const { theme } = useTheme();
  const s = styles(theme);

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => { fetchLogs(); }, []);

  async function fetchLogs() {
    try {
      const { data, error } = await supabase
        .from('event_comm_log')
        .select('*')
        .eq('workspace_id', workspace.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.log('fetchLogs error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveLog() {
    if (!form.summary.trim()) {
      showAlert('Required', 'Enter what was discussed.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        workspace_id: workspace.id,
        contact_type: form.contact_type,
        summary: form.summary.trim(),
        notes: form.notes.trim(),
        follow_up_needed: form.follow_up_needed,
      };
      const { data, error } = await supabase
        .from('event_comm_log').insert(payload).select().single();
      if (error) throw error;
      setLogs(prev => [data, ...prev]);
      closeModal();
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleFollowUp(log) {
    const { data, error } = await supabase
      .from('event_comm_log')
      .update({ follow_up_needed: !log.follow_up_needed })
      .eq('id', log.id).select().single();
    if (!error) setLogs(prev => prev.map(l => l.id === log.id ? data : l));
  }

  async function deleteLog(id) {
    confirmDestructive('Remove entry?', 'This cannot be undone.', 'Remove', async () => {
      await supabase.from('event_comm_log').delete().eq('id', id);
      setLogs(prev => prev.filter(l => l.id !== id));
    });
  }

  function closeModal() {
    setModalVisible(false);
    setForm(EMPTY_FORM);
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) +
      ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  const followUpCount = logs.filter(l => l.follow_up_needed).length;

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <AppHeader
        title="Client Communication"
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
                <Text style={s.summaryLabel}>Total Logged</Text>
                <Text style={s.summaryValue}>{logs.length}</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryItem}>
                <Text style={[s.summaryValue, { color: '#FF9800' }]}>{followUpCount}</Text>
                <Text style={s.summaryLabel}>Need Follow-up</Text>
              </View>
            </View>
          </View>

          {/* Log List */}
          {logs.length === 0 ? (
            <View style={s.empty}>
              <Text style={{ fontSize: 40 }}>💬</Text>
              <Text style={s.emptyTitle}>No communication logged yet</Text>
              <Text style={s.emptySubtitle}>Tap + to log a call, message, or meeting</Text>
            </View>
          ) : (
            logs.map(log => {
              const type = TYPES[log.contact_type] || TYPES.other;
              const TypeIcon = type.icon;
              return (
                <SwipeableRow key={log.id} style={s.logCardWrap} onDelete={() => deleteLog(log.id)}>
                  <View style={s.logCard}>
                    <View style={s.logCardTop}>
                      <View style={s.logIcon}>
                        <TypeIcon size={16} color={theme.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.logSummary}>{log.summary}</Text>
                        <Text style={s.logMeta}>{type.label} · {fmtDate(log.created_at)}</Text>
                      </View>
                    </View>

                    {log.notes ? (
                      <Text style={s.logNotes}>{log.notes}</Text>
                    ) : null}

                    <TouchableOpacity
                      style={[s.followUpChip, log.follow_up_needed && s.followUpChipActive]}
                      onPress={() => toggleFollowUp(log)}
                    >
                      <WarningCircle size={13} color={log.follow_up_needed ? '#FF9800' : theme.subtext} />
                      <Text style={[s.followUpText, log.follow_up_needed && { color: '#FF9800' }]}>
                        {log.follow_up_needed ? 'Follow-up needed' : 'Mark follow-up needed'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </SwipeableRow>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Add Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Log Communication</Text>
              <TouchableOpacity onPress={closeModal}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }} contentContainerStyle={{ gap: 10 }}>
              <Text style={s.fieldLabel}>Type</Text>
              <View style={s.chipRow}>
                {Object.entries(TYPES).map(([key, val]) => (
                  <TouchableOpacity
                    key={key}
                    style={[s.chip, form.contact_type === key && s.chipActive]}
                    onPress={() => setForm(p => ({ ...p, contact_type: key }))}
                  >
                    <Text style={[s.chipText, form.contact_type === key && s.chipTextActive]}>{val.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput style={[s.input, { minHeight: 60 }]} placeholder="What was discussed? *" placeholderTextColor={theme.subtext}
                value={form.summary} onChangeText={v => setForm(p => ({ ...p, summary: v }))}
                multiline textAlignVertical="top" />

              <TextInput style={[s.input, { minHeight: 70 }]} placeholder="Additional notes" placeholderTextColor={theme.subtext}
                value={form.notes} onChangeText={v => setForm(p => ({ ...p, notes: v }))}
                multiline textAlignVertical="top" />

              <TouchableOpacity
                style={[s.followUpChip, form.follow_up_needed && s.followUpChipActive, { alignSelf: 'flex-start' }]}
                onPress={() => setForm(p => ({ ...p, follow_up_needed: !p.follow_up_needed }))}
              >
                <WarningCircle size={13} color={form.follow_up_needed ? '#FF9800' : theme.subtext} />
                <Text style={[s.followUpText, form.follow_up_needed && { color: '#FF9800' }]}>
                  {form.follow_up_needed ? 'Follow-up needed' : 'Needs follow-up?'}
                </Text>
              </TouchableOpacity>
            </ScrollView>

            <TouchableOpacity style={s.saveBtn} onPress={saveLog} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color={theme.bg} />
                : <Text style={s.saveBtnText}>Save Entry</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
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
  logCardWrap: { borderRadius: 16 },
  logCard: {
    backgroundColor: theme.card, borderRadius: 16, padding: 14,
    borderWidth: 0.5, borderColor: theme.border, gap: 10,
  },
  logCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  logIcon: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: theme.accent + '22', alignItems: 'center', justifyContent: 'center',
  },
  logSummary: { fontSize: 14, fontWeight: '600', color: theme.text, lineHeight: 19 },
  logMeta: { fontSize: 11, color: theme.subtext, marginTop: 2 },
  logNotes: { fontSize: 13, color: theme.subtext, lineHeight: 18, marginLeft: 44 },
  followUpChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: theme.inputBg, borderRadius: 18,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 0.5, borderColor: theme.border, marginLeft: 44,
  },
  followUpChipActive: { backgroundColor: '#FF980022', borderColor: '#FF9800' },
  followUpText: { fontSize: 12, fontWeight: '600', color: theme.subtext },
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
  chipActive: { backgroundColor: theme.accent + '22', borderColor: theme.accent },
  chipText: { fontSize: 12, fontWeight: '600', color: theme.subtext },
  chipTextActive: { color: theme.accent },
  saveBtn: {
    backgroundColor: theme.accent, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: theme.bg },
});
