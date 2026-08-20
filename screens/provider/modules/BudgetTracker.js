import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Modal, ActivityIndicator, Dimensions, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../ThemeContext';
import { supabase } from '../../../supabase';
import { showAlert, confirmDestructive } from '../../../helpers';
import AppHeader from '../../../components/AppHeader';
import { ArrowLeft, Plus, X, PencilSimple } from 'phosphor-react-native';
import SwipeableRow from '../../../components/SwipeableRow';

const { width } = Dimensions.get('window');

const DEFAULT_CATEGORIES = [
  'Venue', 'Catering', 'Photography', 'Decoration',
  'Music & Entertainment', 'Mehendi', 'Makeup', 'Transport', 'Miscellaneous'
];

export default function BudgetTracker({ route, navigation }) {
  const { workspace } = route.params;
  const { theme } = useTheme();
  const s = styles(theme);

  const [budget, setBudget] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [budgetModal, setBudgetModal] = useState(false);
  const [categoryModal, setCategoryModal] = useState(false);
  const [totalInput, setTotalInput] = useState('');
  const [catForm, setCatForm] = useState({ name: '', allocated: '', spent: '' });
  const [saving, setSaving] = useState(false);
  const [editingCat, setEditingCat] = useState(null);

  useEffect(() => {
    fetchBudget();
  }, []);

  async function fetchBudget() {
    try {
      const { data: b } = await supabase
        .from('event_budget')
        .select('*')
        .eq('workspace_id', workspace.id)
        .single();

      const { data: cats } = await supabase
        .from('budget_categories')
        .select('*')
        .eq('workspace_id', workspace.id)
        .order('created_at', { ascending: true });

      setBudget(b || null);
      setCategories(cats || []);
    } catch (err) {
      console.log('fetchBudget error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveTotalBudget() {
    if (!totalInput.trim()) return;
    setSaving(true);
    try {
      if (budget) {
        const { data, error } = await supabase
          .from('event_budget')
          .update({ total_budget: parseFloat(totalInput) })
          .eq('id', budget.id)
          .select()
          .single();
        if (error) throw error;
        setBudget(data);
      } else {
        const { data, error } = await supabase
          .from('event_budget')
          .insert({ workspace_id: workspace.id, total_budget: parseFloat(totalInput) })
          .select()
          .single();
        if (error) throw error;
        setBudget(data);
      }
      setBudgetModal(false);
      setTotalInput('');
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveCategory() {
    if (!catForm.name.trim()) {
      showAlert('Required', 'Enter a category name.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        workspace_id: workspace.id,
        name: catForm.name.trim(),
        allocated: parseFloat(catForm.allocated) || 0,
        spent: parseFloat(catForm.spent) || 0,
      };
      if (editingCat) {
        const { data, error } = await supabase
          .from('budget_categories')
          .update(payload)
          .eq('id', editingCat.id)
          .select()
          .single();
        if (error) throw error;
        setCategories(prev => prev.map(c => c.id === editingCat.id ? data : c));
      } else {
        const { data, error } = await supabase
          .from('budget_categories')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        setCategories(prev => [...prev, data]);
      }
      setCategoryModal(false);
      setCatForm({ name: '', allocated: '', spent: '' });
      setEditingCat(null);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(id) {
    confirmDestructive('Delete', 'Remove this category?', 'Delete', async () => {
      await supabase.from('budget_categories').delete().eq('id', id);
      setCategories(prev => prev.filter(c => c.id !== id));
    });
  }

  function openEdit(cat) {
    setEditingCat(cat);
    setCatForm({ name: cat.name, allocated: String(cat.allocated), spent: String(cat.spent) });
    setCategoryModal(true);
  }

  const totalBudget = budget?.total_budget || 0;
  const totalAllocated = categories.reduce((sum, c) => sum + (c.allocated || 0), 0);
  const totalSpent = categories.reduce((sum, c) => sum + (c.spent || 0), 0);
  const remaining = totalBudget - totalSpent;
  const spentPct = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0;

  function fmt(n) {
    return '₹' + Number(n || 0).toLocaleString('en-IN');
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader
        title="Budget Tracker"
        onBack={() => navigation.goBack()}
        theme={theme}
        navigation={navigation}
        rightActions={[
          <TouchableOpacity key="add" style={s.addBtn} onPress={() => setCategoryModal(true)}>
            <Plus size={20} color={theme.bg} />
          </TouchableOpacity>,
        ]}
      />

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} showsVerticalScrollIndicator={false}>

          {/* Total Budget Card */}
          <TouchableOpacity
            style={s.budgetCard}
            onPress={() => { setTotalInput(String(totalBudget)); setBudgetModal(true); }}
            activeOpacity={0.8}
          >
            <View style={s.budgetCardTop}>
              <View>
                <Text style={s.budgetLabel}>Total Budget</Text>
                <Text style={s.budgetAmount}>{fmt(totalBudget)}</Text>
              </View>
              <PencilSimple size={16} color={theme.subtext} />
            </View>

            {/* Progress Bar */}
            <View style={s.progressBg}>
              <View style={[s.progressFill, {
                width: `${spentPct}%`,
                backgroundColor: spentPct > 90 ? '#F44336' : spentPct > 70 ? '#FF9800' : '#4CAF50'
              }]} />
            </View>

            <View style={s.budgetStats}>
              <View style={s.statItem}>
                <Text style={s.statLabel}>Spent</Text>
                <Text style={[s.statValue, { color: '#F44336' }]}>{fmt(totalSpent)}</Text>
              </View>
              <View style={s.statItem}>
                <Text style={s.statLabel}>Allocated</Text>
                <Text style={[s.statValue, { color: '#FF9800' }]}>{fmt(totalAllocated)}</Text>
              </View>
              <View style={s.statItem}>
                <Text style={s.statLabel}>Remaining</Text>
                <Text style={[s.statValue, { color: '#4CAF50' }]}>{fmt(remaining)}</Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Categories */}
          <Text style={s.sectionTitle}>Categories</Text>

          {categories.length === 0 ? (
            <View style={s.empty}>
              <Text style={{ fontSize: 36 }}>💰</Text>
              <Text style={s.emptyText}>No categories yet. Tap + to add one.</Text>
            </View>
          ) : (
            categories.map(cat => {
              const pct = cat.allocated > 0 ? Math.min((cat.spent / cat.allocated) * 100, 100) : 0;
              const barColor = pct > 90 ? '#F44336' : pct > 70 ? '#FF9800' : '#4CAF50';
              return (
                <SwipeableRow key={cat.id} style={s.catCardWrap} onDelete={() => deleteCategory(cat.id)}>
                  <View style={s.catCard}>
                    <View style={s.catHeader}>
                      <Text style={s.catName}>{cat.name}</Text>
                      <TouchableOpacity onPress={() => openEdit(cat)}>
                        <PencilSimple size={15} color={theme.subtext} />
                      </TouchableOpacity>
                    </View>
                    <View style={s.progressBg}>
                      <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: barColor }]} />
                    </View>
                    <View style={s.catStats}>
                      <Text style={s.catStatText}>Allocated: {fmt(cat.allocated)}</Text>
                      <Text style={s.catStatText}>Spent: {fmt(cat.spent)}</Text>
                    </View>
                  </View>
                </SwipeableRow>
              );
            })
          )}

          {/* Quick add default categories */}
          {categories.length === 0 && (
            <>
              <Text style={s.sectionTitle}>Quick Add</Text>
              <View style={s.quickRow}>
                {DEFAULT_CATEGORIES.map(name => (
                  <TouchableOpacity
                    key={name}
                    style={s.quickChip}
                    onPress={() => { setCatForm({ name, allocated: '', spent: '' }); setCategoryModal(true); }}
                  >
                    <Text style={s.quickChipText}>{name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* Set Total Budget Modal */}
      <Modal visible={budgetModal} transparent animationType="fade" onRequestClose={() => setBudgetModal(false)}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Set Total Budget</Text>
              <TouchableOpacity onPress={() => setBudgetModal(false)}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={s.input}
              placeholder="Enter amount in ₹"
              placeholderTextColor={theme.subtext}
              value={totalInput}
              onChangeText={setTotalInput}
              keyboardType="numeric"
              autoFocus
            />
            <TouchableOpacity style={s.saveBtn} onPress={saveTotalBudget} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color={theme.bg} />
                : <Text style={s.saveBtnText}>Save Budget</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add/Edit Category Modal */}
      <Modal
        visible={categoryModal}
        transparent
        animationType="slide"
        onRequestClose={() => { setCategoryModal(false); setCatForm({ name: '', allocated: '', spent: '' }); setEditingCat(null); }}
      >
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editingCat ? 'Edit Category' : 'Add Category'}</Text>
              <TouchableOpacity onPress={() => {
                setCategoryModal(false);
                setCatForm({ name: '', allocated: '', spent: '' });
                setEditingCat(null);
              }}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={s.input}
              placeholder="Category name"
              placeholderTextColor={theme.subtext}
              value={catForm.name}
              onChangeText={v => setCatForm(p => ({ ...p, name: v }))}
            />
            <TextInput
              style={s.input}
              placeholder="Allocated amount (₹)"
              placeholderTextColor={theme.subtext}
              value={catForm.allocated}
              onChangeText={v => setCatForm(p => ({ ...p, allocated: v }))}
              keyboardType="numeric"
            />
            <TextInput
              style={s.input}
              placeholder="Amount spent so far (₹)"
              placeholderTextColor={theme.subtext}
              value={catForm.spent}
              onChangeText={v => setCatForm(p => ({ ...p, spent: v }))}
              keyboardType="numeric"
            />
            <TouchableOpacity style={s.saveBtn} onPress={saveCategory} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color={theme.bg} />
                : <Text style={s.saveBtnText}>{editingCat ? 'Update' : 'Add Category'}</Text>
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
  budgetCard: {
    backgroundColor: theme.card, borderRadius: 16, padding: 16,
    borderWidth: 0.5, borderColor: theme.border, gap: 12,
  },
  budgetCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  budgetLabel: { fontSize: 12, color: theme.subtext, fontWeight: '600', marginBottom: 4 },
  budgetAmount: { fontSize: 28, fontWeight: '800', color: theme.text },
  progressBg: { height: 8, backgroundColor: theme.border, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  budgetStats: { flexDirection: 'row', justifyContent: 'space-between' },
  statItem: { alignItems: 'center', gap: 2 },
  statLabel: { fontSize: 11, color: theme.subtext },
  statValue: { fontSize: 14, fontWeight: '700' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
  catCardWrap: { borderRadius: 14 },
  catCard: {
    backgroundColor: theme.card, borderRadius: 14, padding: 14,
    borderWidth: 0.5, borderColor: theme.border, gap: 10,
  },
  catHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catName: { fontSize: 14, fontWeight: '600', color: theme.text },
  catStats: { flexDirection: 'row', justifyContent: 'space-between' },
  catStatText: { fontSize: 12, color: theme.subtext },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  emptyText: { fontSize: 13, color: theme.subtext, textAlign: 'center' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickChip: {
    backgroundColor: theme.inputBg, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 0.5, borderColor: theme.border,
  },
  quickChipText: { fontSize: 12, color: theme.text, fontWeight: '500' },
  overlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 20 },
  modal: {
    backgroundColor: theme.card, borderRadius: 20, padding: 24, gap: 14,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  input: {
    backgroundColor: theme.inputBg, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 15, color: theme.text,
    borderWidth: 0.5, borderColor: theme.border,
  },
  saveBtn: {
    backgroundColor: theme.accent, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: theme.bg },
});