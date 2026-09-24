import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Modal, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { showAlert, confirmDestructive } from '../../helpers';
import AppHeader from '../../components/AppHeader';
import { Plus, X } from 'phosphor-react-native';
import SwipeableRow from '../../components/SwipeableRow';

// Pre-quote lead list (open-source scan item #4, from ERPNext's
// lead -> opportunity -> quotation pipeline) — an informal "someone asked
// about pricing" note a provider can log themselves, independent of the
// formal QuoteInbox flow. "Manual 'Add a lead' button" (Anish, Sept 24) —
// no auto-detection from ProviderInbox chats, kept simple on purpose.
//
// Purely the provider's own private note-taking — no host_id on
// provider_leads at all (see the migration), so nothing here is visible
// to, or affects, any host or booking.
const STATUS = {
  new:       { label: 'New',       color: '#2196F3', bg: '#2196F322' },
  contacted: { label: 'Contacted', color: '#FF9800', bg: '#FF980022' },
  converted: { label: 'Converted', color: '#4CAF50', bg: '#4CAF5022' },
  dropped:   { label: 'Dropped',   color: '#9E9E9E', bg: '#9E9E9E22' },
};

const EMPTY_FORM = { name: '', phone: '', note: '', status: 'new' };

export default function LeadsList({ navigation }) {
  const { theme } = useTheme();
  const s = styles(theme);

  const [providerId, setProviderId] = useState(null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => { fetchLeads(); }, []);

  async function fetchLeads() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: provider } = await supabase.from('providers').select('id').eq('user_id', session.user.id).maybeSingle();
      if (!provider) return;
      setProviderId(provider.id);
      const { data, error } = await supabase
        .from('provider_leads')
        .select('id, name, phone, note, status, created_at')
        .eq('provider_id', provider.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setLeads(data || []);
    } catch (err) {
      console.log('Leads fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setModalVisible(true);
  }
  function openEdit(lead) {
    setForm({ name: lead.name, phone: lead.phone || '', note: lead.note || '', status: lead.status });
    setEditingId(lead.id);
    setModalVisible(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { showAlert('Name needed', "Enter who this lead is (a name or business)."); return; }
    setSaving(true);
    try {
      const payload = {
        provider_id: providerId,
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        note: form.note.trim() || null,
        status: form.status,
      };
      const { error } = editingId
        ? await supabase.from('provider_leads').update(payload).eq('id', editingId)
        : await supabase.from('provider_leads').insert(payload);
      if (error) throw error;
      setModalVisible(false);
      fetchLeads();
    } catch (err) {
      showAlert('Could not save that', err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(lead) {
    confirmDestructive('Remove this lead?', `Remove "${lead.name}" from your leads?`, async () => {
      await supabase.from('provider_leads').delete().eq('id', lead.id);
      fetchLeads();
    });
  }

  const filtered = activeFilter === 'all' ? leads : leads.filter(l => l.status === activeFilter);

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Leads" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      <View style={s.filterRow}>
        {['all', 'new', 'contacted', 'converted', 'dropped'].map(f => (
          <TouchableOpacity key={f} style={[s.filterChip, activeFilter === f && s.filterChipActive]} onPress={() => setActiveFilter(f)}>
            <Text style={[s.filterChipText, activeFilter === f && s.filterChipTextActive]}>
              {f === 'all' ? 'All' : STATUS[f].label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <View style={s.emptyWrap}>
          <Text style={s.emptyText}>
            {leads.length === 0
              ? "No leads yet. When someone asks about pricing informally — a message, a call, a walk-in — log it here so it doesn't just disappear."
              : "Nothing in this filter."}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
          {filtered.map(lead => {
            const st = STATUS[lead.status] || STATUS.new;
            return (
              <SwipeableRow key={lead.id} onDelete={() => handleDelete(lead)}>
                <TouchableOpacity style={s.card} onPress={() => openEdit(lead)}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text style={s.leadName}>{lead.name}</Text>
                    <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                      <Text style={[s.statusBadgeText, { color: st.color }]}>{st.label}</Text>
                    </View>
                  </View>
                  {!!lead.phone && <Text style={s.leadPhone}>{lead.phone}</Text>}
                  {!!lead.note && <Text style={s.leadNote} numberOfLines={2}>{lead.note}</Text>}
                </TouchableOpacity>
              </SwipeableRow>
            );
          })}
        </ScrollView>
      )}

      <TouchableOpacity style={s.fab} onPress={openAdd}>
        <Plus size={24} color={theme.btnPrimaryText} weight="bold" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={s.modalTitle}>{editingId ? 'Edit lead' : 'Add a lead'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}><X size={22} color={theme.text} /></TouchableOpacity>
            </View>
            <TextInput style={s.input} placeholder="Name or business" placeholderTextColor={theme.textTertiary} value={form.name} onChangeText={t => setForm(p => ({ ...p, name: t }))} />
            <TextInput style={[s.input, { marginTop: 8 }]} placeholder="Phone (optional)" placeholderTextColor={theme.textTertiary} value={form.phone} onChangeText={t => setForm(p => ({ ...p, phone: t }))} keyboardType="phone-pad" />
            <TextInput style={[s.input, { marginTop: 8, minHeight: 70, textAlignVertical: 'top' }]} placeholder="What did they ask about? (optional)" placeholderTextColor={theme.textTertiary} value={form.note} onChangeText={t => setForm(p => ({ ...p, note: t }))} multiline />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {Object.keys(STATUS).map(key => (
                <TouchableOpacity
                  key={key}
                  style={[s.statusChip, form.status === key && { backgroundColor: STATUS[key].bg, borderColor: STATUS[key].color }]}
                  onPress={() => setForm(p => ({ ...p, status: key }))}
                >
                  <Text style={[s.statusChipText, form.status === key && { color: STATUS[key].color, fontWeight: '700' }]}>{STATUS[key].label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.saveBtnText}>{editingId ? 'Save changes' : 'Add lead'}</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function styles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 12, flexWrap: 'wrap' },
    filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border },
    filterChipActive: { backgroundColor: theme.btnPrimary, borderColor: theme.btnPrimary },
    filterChipText: { fontSize: 12.5, fontWeight: '600', color: theme.text },
    filterChipTextActive: { color: theme.btnPrimaryText },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
    emptyText: { fontSize: 13.5, color: theme.textSecondary, textAlign: 'center', lineHeight: 19 },
    card: { backgroundColor: theme.cardBg, borderRadius: 16, borderWidth: 0.5, borderColor: theme.border, padding: 16, marginBottom: 12 },
    leadName: { fontSize: 14.5, fontWeight: '700', color: theme.text, flex: 1 },
    leadPhone: { fontSize: 12.5, color: theme.textSecondary, marginTop: 4 },
    leadNote: { fontSize: 12.5, color: theme.text, marginTop: 8, lineHeight: 17 },
    statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    statusBadgeText: { fontSize: 10.5, fontWeight: '700' },
    fab: { position: 'absolute', right: 20, bottom: 24, width: 54, height: 54, borderRadius: 27, backgroundColor: theme.btnPrimary, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: theme.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
    modalTitle: { fontSize: 16, fontWeight: '800', color: theme.text },
    input: { backgroundColor: theme.cardBg, borderRadius: 12, borderWidth: 0.5, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 11, fontSize: 13, color: theme.text },
    statusChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border },
    statusChipText: { fontSize: 12, fontWeight: '600', color: theme.text },
    saveBtn: { backgroundColor: theme.btnPrimary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
    saveBtnText: { fontSize: 13.5, fontWeight: '700', color: theme.btnPrimaryText },
  });
}
