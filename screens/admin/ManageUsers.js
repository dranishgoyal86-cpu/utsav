import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, ActivityIndicator, RefreshControl, Modal, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { ArrowLeft, Prohibit, ArrowCounterClockwise, TrashSimple } from 'phosphor-react-native';
import { showAlert, confirmAction } from '../../helpers';
import AppHeader from '../../components/AppHeader';
import { notifyAccountSuspended, notifyAccountReactivated } from '../../notifications';

const STATUS_STYLES = {
  active:            { label: 'Active',            color: '#4CAF50', bg: '#4CAF5022' },
  suspended:         { label: 'Suspended',         color: '#F44336', bg: '#F4433622' },
  pending_deletion:  { label: 'Deletion pending',  color: '#B45309', bg: '#B4530922' },
};

export default function ManageUsers({ navigation }) {
  const { theme } = useTheme();
  const s = styles(theme);

  const [activeTab, setActiveTab] = useState('providers'); // 'providers' | 'customers'
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'suspended'
  const [processing, setProcessing] = useState(null);
  const [suspendModal, setSuspendModal] = useState(null); // the row being suspended
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteModal, setDeleteModal] = useState(null); // the row being marked for deletion

  useEffect(() => { fetchRows(); }, [activeTab]);

  async function fetchRows() {
    try {
      setLoading(true);
      if (activeTab === 'providers') {
        // No joins — fetch providers, then their user rows, merge in JS.
        const { data: providersData, error } = await supabase
          .from('providers')
          .select('id, user_id, business_name, name, category, city, logo_url, is_verified, is_suspended')
          .order('business_name', { ascending: true, nullsFirst: false });
        if (error) throw error;

        const list = providersData || [];
        const userIds = [...new Set(list.map(p => p.user_id).filter(Boolean))];
        const { data: usersData } = userIds.length
          ? await supabase.from('users').select('id, name, email, phone').in('id', userIds)
          : { data: [] };

        setRows(list.map(p => ({
          id: p.id,
          user_id: p.user_id,
          isProvider: true,
          displayName: p.business_name || p.name || usersData?.find(u => u.id === p.user_id)?.name || 'Unnamed business',
          email: usersData?.find(u => u.id === p.user_id)?.email,
          phone: usersData?.find(u => u.id === p.user_id)?.phone,
          sub: [p.category, p.city].filter(Boolean).join(' · '),
          is_suspended: p.is_suspended,
          suspended_reason: null,
        })));
      } else {
        // Customers only — admins are excluded entirely so an admin account
        // can never even be selected here, no separate lockout guard needed.
        // deletion_requested_at fetched here too — Mark for deletion is
        // customer-only, same scope as the self-service in-app flow (see
        // supabase/migrations/account_deletion.sql's own comment on why
        // provider accounts are excluded: a provider's account is tied to a
        // public listing other customers' bookings/reviews reference).
        const { data: usersData, error } = await supabase
          .from('users')
          .select('id, name, email, phone, city, is_suspended, suspended_reason, deletion_requested_at')
          .eq('role', 'customer')
          .eq('is_admin', false)
          .order('name', { ascending: true, nullsFirst: false });
        if (error) throw error;

        setRows((usersData || []).map(u => ({
          id: u.id,
          user_id: u.id,
          isProvider: false,
          displayName: u.name || 'Unnamed customer',
          email: u.email,
          phone: u.phone,
          sub: u.city || '',
          is_suspended: u.is_suspended,
          suspended_reason: u.suspended_reason,
          deletion_requested_at: u.deletion_requested_at,
        })));
      }
    } catch (err) {
      console.log('ManageUsers fetch error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchRows();
  }, [activeTab]);

  function openSuspend(row) {
    setSuspendModal(row);
    setReason('');
  }

  async function confirmSuspend() {
    const row = suspendModal;
    if (!reason.trim()) {
      showAlert('Reason needed', 'Enter a reason before suspending — it will be shown to the account.');
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user: admin } } = await supabase.auth.getUser();

      const { error: uErr } = await supabase
        .from('users')
        .update({
          is_suspended: true,
          suspended_reason: reason.trim(),
          suspended_at: new Date().toISOString(),
          suspended_by: admin?.id || null,
        })
        .eq('id', row.user_id);
      if (uErr) throw uErr;

      if (row.isProvider) {
        const { error: pErr } = await supabase.from('providers').update({ is_suspended: true }).eq('id', row.id);
        if (pErr) throw pErr;
      }

      await notifyAccountSuspended(row.user_id, reason.trim());

      setSuspendModal(null);
      fetchRows();
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function reactivate(row) {
    confirmAction(
      'Reactivate this account?',
      `${row.displayName} will be able to log in again${row.isProvider ? ' and will reappear in search' : ''}.`,
      'Reactivate',
      async () => {
        setProcessing(row.id);
        try {
          const { error: uErr } = await supabase
            .from('users')
            .update({ is_suspended: false, suspended_reason: null, suspended_at: null, suspended_by: null })
            .eq('id', row.user_id);
          if (uErr) throw uErr;

          if (row.isProvider) {
            const { error: pErr } = await supabase.from('providers').update({ is_suspended: false }).eq('id', row.id);
            if (pErr) throw pErr;
          }

          await notifyAccountReactivated(row.user_id);
          fetchRows();
        } catch (err) {
          showAlert('Error', err.message);
        } finally {
          setProcessing(null);
        }
      }
    );
  }

  // For a customer who emailed privacy@utsav.app (delete-account.html's
  // no-app-access path) instead of using the in-app self-service flow.
  // Sets the exact same deletion_requested_at column ProfileScreen.js's own
  // "Delete my account" writes — same 14-day grace period, same daily
  // purge-deleted-accounts cron picks it up identically either way.
  async function confirmDeleteRequest() {
    const row = deleteModal;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ deletion_requested_at: new Date().toISOString() })
        .eq('id', row.user_id);
      if (error) throw error;
      setDeleteModal(null);
      fetchRows();
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Undo path — necessary, not just a nicety: once deletion_requested_at is
  // set, App.js's central login gate signs the account out and blocks login
  // the same way is_suspended does, so the account itself has no way to
  // self-cancel a mistaken or since-reconsidered request. This is the only
  // way back short of waiting out the 14-day grace period.
  function cancelDeleteRequest(row) {
    confirmAction(
      'Cancel this deletion request?',
      `${row.displayName} will be able to log in again, and nothing further will happen.`,
      'Cancel deletion',
      async () => {
        setProcessing(row.id);
        try {
          const { error } = await supabase
            .from('users')
            .update({ deletion_requested_at: null })
            .eq('id', row.user_id);
          if (error) throw error;
          fetchRows();
        } catch (err) {
          showAlert('Error', err.message);
        } finally {
          setProcessing(null);
        }
      }
    );
  }

  const filters = ['all', 'active', 'suspended'];
  const q = search.trim().toLowerCase();
  const filtered = rows
    .filter(r => statusFilter === 'all' ? true : statusFilter === 'suspended' ? r.is_suspended : !r.is_suspended)
    .filter(r => !q || [r.displayName, r.email, r.phone].filter(Boolean).some(v => v.toLowerCase().includes(q)));

  function renderRow({ item: row }) {
    const st = row.deletion_requested_at
      ? STATUS_STYLES.pending_deletion
      : row.is_suspended ? STATUS_STYLES.suspended : STATUS_STYLES.active;
    const isProcessing = processing === row.id;

    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{row.displayName}</Text>
            {row.sub ? <Text style={s.meta}>{row.sub}</Text> : null}
          </View>
          <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
            <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
          </View>
        </View>

        <View style={s.divider} />

        <Text style={s.contactText}>
          {[row.email, row.phone].filter(Boolean).join(' · ') || 'No contact info'}
        </Text>

        {row.is_suspended && row.suspended_reason ? (
          <View style={s.reasonBox}>
            <Text style={s.reasonLabel}>Suspension reason</Text>
            <Text style={s.reasonText}>{row.suspended_reason}</Text>
          </View>
        ) : null}

        {row.deletion_requested_at ? (
          <View style={s.reasonBox}>
            <Text style={s.reasonLabel}>Deletion requested</Text>
            <Text style={s.reasonText}>
              {new Date(row.deletion_requested_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              {' — permanently deleted on or after '}
              {new Date(new Date(row.deletion_requested_at).getTime() + 14 * 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </View>
        ) : null}

        <View style={s.actionRow}>
          {row.deletion_requested_at ? (
            <TouchableOpacity style={s.reactivateBtn} onPress={() => cancelDeleteRequest(row)} disabled={isProcessing}>
              {isProcessing ? <ActivityIndicator size="small" color="#FFF" /> : (
                <>
                  <ArrowCounterClockwise size={16} color="#FFF" />
                  <Text style={s.reactivateBtnText}>Cancel deletion</Text>
                </>
              )}
            </TouchableOpacity>
          ) : row.is_suspended ? (
            <TouchableOpacity style={s.reactivateBtn} onPress={() => reactivate(row)} disabled={isProcessing}>
              {isProcessing ? <ActivityIndicator size="small" color="#FFF" /> : (
                <>
                  <ArrowCounterClockwise size={16} color="#FFF" />
                  <Text style={s.reactivateBtnText}>Reactivate</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.suspendBtn} onPress={() => openSuspend(row)} disabled={isProcessing}>
              <Prohibit size={16} color="#F44336" />
              <Text style={s.suspendBtnText}>Suspend</Text>
            </TouchableOpacity>
          )}

          {/* Mark for deletion — customer accounts only, matching the
              self-service in-app flow's own scope (see fetchRows' comment).
              Hidden once already pending, so there's exactly one deletion
              action visible at a time per row. */}
          {!row.isProvider && !row.deletion_requested_at && (
            <TouchableOpacity style={s.deleteBtn} onPress={() => setDeleteModal(row)} disabled={isProcessing}>
              <TrashSimple size={16} color="#B45309" />
              <Text style={s.deleteBtnText}>Mark for deletion</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Manage Users" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      <View style={s.tabRow}>
        <TouchableOpacity style={[s.tabBtn, activeTab === 'providers' && s.tabBtnActive]} onPress={() => setActiveTab('providers')}>
          <Text style={[s.tabBtnText, activeTab === 'providers' && s.tabBtnTextActive]}>Providers</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tabBtn, activeTab === 'customers' && s.tabBtnActive]} onPress={() => setActiveTab('customers')}>
          <Text style={[s.tabBtnText, activeTab === 'customers' && s.tabBtnTextActive]}>Customers</Text>
        </TouchableOpacity>
      </View>

      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, email or phone"
          placeholderTextColor={theme.textTertiary}
        />
      </View>

      <View style={s.filterRow}>
        {filters.map(f => (
          <TouchableOpacity
            key={f}
            style={[s.filterPill, statusFilter === f && s.filterPillActive]}
            onPress={() => setStatusFilter(f)}
          >
            <Text style={[s.filterPillText, statusFilter === f && s.filterPillTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      ) : filtered.length === 0 ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 40 }}>{activeTab === 'providers' ? '🏢' : '👤'}</Text>
          <Text style={s.emptyTitle}>No {activeTab} found</Text>
          <Text style={s.emptySubtitle}>Try a different search or filter</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderRow}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        />
      )}

      <Modal visible={!!suspendModal} transparent animationType="fade" onRequestClose={() => setSuspendModal(null)}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Suspend {suspendModal?.displayName}?</Text>
            <Text style={s.modalHint}>
              They'll be signed out and blocked from logging in{suspendModal?.isProvider ? ', and hidden from search' : ''} until you reactivate them. Nothing of theirs is deleted.
            </Text>
            <Text style={s.label}>Reason (shown to the account)</Text>
            <TextInput
              style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]}
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Repeated no-shows reported by customers"
              placeholderTextColor={theme.textTertiary}
              multiline
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setSuspendModal(null)}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.confirmSuspendBtn} onPress={confirmSuspend} disabled={submitting}>
                {submitting ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={s.confirmSuspendBtnText}>Suspend</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!deleteModal} transparent animationType="fade" onRequestClose={() => setDeleteModal(null)}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Mark {deleteModal?.displayName} for deletion?</Text>
            <Text style={s.modalHint}>
              For a customer who emailed privacy@utsav.app instead of using the in-app "Delete my account" flow. They'll be signed out and blocked from logging in immediately, with a 14-day grace period before permanent deletion — the same process as if they'd requested it themselves in the app. You can cancel this any time before then.
            </Text>
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setDeleteModal(null)}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.confirmSuspendBtn} onPress={confirmDeleteRequest} disabled={submitting}>
                {submitting ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={s.confirmSuspendBtnText}>Mark for deletion</Text>}
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
  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  tabBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12,
    backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border,
  },
  tabBtnActive: { backgroundColor: theme.text, borderColor: theme.text },
  tabBtnText: { fontSize: 13, fontWeight: '700', color: theme.textSecondary },
  tabBtnTextActive: { color: theme.bg },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12 },
  searchInput: {
    borderWidth: 1, borderColor: theme.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: theme.text, backgroundColor: theme.cardBg,
  },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
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
  name: { fontSize: 16, fontWeight: '700', color: theme.text },
  meta: { fontSize: 12.5, color: theme.textSecondary, marginTop: 2 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  divider: { height: 0.5, backgroundColor: theme.border, marginVertical: 2 },
  contactText: { fontSize: 13, color: theme.textSecondary },
  reasonBox: {
    backgroundColor: theme.bg, borderRadius: 10, padding: 12,
    borderWidth: 0.5, borderColor: theme.border, gap: 3,
  },
  reasonLabel: { fontSize: 11.5, fontWeight: '700', color: theme.textSecondary },
  reasonText: { fontSize: 13, color: theme.text },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  suspendBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#F4433611', borderWidth: 0.5, borderColor: '#F4433644',
  },
  suspendBtnText: { fontSize: 14, fontWeight: '700', color: '#F44336' },
  reactivateBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#4CAF50',
  },
  reactivateBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  deleteBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#B4530911', borderWidth: 0.5, borderColor: '#B4530944',
  },
  deleteBtnText: { fontSize: 14, fontWeight: '700', color: '#B45309' },
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
  confirmSuspendBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#F44336' },
  confirmSuspendBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
});
