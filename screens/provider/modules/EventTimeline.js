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
  CaretDown, CaretUp, CheckCircle, Circle
} from 'phosphor-react-native';
import SwipeableRow from '../../../components/SwipeableRow';

const EMPTY_FORM = {
  scheduled_time: '', title: '', assigned_to: '', notes: '', status: 'pending',
};

export default function EventTimeline({ route, navigation }) {
  const { workspace } = route.params;
  const { theme } = useTheme();
  const s = styles(theme);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => { fetchTimeline(); }, []);

  async function fetchTimeline() {
    try {
      const { data, error } = await supabase
        .from('event_timeline')
        .select('*')
        .eq('workspace_id', workspace.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      console.log('fetchTimeline error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveItem() {
    if (!form.title.trim()) {
      showAlert('Required', 'Enter a task/event title.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        workspace_id: workspace.id,
        scheduled_time: form.scheduled_time.trim(),
        title: form.title.trim(),
        assigned_to: form.assigned_to.trim(),
        notes: form.notes.trim(),
        status: form.status,
      };

      if (editingId) {
        const { data, error } = await supabase
          .from('event_timeline').update(payload).eq('id', editingId).select().single();
        if (error) throw error;
        setItems(prev => prev.map(i => i.id === editingId ? data : i));
      } else {
        const { data, error } = await supabase
          .from('event_timeline').insert(payload).select().single();
        if (error) throw error;
        setItems(prev => [...prev, data]);
      }
      closeModal();
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(item) {
    const newStatus = item.status === 'done' ? 'pending' : 'done';
    const { data, error } = await supabase
      .from('event_timeline').update({ status: newStatus }).eq('id', item.id).select().single();
    if (!error) setItems(prev => prev.map(i => i.id === item.id ? data : i));
  }

  async function deleteItem(id) {
    confirmDestructive('Remove item?', 'This cannot be undone.', 'Remove', async () => {
      await supabase.from('event_timeline').delete().eq('id', id);
      setItems(prev => prev.filter(i => i.id !== id));
    });
  }

  function openEdit(item) {
    setForm({
      scheduled_time: item.scheduled_time || '',
      title: item.title,
      assigned_to: item.assigned_to || '',
      notes: item.notes || '',
      status: item.status,
    });
    setEditingId(item.id);
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  const doneCount = items.filter(i => i.status === 'done').length;
  const pendingCount = items.length - doneCount;

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <AppHeader
        title="Event Timeline"
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
                <Text style={s.summaryLabel}>Total Items</Text>
                <Text style={s.summaryValue}>{items.length}</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryItem}>
                <Text style={s.summaryLabel}>Done</Text>
                <Text style={[s.summaryValue, { color: '#4CAF50' }]}>{doneCount}</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryItem}>
                <Text style={s.summaryLabel}>Pending</Text>
                <Text style={[s.summaryValue, { color: '#FF9800' }]}>{pendingCount}</Text>
              </View>
            </View>
          </View>

          {/* Timeline List */}
          {items.length === 0 ? (
            <View style={s.empty}>
              <Text style={{ fontSize: 40 }}>🕐</Text>
              <Text style={s.emptyTitle}>No timeline items yet</Text>
              <Text style={s.emptySubtitle}>Tap + to add the first schedule item</Text>
            </View>
          ) : (
            items.map(item => {
              const isExpanded = expanded === item.id;
              const isDone = item.status === 'done';
              return (
                <SwipeableRow
                  key={item.id}
                  style={s.itemCardWrap}
                  onPress={() => setExpanded(isExpanded ? null : item.id)}
                  onDelete={() => deleteItem(item.id)}
                >
                  <View style={s.itemCard}>
                    <View style={s.itemCardTop}>
                      <TouchableOpacity onPress={() => toggleStatus(item)} hitSlop={8}>
                        {isDone
                          ? <CheckCircle size={22} color="#4CAF50" />
                          : <Circle size={22} color={theme.border} />
                        }
                      </TouchableOpacity>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.itemTitle, isDone && { textDecorationLine: 'line-through', color: theme.subtext }]}>
                          {item.title}
                        </Text>
                        {item.scheduled_time ? (
                          <Text style={s.itemTime}>🕐 {item.scheduled_time}</Text>
                        ) : null}
                      </View>
                      {isExpanded
                        ? <CaretUp size={16} color={theme.subtext} />
                        : <CaretDown size={16} color={theme.subtext} />
                      }
                    </View>

                    {isExpanded && (
                      <View style={s.itemDetails}>
                        <View style={s.detailsDivider} />
                        {item.assigned_to ? (
                          <Text style={s.detailText}>👤 Assigned to: {item.assigned_to}</Text>
                        ) : null}
                        {item.notes ? (
                          <View style={s.notesBox}>
                            <Text style={s.notesText}>💬 {item.notes}</Text>
                          </View>
                        ) : null}
                        <View style={s.itemActions}>
                          <TouchableOpacity style={s.editBtn} onPress={() => openEdit(item)}>
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
              <Text style={s.modalTitle}>{editingId ? 'Edit Item' : 'Add Timeline Item'}</Text>
              <TouchableOpacity onPress={closeModal}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }} contentContainerStyle={{ gap: 10 }}>
              <TextInput style={s.input} placeholder="Task / event title *" placeholderTextColor={theme.subtext}
                value={form.title} onChangeText={v => setForm(p => ({ ...p, title: v }))} />

              <TextInput style={s.input} placeholder="Time (e.g. 10:00 AM)" placeholderTextColor={theme.subtext}
                value={form.scheduled_time} onChangeText={v => setForm(p => ({ ...p, scheduled_time: v }))} />

              <TextInput style={s.input} placeholder="Assigned to" placeholderTextColor={theme.subtext}
                value={form.assigned_to} onChangeText={v => setForm(p => ({ ...p, assigned_to: v }))} />

              <TextInput style={[s.input, { minHeight: 70 }]} placeholder="Notes" placeholderTextColor={theme.subtext}
                value={form.notes} onChangeText={v => setForm(p => ({ ...p, notes: v }))}
                multiline textAlignVertical="top" />

              <View style={s.chipRow}>
                {['pending', 'done'].map(st => (
                  <TouchableOpacity
                    key={st}
                    style={[s.chip, form.status === st && s.chipActive]}
                    onPress={() => setForm(p => ({ ...p, status: st }))}
                  >
                    <Text style={[s.chipText, form.status === st && s.chipTextActive]}>
                      {st === 'done' ? 'Done' : 'Pending'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <TouchableOpacity style={s.saveBtn} onPress={saveItem} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color={theme.bg} />
                : <Text style={s.saveBtnText}>{editingId ? 'Update Item' : 'Add Item'}</Text>
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
  itemCardWrap: { borderRadius: 16 },
  itemCard: {
    backgroundColor: theme.card, borderRadius: 16,
    borderWidth: 0.5, borderColor: theme.border, overflow: 'hidden',
  },
  itemCardTop: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  itemTitle: { fontSize: 15, fontWeight: '700', color: theme.text },
  itemTime: { fontSize: 12, color: theme.subtext, marginTop: 2 },
  itemDetails: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  detailsDivider: { height: 0.5, backgroundColor: theme.border, marginBottom: 4 },
  detailText: { fontSize: 13, color: theme.subtext },
  notesBox: {
    backgroundColor: theme.inputBg, borderRadius: 10,
    padding: 10, borderWidth: 0.5, borderColor: theme.border,
  },
  notesText: { fontSize: 12, color: theme.subtext, lineHeight: 18 },
  itemActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
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
