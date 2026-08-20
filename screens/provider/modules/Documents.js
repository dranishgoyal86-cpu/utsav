import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Modal, ActivityIndicator, Linking, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../ThemeContext';
import { supabase } from '../../../supabase';
import { showAlert, confirmDestructive } from '../../../helpers';
import AppHeader from '../../../components/AppHeader';
import {
  ArrowLeft, Plus, X, PencilSimple, ArrowSquareOut, FileText
} from 'phosphor-react-native';
import SwipeableRow from '../../../components/SwipeableRow';

const DOC_TYPES = ['Contract', 'Invoice', 'Permit', 'ID Proof', 'Other'];

const DOC_STATUS = {
  draft:   { label: 'Draft',   color: '#9E9E9E', bg: '#9E9E9E22' },
  sent:    { label: 'Sent',    color: '#FF9800', bg: '#FF980022' },
  signed:  { label: 'Signed',  color: '#4CAF50', bg: '#4CAF5022' },
  pending: { label: 'Pending', color: '#2196F3', bg: '#2196F322' },
};

const EMPTY_FORM = {
  doc_name: '', doc_type: DOC_TYPES[0], status: 'draft', link: '', notes: '',
};

export default function Documents({ route, navigation }) {
  const { workspace } = route.params;
  const { theme } = useTheme();
  const s = styles(theme);

  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [typePickerVisible, setTypePickerVisible] = useState(false);

  useEffect(() => { fetchDocs(); }, []);

  async function fetchDocs() {
    try {
      const { data, error } = await supabase
        .from('event_documents')
        .select('*')
        .eq('workspace_id', workspace.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setDocs(data || []);
    } catch (err) {
      console.log('fetchDocs error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveDoc() {
    if (!form.doc_name.trim()) {
      showAlert('Required', 'Enter a document name.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        workspace_id: workspace.id,
        doc_name: form.doc_name.trim(),
        doc_type: form.doc_type,
        status: form.status,
        link: form.link.trim(),
        notes: form.notes.trim(),
      };

      if (editingId) {
        const { data, error } = await supabase
          .from('event_documents').update(payload).eq('id', editingId).select().single();
        if (error) throw error;
        setDocs(prev => prev.map(d => d.id === editingId ? data : d));
      } else {
        const { data, error } = await supabase
          .from('event_documents').insert(payload).select().single();
        if (error) throw error;
        setDocs(prev => [...prev, data]);
      }
      closeModal();
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteDoc(id) {
    confirmDestructive('Remove document?', 'This cannot be undone.', 'Remove', async () => {
      await supabase.from('event_documents').delete().eq('id', id);
      setDocs(prev => prev.filter(d => d.id !== id));
    });
  }

  function openEdit(doc) {
    setForm({
      doc_name: doc.doc_name,
      doc_type: doc.doc_type,
      status: doc.status,
      link: doc.link || '',
      notes: doc.notes || '',
    });
    setEditingId(doc.id);
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function openLink(url) {
    if (!url) return;
    const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    Linking.openURL(withScheme).catch(() => showAlert('Error', 'Could not open link.'));
  }

  const signedCount = docs.filter(d => d.status === 'signed').length;

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <AppHeader
        title="Documents & Contracts"
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
                <Text style={s.summaryLabel}>Total Documents</Text>
                <Text style={s.summaryValue}>{docs.length}</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryItem}>
                <Text style={[s.summaryValue, { color: '#4CAF50' }]}>{signedCount}</Text>
                <Text style={s.summaryLabel}>Signed</Text>
              </View>
            </View>
          </View>

          {/* Document List */}
          {docs.length === 0 ? (
            <View style={s.empty}>
              <Text style={{ fontSize: 40 }}>📄</Text>
              <Text style={s.emptyTitle}>No documents yet</Text>
              <Text style={s.emptySubtitle}>Tap + to add a contract or document</Text>
            </View>
          ) : (
            docs.map(doc => {
              const st = DOC_STATUS[doc.status];
              return (
                <SwipeableRow key={doc.id} style={s.docCardWrap} onDelete={() => deleteDoc(doc.id)}>
                  <View style={s.docCard}>
                    <View style={s.docCardTop}>
                      <View style={s.docIcon}>
                        <FileText size={18} color={theme.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.docName}>{doc.doc_name}</Text>
                        <Text style={s.docType}>{doc.doc_type}</Text>
                      </View>
                      <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                        <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
                      </View>
                    </View>

                    {doc.notes ? (
                      <Text style={s.docNotes}>{doc.notes}</Text>
                    ) : null}

                    <View style={s.docActions}>
                      {doc.link ? (
                        <TouchableOpacity style={s.linkBtn} onPress={() => openLink(doc.link)}>
                          <ArrowSquareOut size={14} color={theme.accent} />
                          <Text style={s.linkBtnText}>Open Link</Text>
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity style={s.editBtn} onPress={() => openEdit(doc)}>
                        <PencilSimple size={14} color={theme.text} />
                        <Text style={s.editBtnText}>Edit</Text>
                      </TouchableOpacity>
                    </View>
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
              <Text style={s.modalTitle}>{editingId ? 'Edit Document' : 'Add Document'}</Text>
              <TouchableOpacity onPress={closeModal}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }} contentContainerStyle={{ gap: 10 }}>
              <TextInput style={s.input} placeholder="Document name *" placeholderTextColor={theme.subtext}
                value={form.doc_name} onChangeText={v => setForm(p => ({ ...p, doc_name: v }))} />

              <TouchableOpacity style={s.input} onPress={() => setTypePickerVisible(true)}>
                <Text style={{ color: theme.text, fontSize: 15 }}>{form.doc_type}</Text>
              </TouchableOpacity>

              <TextInput style={s.input} placeholder="Link (Drive, Dropbox, etc.)" placeholderTextColor={theme.subtext}
                value={form.link} onChangeText={v => setForm(p => ({ ...p, link: v }))}
                autoCapitalize="none" keyboardType="url" />

              <Text style={s.fieldLabel}>Status</Text>
              <View style={s.chipRow}>
                {Object.entries(DOC_STATUS).map(([key, val]) => (
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

            <TouchableOpacity style={s.saveBtn} onPress={saveDoc} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color={theme.bg} />
                : <Text style={s.saveBtnText}>{editingId ? 'Update Document' : 'Add Document'}</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Type Picker Modal */}
      <Modal visible={typePickerVisible} transparent animationType="fade" onRequestClose={() => setTypePickerVisible(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, { maxHeight: 420 }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Select Type</Text>
              <TouchableOpacity onPress={() => setTypePickerVisible(false)}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {DOC_TYPES.map(type => (
                <TouchableOpacity
                  key={type}
                  style={[s.typeOption, form.doc_type === type && s.typeOptionActive]}
                  onPress={() => { setForm(p => ({ ...p, doc_type: type })); setTypePickerVisible(false); }}
                >
                  <Text style={[s.typeOptionText, form.doc_type === type && { color: theme.accent, fontWeight: '700' }]}>
                    {type}
                  </Text>
                  {form.doc_type === type && <Text style={{ color: theme.accent }}>✓</Text>}
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
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
  emptySubtitle: { fontSize: 13, color: theme.subtext },
  docCardWrap: { borderRadius: 16 },
  docCard: {
    backgroundColor: theme.card, borderRadius: 16, padding: 14,
    borderWidth: 0.5, borderColor: theme.border, gap: 10,
  },
  docCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  docIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: theme.accent + '22', alignItems: 'center', justifyContent: 'center',
  },
  docName: { fontSize: 15, fontWeight: '700', color: theme.text },
  docType: { fontSize: 12, color: theme.subtext, marginTop: 1 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  docNotes: { fontSize: 13, color: theme.subtext, lineHeight: 18 },
  docActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  linkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: theme.accent + '18', borderWidth: 0.5, borderColor: theme.accent,
  },
  linkBtnText: { fontSize: 12, fontWeight: '600', color: theme.accent },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: theme.inputBg, borderWidth: 0.5, borderColor: theme.border,
  },
  editBtnText: { fontSize: 12, fontWeight: '600', color: theme.text },
  deleteBtn: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10,
    backgroundColor: '#F4433611', borderWidth: 0.5, borderColor: '#F4433633',
  },
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
  typeOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border,
  },
  typeOptionActive: { backgroundColor: theme.inputBg },
  typeOptionText: { fontSize: 14, color: theme.text },
});
