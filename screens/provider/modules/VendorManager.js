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
  Phone, Envelope, CaretDown, CaretUp
} from 'phosphor-react-native';
import SwipeableRow from '../../../components/SwipeableRow';

const CATEGORIES = [
  'Catering', 'Photography', 'Videography', 'Decoration',
  'DJ / Music', 'Mehendi', 'Makeup', 'Venue', 'Transport',
  'Tent / Furniture', 'Lighting', 'Invitation Cards',
  'Pandit / Priest', 'Security', 'Miscellaneous'
];

const CONFIRM_STATUS = {
  enquired:    { label: 'Enquired',    color: '#9E9E9E', bg: '#9E9E9E22' },
  negotiating: { label: 'Negotiating', color: '#FF9800', bg: '#FF980022' },
  confirmed:   { label: 'Confirmed',   color: '#4CAF50', bg: '#4CAF5022' },
  cancelled:   { label: 'Cancelled',   color: '#F44336', bg: '#F4433622' },
};

const PAYMENT_STATUS = {
  unpaid:  { label: 'Unpaid',  color: '#F44336', bg: '#F4433622' },
  partial: { label: 'Partial', color: '#FF9800', bg: '#FF980022' },
  paid:    { label: 'Paid',    color: '#4CAF50', bg: '#4CAF5022' },
};

const EMPTY_FORM = {
  name: '', category: CATEGORIES[0], phone: '', email: '',
  service_description: '', quoted_amount: '', advance_paid: '',
  confirm_status: 'enquired', payment_status: 'unpaid', notes: '',
};

// Calculate balance in JS — don't rely on DB generated column
function balanceDue(v) {
  return (v.quoted_amount || 0) - (v.advance_paid || 0);
}

