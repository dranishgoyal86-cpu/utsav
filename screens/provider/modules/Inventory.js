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
  ArrowLeft, Plus, X, PencilSimple, CaretDown, CaretUp
} from 'phosphor-react-native';
import SwipeableRow from '../../../components/SwipeableRow';

const CATEGORIES = [
  'Furniture', 'Decor', 'Lighting', 'Sound Equipment',
  'Catering Equipment', 'Transport', 'Tents / Structure', 'Other'
];

const ITEM_STATUS = {
  needed:    { label: 'Needed',    color: '#9E9E9E', bg: '#9E9E9E22' },
  ordered:   { label: 'Ordered',   color: '#FF9800', bg: '#FF980022' },
  delivered: { label: 'Delivered', color: '#4CAF50', bg: '#4CAF5022' },
  returned:  { label: 'Returned',  color: '#2196F3', bg: '#2196F322' },
};

const EMPTY_FORM = {
  item_name: '', category: CATEGORIES[0], quantity: '1',
  source: '', status: 'needed', notes: '',
};

export default function Inventory({ route, navigation }) {
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
  const [activeFilter, setActiveFilter] = useState('all');
  const [catPickerVisible, setCatPickerVisible] = useState(false);

  useEffect(() => { fetchItems(); }, []);

  async function fetchItems() {
    try {
      const { data, error } = await supabase
        .from('event_inventory')
        .select('*')
        .eq('workspace_id', workspace.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      console.log('fetchItems error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveItem() {
    if (!form.item_name.trim()) {
      showAlert('Required', 'Enter an item name.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        workspace_id: workspace.id,
        item_name: form.item_name.trim(),
        category: form.category,
        quantity: parseInt(form.quantity, 10) || 1,
        source: form.source.trim(),
        status: form.status,
        notes: form.notes.trim(),
      };

      if (editingId) {
        const { data, error } = await supabase
          .from('event_inventory').update(payload).eq('id', editingId).select().single();
        if (error) throw error;
        setItems(prev => prev.map(i => i.id === editingId ? data : i));
      } else {
        const { data, error } = await supabase
          .from('event_inventory').insert(payload).select().single();
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

  async function deleteItem(id) {
    confirmDestructive('Remove item?', 'This cannot be undone.', 'Remove', async () => {
      await supabase.from('event_inventory').delete().eq('id', id);
      setItems(prev => prev.filter(i => i.id !== id));
    });
  }

  function openEdit(item) {
    setForm({
      item_name: item.item_name,
      category: item.category,
      quantity: String(item.quantity || 1),
      source: item.source || '',
      status: item.status,
      notes: item.notes || '',
    });
    setEditingId(item.id);
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  const filters = ['all', 'needed', 'ordered', 'delivered', 'returned'];
  const filtered = activeFilter === 'all'
    ? items
    : items.filter(i => i.status === activeFilter);

  const deliveredCount = items.filter(i => i.status === 'delivered').length;
  const pendingCount = items.filter(i => i.status === 'needed' || i.status === 'ordered').length;

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <AppHeader
        title="Inventory & Logistics"
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
                <Text style={[s.summaryValue, { color: '#4CAF50' }]}>{deliveredCount}</Text>
                <Text style={s.summaryLabel}>Delivered</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryItem}>
                <Text style={[s.summaryValue, { color: '#FF9800' }]}>{pendingCount}</Text>
                <Text style={s.summaryLabel}>Pending</Text>
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
                  {f !== 'all' && ` (${items.filter(i => i.status === f).length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Item List */}
          {filtered.length === 0 ? (
            <View style={s.empty}>
              <Text style={{ fontSize: 40 }}>📦</Text>
              <Text style={s.emptyTitle}>No inventory items yet</Text>
              <Text style={s.emptySubtitle}>Tap + to add your first item</Text>
            </View>
          ) : (
            filtered.map(item => {
              const isExpanded = expanded === item.id;
              const st = ITEM_STATUS[item.status];
              return (
                <SwipeableRow
                  key={item.id}
                  style={s.itemCardWrap}
                  onPress={() => setExpanded(isExpanded ? null : item.id)}
                  onDelete={() => deleteItem(item.id)}
                >
                  <View style={s.itemCard}>
                    <View style={s.itemCardTop}>
                      <View style={s.itemQtyBadge}>
                        <Text style={s.itemQtyText}>×{item.quantity}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.itemName}>{item.item_name}</Text>
                        <Text style={s.itemCategory}>{item.category}</Text>
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
                      <View style={s.itemDetails}>
                        <View style={s.detailsDivider} />
                        {item.source ? (
                          <Text style={s.detailText}>🏪 Source: {item.source}</Text>
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
              <Text style={s.modalTitle}>{editingId ? 'Edit Item' : 'Add Item'}</Text>
              <TouchableOpacity onPress={closeModal}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }} contentContainerStyle={{ gap: 10 }}>
              <TextInput style={s.input} placeholder="Item name *" placeholderTextColor={theme.subtext}
                value={form.item_name} onChangeText={v => setForm(p => ({ ...p, item_name: v }))} />

              <TouchableOpacity style={s.input} onPress={() => setCatPickerVisible(true)}>
                <Text style={{ color: theme.text, fontSize: 15 }}>{form.category}</Text>
              </TouchableOpacity>

              <TextInput style={s.input} placeholder="Quantity" placeholderTextColor={theme.subtext}
                value={form.quantity} onChangeText={v => setForm(p => ({ ...p, quantity: v }))} keyboardType="numeric" />

              <TextInput style={s.input} placeholder="Source / vendor" placeholderTextColor={theme.subtext}
                value={form.source} onChangeText={v => setForm(p => ({ ...p, source: v }))} />

              <Text style={s.fieldLabel}>Status</Text>
              <View style={s.chipRow}>
                {Object.entries(ITEM_STATUS).map(([key, val]) => (
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

            <TouchableOpacity style={s.saveBtn} onPress={saveItem} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color={theme.bg} />
                : <Text style={s.saveBtnText}>{editingId ? 'Update Item' : 'Add Item'}</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Category Picker Modal */}
      <Modal visible={catPickerVisible} transparent animationType="fade" onRequestClose={() => setCatPickerVisible(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, { maxHeight: 420 }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Select Category</Text>
              <TouchableOpacity onPress={() => setCatPickerVisible(false)}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[s.catOption, form.category === cat && s.catOptionActive]}
                  onPress={() => { setForm(p => ({ ...p, category: cat })); setCatPickerVisible(false); }}
                >
                  <Text style={[s.catOptionText, form.category === cat && { color: theme.accent, fontWeight: '700' }]}>
                    {cat}
                  </Text>
                  {form.category === cat && <Text style={{ color: theme.accent }}>✓</Text>}
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
  itemCardWrap: { borderRadius: 16 },
  itemCard: {
    backgroundColor: theme.card, borderRadius: 16,
    borderWidth: 0.5, borderColor: theme.border, overflow: 'hidden',
  },
  itemCardTop: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  itemQtyBadge: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: theme.accent + '22', alignItems: 'center', justifyContent: 'center',
  },
  itemQtyText: { fontSize: 14, fontWeight: '700', color: theme.accent },
  itemName: { fontSize: 15, fontWeight: '700', color: theme.text },
  itemCategory: { fontSize: 12, color: theme.subtext, marginTop: 1 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
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
  catOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border,
  },
  catOptionActive: { backgroundColor: theme.inputBg },
  catOptionText: { fontSize: 14, color: theme.text },
});
