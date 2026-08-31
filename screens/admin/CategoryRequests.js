import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, ActivityIndicator, Alert, RefreshControl, Platform, Modal, KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { ArrowLeft, Check, X, User, PencilSimple, Trash } from 'phosphor-react-native';
import { showAlert } from '../../helpers';
import AppHeader from '../../components/AppHeader';
import { notifyMoreInfoNeeded, notifyRequestRevoked } from '../../notifications';

const STATUS_STYLES = {
  pending:  { label: 'Pending',  color: '#FF9800', bg: '#FF980022' },
  approved: { label: 'Approved', color: '#4CAF50', bg: '#4CAF5022' },
  rejected: { label: 'Rejected', color: '#F44336', bg: '#F4433622' },
  more_info_needed: { label: 'More info', color: '#E8A020', bg: '#E8A02022' },
};

// Mirrors CategoryUpgradeRequests.js's list/filter/card shape — same review
// pattern admins already know from that screen, just a different table and
// a different approve action (insert a brand-new live category instead of
// upgrading a provider's existing one).
export default function CategoryRequests({ navigation }) {
  const { theme } = useTheme();
  const s = styles(theme);

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('pending');
  const [processing, setProcessing] = useState(null);
  const [approveModal, setApproveModal] = useState(null);
  const [approveIcon, setApproveIcon] = useState('');
  const [approveSubcategories, setApproveSubcategories] = useState('');
  // Per-card note drafts -- same reasoning as ClaimRequests.js: a flat
  // card list with no shared "selected" detail screen, so each card's
  // note is its own draft rather than one shared field.
  const [noteDrafts, setNoteDrafts] = useState({});
  function noteFor(req) {
    return noteDrafts[req.id] ?? (req.admin_notes || '');
  }
  function setNoteFor(reqId, text) {
    setNoteDrafts(prev => ({ ...prev, [reqId]: text }));
  }

  useEffect(() => { fetchRequests(); }, []);

  async function fetchRequests() {
    try {
      const { data: reqData, error } = await supabase
        .from('category_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const list = reqData || [];
      if (list.length === 0) { setRequests([]); return; }

      const userIds = [...new Set(list.map(r => r.requested_by).filter(Boolean))];
      const { data: users } = userIds.length
        ? await supabase.from('users').select('id, name, email, phone').in('id', userIds)
        : { data: [] };

      setRequests(list.map(r => ({
        ...r,
        requester: users?.find(u => u.id === r.requested_by) || null,
      })));
    } catch (err) {
      console.log('fetchRequests error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchRequests();
  }, []);

  function confirm(title, message, onYes, destructive = false) {
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) onYes();
    } else {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', style: destructive ? 'destructive' : 'default', onPress: onYes },
      ]);
    }
  }

  function openApprove(req) {
    setApproveModal(req);
    setApproveIcon('📌');
    setApproveSubcategories((req.suggested_subcategories || []).join(', '));
  }

  async function confirmApprove() {
    const req = approveModal;
    const subcategories = approveSubcategories.split(',').map(s => s.trim()).filter(Boolean);
    if (subcategories.length === 0) {
      showAlert('Subcategories needed', 'Add at least one subcategory (comma-separated) before approving.');
      return;
    }
    setProcessing(req.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error: cErr } = await supabase
        .from('custom_categories')
        .insert({
          name: req.category_name,
          icon: approveIcon.trim() || '📌',
          subcategories,
          source_request_id: req.id,
        });
      if (cErr) throw cErr;

      const { error: rErr } = await supabase
        .from('category_requests')
        .update({
          status: 'approved',
          approved_icon: approveIcon.trim() || '📌',
          approved_subcategories: subcategories,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', req.id);
      if (rErr) throw rErr;

      setApproveModal(null);
      fetchRequests();
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setProcessing(null);
    }
  }

  async function rejectRequest(req) {
    if (!noteFor(req).trim()) {
      showAlert('Add a note', 'Say why this request was rejected — this is what the requester will actually see.');
      return;
    }
    confirm(
      'Reject this request?',
      `"${req.category_name}" won't be added as a category.`,
      async () => {
        setProcessing(req.id);
        try {
          const { error } = await supabase
            .from('category_requests')
            .update({ status: 'rejected', admin_notes: noteFor(req).trim(), reviewed_at: new Date().toISOString() })
            .eq('id', req.id);
          if (error) throw error;
          fetchRequests();
        } catch (err) {
          showAlert('Error', err.message);
        } finally {
          setProcessing(null);
        }
      },
      true
    );
  }

  // Edit/revoke/delete/request-more-docs -- same scope as
  // AdminPanel.js/ClaimRequests.js, confirmed with the user.
  function requestMoreInfo(req) {
    if (!noteFor(req).trim()) {
      showAlert('Add a note', "Say what's missing — this is what the requester will actually see.");
      return;
    }
    confirm(
      'Request more info?',
      `Ask about "${req.category_name}" for more information? They'll be notified with your note and can resubmit.`,
      async () => {
        setProcessing(req.id);
        try {
          const { error } = await supabase
            .from('category_requests')
            .update({ status: 'more_info_needed', admin_notes: noteFor(req).trim(), reviewed_at: new Date().toISOString() })
            .eq('id', req.id);
          if (error) throw error;
          if (req.requested_by) {
            await notifyMoreInfoNeeded(req.requested_by, `category request for "${req.category_name}"`, noteFor(req).trim());
          }
          fetchRequests();
        } catch (err) {
          showAlert('Error', err.message);
        } finally {
          setProcessing(null);
        }
      }
    );
  }

  // Revoke an approved category: deletes the custom_categories row this
  // request created (source_request_id links them directly) and the
  // request itself. Checks live whether any provider has actually adopted
  // this category as their own before deleting -- doesn't block on it
  // (an admin correcting a mistake needs to be able to proceed either
  // way), but the confirm dialog surfaces the real count so the decision
  // is informed, not blind.
  async function revokeRequest(req) {
    if (!noteFor(req).trim()) {
      showAlert('Add a note', 'Say why this category is being revoked — this is what the requester will actually see.');
      return;
    }
    setProcessing(req.id);
    let inUseCount = 0;
    try {
      const { count, error: countErr } = await supabase
        .from('providers')
        .select('id', { count: 'exact', head: true })
        .eq('category', req.category_name);
      if (countErr) throw countErr;
      inUseCount = count || 0;
    } catch (err) {
      showAlert('Error', err.message);
      setProcessing(null);
      return;
    }
    setProcessing(null);

    const title = 'Revoke this category?';
    const msg = inUseCount > 0
      ? `"${req.category_name}" is currently the listed category for ${inUseCount} provider${inUseCount === 1 ? '' : 's'}. Removing it will leave ${inUseCount === 1 ? 'that provider' : 'them'} with a category that no longer exists in the app. This can't be undone from here.`
      : `"${req.category_name}" isn't in use by any provider yet. It will be removed and this request deleted. This can't be undone from here.`;
    confirm(title, msg, () => performRevoke(req), true);
  }

  async function performRevoke(req) {
    setProcessing(req.id);
    try {
      const { error: catErr } = await supabase
        .from('custom_categories').delete().eq('source_request_id', req.id);
      if (catErr) throw catErr;

      const { error: reqErr } = await supabase
        .from('category_requests').delete().eq('id', req.id);
      if (reqErr) throw reqErr;

      if (req.requested_by) {
        await notifyRequestRevoked(req.requested_by, `category request for "${req.category_name}"`, noteFor(req).trim());
      }
      fetchRequests();
      showAlert('Revoked', `"${req.category_name}" has been removed.`);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setProcessing(null);
    }
  }

  // Plain delete for rejected/more_info_needed -- never approved, nothing
  // to revoke, just a stale entry to clear.
  function deleteRequest(req) {
    confirm(
      'Delete this request?',
      `Permanently remove this request for "${req.category_name}"? This can't be undone.`,
      async () => {
        setProcessing(req.id);
        try {
          const { error } = await supabase.from('category_requests').delete().eq('id', req.id);
          if (error) throw error;
          fetchRequests();
        } catch (err) {
          showAlert('Error', err.message);
        } finally {
          setProcessing(null);
        }
      },
      true
    );
  }

  const filters = ['pending', 'approved', 'rejected', 'more_info_needed', 'all'];
  const filtered = activeFilter === 'all' ? requests : requests.filter(r => r.status === activeFilter);

  function renderRequest({ item: req }) {
    const st = STATUS_STYLES[req.status] || STATUS_STYLES.pending;
    const isProcessing = processing === req.id;

    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.businessName}>{req.category_name}</Text>
            {req.description ? <Text style={s.businessMeta}>{req.description}</Text> : null}
          </View>
          <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
            <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
          </View>
        </View>

        <View style={s.divider} />

        <View style={s.claimantRow}>
          <User size={14} color={theme.textSecondary} />
          <Text style={s.claimantText}>
            {req.requester?.name || req.requester_contact || 'Not logged in'}
            {req.requester?.phone ? ` · ${req.requester.phone}` : ''}
          </Text>
        </View>

        {req.suggested_subcategories?.length ? (
          <View style={s.serviceBox}>
            <Text style={s.serviceTitle}>Suggested subcategories</Text>
            <Text style={s.serviceMeta}>{req.suggested_subcategories.join(', ')}</Text>
          </View>
        ) : null}

        {req.status === 'approved' && req.approved_subcategories?.length ? (
          <View style={s.serviceBox}>
            <Text style={s.serviceTitle}>{req.approved_icon} Approved as</Text>
            <Text style={s.serviceMeta}>{req.approved_subcategories.join(', ')}</Text>
          </View>
        ) : null}

        <Text style={s.date}>
          Requested {new Date(req.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </Text>

        {req.admin_notes && req.status !== 'pending' && req.status !== 'approved' ? (
          <View style={s.prevNotesBox}>
            <Text style={s.prevNotesTitle}>Admin notes</Text>
            <Text style={s.prevNotesText}>{req.admin_notes}</Text>
          </View>
        ) : null}

        {(req.status === 'pending' || req.status === 'approved') && (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <PencilSimple size={12} color={theme.textSecondary} />
              <Text style={s.notesLabel}>Admin notes {req.status === 'pending' ? '(required for reject/more-info)' : '(required to revoke)'}</Text>
            </View>
            <TextInput
              style={s.notesInput}
              placeholder="Shown to the requester"
              placeholderTextColor={theme.textTertiary}
              value={noteFor(req)}
              onChangeText={t => setNoteFor(req.id, t)}
              multiline
            />
          </View>
        )}

        {req.status === 'pending' && (
          <View style={s.actionRow}>
            <TouchableOpacity style={s.rejectBtn} onPress={() => rejectRequest(req)} disabled={isProcessing}>
              <X size={16} color="#F44336" />
              <Text style={s.rejectBtnText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.moreInfoBtn} onPress={() => requestMoreInfo(req)} disabled={isProcessing}>
              <Text style={s.moreInfoBtnText}>📝 More info</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.approveBtn} onPress={() => openApprove(req)} disabled={isProcessing}>
              {isProcessing ? <ActivityIndicator size="small" color="#FFF" /> : (
                <>
                  <Check size={16} color="#FFF" />
                  <Text style={s.approveBtnText}>Approve</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
        {req.status === 'approved' && (
          <View style={s.actionRow}>
            <TouchableOpacity style={s.revokeBtn} onPress={() => revokeRequest(req)} disabled={isProcessing}>
              {isProcessing
                ? <ActivityIndicator size="small" color="#C62828" />
                : <Text style={s.revokeBtnText}>⛔ Revoke category</Text>}
            </TouchableOpacity>
          </View>
        )}
        {(req.status === 'rejected' || req.status === 'more_info_needed') && (
          <View style={s.actionRow}>
            <TouchableOpacity style={s.rejectBtn} onPress={() => deleteRequest(req)} disabled={isProcessing}>
              {isProcessing
                ? <ActivityIndicator size="small" color="#F44336" />
                : (<><Trash size={16} color="#F44336" /><Text style={s.rejectBtnText}>Delete</Text></>)}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Category Requests" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      <View style={s.filterRow}>
        {filters.map(f => (
          <TouchableOpacity
            key={f}
            style={[s.filterPill, activeFilter === f && s.filterPillActive]}
            onPress={() => setActiveFilter(f)}
          >
            <Text style={[s.filterPillText, activeFilter === f && s.filterPillTextActive]}>
              {f === 'more_info_needed' ? 'More info' : f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== 'all' && ` (${requests.filter(r => r.status === f).length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      ) : filtered.length === 0 ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 40 }}>🏷️</Text>
          <Text style={s.emptyTitle}>No {activeFilter === 'all' ? '' : activeFilter} requests</Text>
          <Text style={s.emptySubtitle}>
            {activeFilter === 'pending'
              ? "Vendors who can't find their category will show up here"
              : 'Try a different filter'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderRequest}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        />
      )}

      <Modal visible={!!approveModal} transparent animationType="fade" onRequestClose={() => setApproveModal(null)}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Approve "{approveModal?.category_name}"</Text>
            <Text style={s.modalHint}>
              This becomes a real, selectable category everywhere in the app the moment you approve it.
            </Text>
            <Text style={s.label}>Icon (one emoji)</Text>
            <TextInput style={s.input} value={approveIcon} onChangeText={setApproveIcon} placeholder="📌" placeholderTextColor={theme.textTertiary} />
            <Text style={s.label}>Subcategories (comma-separated)</Text>
            <TextInput
              style={[s.input, { minHeight: 70, textAlignVertical: 'top' }]}
              value={approveSubcategories}
              onChangeText={setApproveSubcategories}
              placeholder="e.g. Drone Light Shows, Drone Photography Add-on"
              placeholderTextColor={theme.textTertiary}
              multiline
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setApproveModal(null)}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.approveBtn} onPress={confirmApprove} disabled={processing === approveModal?.id}>
                {processing === approveModal?.id
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Text style={s.approveBtnText}>Confirm approval</Text>
                }
              </TouchableOpacity>
            </View>
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
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12, flexWrap: 'wrap' },
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18,
    backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border,
  },
  filterPillActive: { backgroundColor: theme.text, borderColor: theme.text },
  filterPillText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  filterPillTextActive: { color: theme.bg },
  card: {
    backgroundColor: theme.cardBg, borderRadius: 16, padding: 16,
    borderWidth: 0.5, borderColor: theme.border, gap: 8,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  businessName: { fontSize: 16, fontWeight: '700', color: theme.text },
  businessMeta: { fontSize: 12.5, color: theme.textSecondary, marginTop: 2 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  divider: { height: 0.5, backgroundColor: theme.border, marginVertical: 2 },
  claimantRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  claimantText: { fontSize: 13, color: theme.textSecondary, flex: 1 },
  serviceBox: {
    backgroundColor: theme.bg, borderRadius: 10, padding: 12,
    borderWidth: 0.5, borderColor: theme.border, gap: 3,
  },
  serviceTitle: { fontSize: 13.5, fontWeight: '700', color: theme.text },
  serviceMeta: { fontSize: 12, color: theme.accent, fontWeight: '600' },
  date: { fontSize: 11, color: theme.textTertiary || theme.textSecondary },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#F4433611', borderWidth: 0.5, borderColor: '#F4433644',
  },
  rejectBtnText: { fontSize: 14, fontWeight: '700', color: '#F44336' },
  approveBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#4CAF50',
  },
  approveBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  moreInfoBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#E8A02011', borderWidth: 0.5, borderColor: '#E8A02044',
  },
  moreInfoBtnText: { fontSize: 13, fontWeight: '700', color: '#E8A020' },
  revokeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#C6282814', borderWidth: 0.5, borderColor: '#C62828',
  },
  revokeBtnText: { fontSize: 14, fontWeight: '700', color: '#C62828' },
  notesLabel: { fontSize: 11.5, fontWeight: '700', color: theme.textSecondary },
  notesInput: {
    backgroundColor: theme.bgSecondary || theme.bg, borderRadius: 10, padding: 10, fontSize: 13,
    color: theme.text, borderWidth: 0.5, borderColor: theme.border, minHeight: 50, textAlignVertical: 'top',
  },
  prevNotesBox: { backgroundColor: '#E8A02014', borderRadius: 10, padding: 10 },
  prevNotesTitle: { fontSize: 11, fontWeight: '700', color: '#8A6D00', marginBottom: 3 },
  prevNotesText: { fontSize: 12.5, color: '#8A6D00', lineHeight: 17 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
  emptySubtitle: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', paddingHorizontal: 40 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: theme.bg, borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 6 },
  modalHint: { fontSize: 12.5, color: theme.textSecondary, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1, borderColor: theme.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: theme.text, backgroundColor: theme.cardBg,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalCancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.border },
  modalCancelText: { fontSize: 14, fontWeight: '700', color: theme.text },
});