export default function VendorManager({ route, navigation }) {
  const { workspace } = route.params;
  const { theme } = useTheme();
  const s = styles(theme);

  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [catPickerVisible, setCatPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => { fetchVendors(); }, []);

  async function fetchVendors() {
    try {
      const { data, error } = await supabase
        .from('event_vendors')
        .select('id, name, category, phone, email, service_description, quoted_amount, advance_paid, confirm_status, payment_status, notes, created_at')
        .eq('workspace_id', workspace.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setVendors(data || []);
    } catch (err) {
      console.log('fetchVendors error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveVendor() {
    if (!form.name.trim()) {
      showAlert('Required', 'Enter vendor name.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        workspace_id: workspace.id,
        name: form.name.trim(),
        category: form.category,
        phone: form.phone.trim(),
        email: form.email.trim(),
        service_description: form.service_description.trim(),
        quoted_amount: parseFloat(form.quoted_amount) || 0,
        advance_paid: parseFloat(form.advance_paid) || 0,
        confirm_status: form.confirm_status,
        payment_status: form.payment_status,
        notes: form.notes.trim(),
      };

      if (editingId) {
        const { data, error } = await supabase
          .from('event_vendors')
          .update(payload)
          .eq('id', editingId)
          .select('id, name, category, phone, email, service_description, quoted_amount, advance_paid, confirm_status, payment_status, notes, created_at')
          .single();
        if (error) throw error;
        setVendors(prev => prev.map(v => v.id === editingId ? data : v));
      } else {
        const { data, error } = await supabase
          .from('event_vendors')
          .insert(payload)
          .select('id, name, category, phone, email, service_description, quoted_amount, advance_paid, confirm_status, payment_status, notes, created_at')
          .single();
        if (error) throw error;
        setVendors(prev => [...prev, data]);
      }
      closeModal();
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteVendor(id) {
    confirmDestructive('Delete vendor?', 'This cannot be undone.', 'Delete', async () => {
      await supabase.from('event_vendors').delete().eq('id', id);
      setVendors(prev => prev.filter(v => v.id !== id));
    });
  }

  function openEdit(vendor) {
    setForm({
      name: vendor.name,
      category: vendor.category,
      phone: vendor.phone || '',
      email: vendor.email || '',
      service_description: vendor.service_description || '',
      quoted_amount: String(vendor.quoted_amount || ''),
      advance_paid: String(vendor.advance_paid || ''),
      confirm_status: vendor.confirm_status,
      payment_status: vendor.payment_status,
      notes: vendor.notes || '',
    });
    setEditingId(vendor.id);
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

  const filters = ['all', 'confirmed', 'negotiating', 'enquired', 'cancelled'];
  const filtered = activeFilter === 'all'
    ? vendors
    : vendors.filter(v => v.confirm_status === activeFilter);

  const totalQuoted = vendors.reduce((sum, v) => sum + (v.quoted_amount || 0), 0);
  const totalPaid = vendors.reduce((sum, v) => sum + (v.advance_paid || 0), 0);
  const totalBalance = vendors.reduce((sum, v) => sum + balanceDue(v), 0);
  const confirmedCount = vendors.filter(v => v.confirm_status === 'confirmed').length;
  const pendingCount = vendors.filter(v => v.confirm_status !== 'confirmed').length;

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <AppHeader
        title="Vendor Management"
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
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary Card */}
          <View style={s.summaryCard}>
            <View style={s.summaryRow}>
              <View style={s.summaryItem}>
                <Text style={s.summaryLabel}>Vendors</Text>
                <Text style={s.summaryValue}>{vendors.length}</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryItem}>
                <Text style={s.summaryLabel}>Confirmed</Text>
                <Text style={[s.summaryValue, { color: '#4CAF50' }]}>{confirmedCount}</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryItem}>
                <Text style={s.summaryLabel}>Pending</Text>
                <Text style={[s.summaryValue, { color: '#FF9800' }]}>{pendingCount}</Text>
              </View>
            </View>
            <View style={s.summaryDivider2} />
            <View style={s.summaryRow}>
              <View style={s.summaryItem}>
                <Text style={s.summaryLabel}>Total Quoted</Text>
                <Text style={s.summaryValue}>{fmt(totalQuoted)}</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryItem}>
                <Text style={s.summaryLabel}>Advance Paid</Text>
                <Text style={[s.summaryValue, { color: '#4CAF50' }]}>{fmt(totalPaid)}</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryItem}>
                <Text style={s.summaryLabel}>Balance Due</Text>
                <Text style={[s.summaryValue, { color: '#F44336' }]}>{fmt(totalBalance)}</Text>
              </View>
            </View>
          </View>

          {/* Filter Pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingRight: 4 }}
          >
            {filters.map(f => (
              <TouchableOpacity
                key={f}
                style={[s.filterPill, activeFilter === f && s.filterPillActive]}
                onPress={() => setActiveFilter(f)}
              >
                <Text style={[s.filterPillText, activeFilter === f && s.filterPillTextActive]}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                  {f !== 'all' && ` (${vendors.filter(v => v.confirm_status === f).length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Vendor List */}
          {filtered.length === 0 ? (
            <View style={s.empty}>
              <Text style={{ fontSize: 40 }}>🤝</Text>
              <Text style={s.emptyTitle}>
                {vendors.length === 0 ? 'No vendors yet' : `No ${activeFilter} vendors`}
              </Text>
              <Text style={s.emptySubtitle}>
                {vendors.length === 0 ? 'Tap + to add your first vendor' : 'Try a different filter'}
              </Text>
            </View>
          ) : (
            filtered.map(vendor => {
              const isExpanded = expanded === vendor.id;
              const cs = CONFIRM_STATUS[vendor.confirm_status] || CONFIRM_STATUS.enquired;
              const ps = PAYMENT_STATUS[vendor.payment_status] || PAYMENT_STATUS.unpaid;
              const balance = balanceDue(vendor);

              return (
                <SwipeableRow
                  key={vendor.id}
                  style={s.vendorCardWrap}
                  onPress={() => setExpanded(isExpanded ? null : vendor.id)}
                  onDelete={() => deleteVendor(vendor.id)}
                >
                  <View style={s.vendorCard}>
                    {/* Card Top — tap to expand */}
                    <View style={s.vendorCardTop}>
                      <View style={s.vendorInitial}>
                        <Text style={s.vendorInitialText}>{vendor.category[0]}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.vendorName}>{vendor.name}</Text>
                        <Text style={s.vendorCategory}>{vendor.category}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        <View style={[s.badge, { backgroundColor: cs.bg }]}>
                          <Text style={[s.badgeText, { color: cs.color }]}>{cs.label}</Text>
                        </View>
                        {isExpanded
                          ? <CaretUp size={15} color={theme.textSecondary} />
                          : <CaretDown size={15} color={theme.textSecondary} />
                        }
                      </View>
                    </View>

                    {/* Quick stats — always visible */}
                    <View style={s.quickStats}>
                      <Text style={s.quickStatText}>
                        Quoted: <Text style={{ color: theme.text, fontWeight: '700' }}>{fmt(vendor.quoted_amount)}</Text>
                      </Text>
                      <Text style={s.quickStatText}>
                        Paid: <Text style={{ color: '#4CAF50', fontWeight: '700' }}>{fmt(vendor.advance_paid)}</Text>
                      </Text>
                      <Text style={s.quickStatText}>
                        Due: <Text style={{ color: balance > 0 ? '#F44336' : '#4CAF50', fontWeight: '700' }}>{fmt(balance)}</Text>
                      </Text>
                    </View>

                    {/* Expanded details */}
                    {isExpanded && (
                      <View style={s.expandedSection}>
                        <View style={s.expandedDivider} />

                        {vendor.service_description ? (
                          <Text style={s.expandedDetail}>📝 {vendor.service_description}</Text>
                        ) : null}

                        {(vendor.phone || vendor.email) ? (
                          <View style={s.contactRow}>
                            {vendor.phone ? (
                              <View style={s.contactChip}>
                                <Phone size={12} color={theme.textSecondary} />
                                <Text style={s.contactText}>{vendor.phone}</Text>
                              </View>
                            ) : null}
                            {vendor.email ? (
                              <View style={s.contactChip}>
                                <Envelope size={12} color={theme.textSecondary} />
                                <Text style={s.contactText}>{vendor.email}</Text>
                              </View>
                            ) : null}
                          </View>
                        ) : null}

                        <View style={[s.badge, { backgroundColor: ps.bg, alignSelf: 'flex-start' }]}>
                          <Text style={[s.badgeText, { color: ps.color }]}>💰 Payment: {ps.label}</Text>
                        </View>

                        {vendor.notes ? (
                          <View style={s.notesBox}>
                            <Text style={s.notesText}>💬 {vendor.notes}</Text>
                          </View>
                        ) : null}

                        <View style={s.actionRow}>
                          <TouchableOpacity style={s.editBtn} onPress={() => openEdit(vendor)}>
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

      {/* ── Add / Edit Modal ── */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editingId ? 'Edit Vendor' : 'Add Vendor'}</Text>
              <TouchableOpacity onPress={closeModal}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 10, paddingBottom: 16 }}
            >
              <TextInput
                style={s.input}
                placeholder="Vendor / person name *"
                placeholderTextColor={theme.textSecondary}
                value={form.name}
                onChangeText={v => setForm(p => ({ ...p, name: v }))}
              />

              {/* Category selector */}
              <TouchableOpacity
                style={[s.input, { justifyContent: 'center' }]}
                onPress={() => setCatPickerVisible(true)}
              >
                <Text style={{ color: theme.text, fontSize: 15 }}>
                  {form.category} ▾
                </Text>
              </TouchableOpacity>

              <TextInput
                style={s.input}
                placeholder="Phone number"
                placeholderTextColor={theme.textSecondary}
                value={form.phone}
                onChangeText={v => setForm(p => ({ ...p, phone: v }))}
                keyboardType="phone-pad"
              />

              <TextInput
                style={s.input}
                placeholder="Email address"
                placeholderTextColor={theme.textSecondary}
                value={form.email}
                onChangeText={v => setForm(p => ({ ...p, email: v }))}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <TextInput
                style={s.input}
                placeholder="What service are they providing?"
                placeholderTextColor={theme.textSecondary}
                value={form.service_description}
                onChangeText={v => setForm(p => ({ ...p, service_description: v }))}
              />

              <TextInput
                style={s.input}
                placeholder="Quoted amount (₹)"
                placeholderTextColor={theme.textSecondary}
                value={form.quoted_amount}
                onChangeText={v => setForm(p => ({ ...p, quoted_amount: v }))}
                keyboardType="numeric"
              />

              <TextInput
                style={s.input}
                placeholder="Advance paid (₹)"
                placeholderTextColor={theme.textSecondary}
                value={form.advance_paid}
                onChangeText={v => setForm(p => ({ ...p, advance_paid: v }))}
                keyboardType="numeric"
              />

              {/* Balance preview */}
              {(form.quoted_amount || form.advance_paid) ? (
                <View style={s.balancePreview}>
                  <Text style={s.balancePreviewText}>
                    Balance due:{' '}
                    <Text style={{ color: '#F44336', fontWeight: '700' }}>
                      {fmt((parseFloat(form.quoted_amount) || 0) - (parseFloat(form.advance_paid) || 0))}
                    </Text>
                  </Text>
                </View>
              ) : null}

              <Text style={s.fieldLabel}>Confirm Status</Text>
              <View style={s.chipRow}>
                {Object.entries(CONFIRM_STATUS).map(([key, val]) => (
                  <TouchableOpacity
                    key={key}
                    style={[
                      s.chip,
                      form.confirm_status === key && { backgroundColor: val.bg, borderColor: val.color }
                    ]}
                    onPress={() => setForm(p => ({ ...p, confirm_status: key }))}
                  >
                    <Text style={[
                      s.chipText,
                      form.confirm_status === key && { color: val.color, fontWeight: '700' }
                    ]}>
                      {val.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.fieldLabel}>Payment Status</Text>
              <View style={s.chipRow}>
                {Object.entries(PAYMENT_STATUS).map(([key, val]) => (
                  <TouchableOpacity
                    key={key}
                    style={[
                      s.chip,
                      form.payment_status === key && { backgroundColor: val.bg, borderColor: val.color }
                    ]}
                    onPress={() => setForm(p => ({ ...p, payment_status: key }))}
                  >
                    <Text style={[
                      s.chipText,
                      form.payment_status === key && { color: val.color, fontWeight: '700' }
                    ]}>
                      {val.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={[s.input, { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }]}
                placeholder="Notes (optional)"
                placeholderTextColor={theme.textSecondary}
                value={form.notes}
                onChangeText={v => setForm(p => ({ ...p, notes: v }))}
                multiline
              />
            </ScrollView>

            <TouchableOpacity style={s.saveBtn} onPress={saveVendor} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color={theme.bg} />
                : <Text style={s.saveBtnText}>{editingId ? 'Update Vendor' : 'Add Vendor'}</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Category Picker Modal ── */}
      <Modal visible={catPickerVisible} transparent animationType="fade" onRequestClose={() => setCatPickerVisible(false)}>
        <View style={s.overlay}>
          <View style={[s.modalSheet, { maxHeight: 460 }]}>
            <View style={s.modalHandle} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Select Category</Text>
              <TouchableOpacity onPress={() => setCatPickerVisible(false)}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[s.catRow, form.category === cat && { backgroundColor: theme.bgSecondary }]}
                  onPress={() => {
                    setForm(p => ({ ...p, category: cat }));
                    setCatPickerVisible(false);
                  }}
                >
                  <Text style={[s.catRowText, form.category === cat && { color: theme.accent, fontWeight: '700' }]}>
                    {cat}
                  </Text>
                  {form.category === cat && (
                    <Text style={{ color: theme.accent, fontWeight: '700' }}>✓</Text>
                  )}
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
    backgroundColor: theme.cardBg, borderRadius: 16,
    borderWidth: 0.5, borderColor: theme.border, overflow: 'hidden',
  },
  summaryRow: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 8 },
  summaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  summaryLabel: { fontSize: 11, color: theme.textSecondary },
  summaryValue: { fontSize: 15, fontWeight: '700', color: theme.text },
  summaryDivider: { width: 0.5, backgroundColor: theme.border },
  summaryDivider2: { height: 0.5, backgroundColor: theme.border },
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18,
    backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border,
  },
  filterPillActive: { backgroundColor: theme.text, borderColor: theme.text },
  filterPillText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  filterPillTextActive: { color: theme.bg },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
  emptySubtitle: { fontSize: 13, color: theme.textSecondary },
  vendorCardWrap: { borderRadius: 16 },
  vendorCard: {
    backgroundColor: theme.cardBg, borderRadius: 16,
    borderWidth: 0.5, borderColor: theme.border, overflow: 'hidden',
  },
  vendorCardTop: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  vendorInitial: {
    width: 42, height: 42, borderRadius: 13,
    backgroundColor: theme.accent + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  vendorInitialText: { fontSize: 18, fontWeight: '800', color: theme.accent },
  vendorName: { fontSize: 15, fontWeight: '700', color: theme.text },
  vendorCategory: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  quickStats: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingBottom: 12,
  },
  quickStatText: { fontSize: 12, color: theme.textSecondary },
  expandedSection: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  expandedDivider: { height: 0.5, backgroundColor: theme.border, marginBottom: 2 },
  expandedDetail: { fontSize: 13, color: theme.textSecondary, lineHeight: 20 },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  contactChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: theme.bgSecondary, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  contactText: { fontSize: 12, color: theme.textSecondary },
  notesBox: {
    backgroundColor: theme.bgSecondary, borderRadius: 10,
    padding: 10, borderWidth: 0.5, borderColor: theme.border,
  },
  notesText: { fontSize: 12, color: theme.textSecondary, lineHeight: 18 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  editBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10,
    backgroundColor: theme.bgSecondary, borderWidth: 0.5, borderColor: theme.border,
  },
  editBtnText: { fontSize: 13, fontWeight: '600', color: theme.text },
  overlay: { flex: 1, backgroundColor: '#00000099', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: theme.cardBg, borderTopLeftRadius: 24,
    borderTopRightRadius: 24, padding: 20, maxHeight: '90%', gap: 12,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: theme.border, alignSelf: 'center', marginBottom: 4,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  input: {
    backgroundColor: theme.bgSecondary, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    fontSize: 15, color: theme.text,
    borderWidth: 0.5, borderColor: theme.border,
  },
  balancePreview: {
    backgroundColor: '#F4433611', borderRadius: 10,
    padding: 10, borderWidth: 0.5, borderColor: '#F4433633',
  },
  balancePreviewText: { fontSize: 13, color: theme.textSecondary },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18,
    backgroundColor: theme.bgSecondary, borderWidth: 1, borderColor: theme.border,
  },
  chipText: { fontSize: 12, color: theme.textSecondary },
  saveBtn: {
    backgroundColor: theme.accent, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: theme.bg },
  catRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border,
    paddingHorizontal: 4,
  },
  catRowText: { fontSize: 14, color: theme.text },
});