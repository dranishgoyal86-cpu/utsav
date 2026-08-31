import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, ActivityIndicator, Alert, RefreshControl, Platform
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

export default function CategoryUpgradeRequests({ navigation }) {
  const { theme } = useTheme();
  const s = styles(theme);

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('pending');
  const [processing, setProcessing] = useState(null);
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
        .from('category_upgrade_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const list = reqData || [];
      if (list.length === 0) { setRequests([]); return; }

      const providerIds = [...new Set(list.map(r => r.provider_id))];
      const userIds = [...new Set(list.map(r => r.requester_user_id))];

      const [{ data: providers }, { data: users }] = await Promise.all([
        supabase.from('providers').select('id, name, category, city').in('id', providerIds),
        supabase.from('users').select('id, name, email, phone').in('id', userIds),
      ]);

      setRequests(list.map(r => ({
        ...r,
        provider: providers?.find(p => p.id === r.provider_id) || null,
        requester: users?.find(u => u.id === r.requester_user_id) || null,
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

  async function approveRequest(req) {
    confirm(
      'Approve this upgrade?',
      `"${req.provider?.name}" will be upgraded to Event Planner, and the "${req.pending_service_data?.title}" service will go live immediately.`,
      async () => {
        setProcessing(req.id);
        try {
          const { data: { user } } = await supabase.auth.getUser();

          // A verified provider's category is locked at the DB level
          // (trigger on providers) — this RPC is the one sanctioned way
          // through it, with its own admin check as a second layer.
          const { error: pErr } = await supabase.rpc('admin_set_provider_category', {
            p_provider_id: req.provider_id,
            p_new_category: req.requested_category,
          });
          if (pErr) throw pErr;

          const { error: sErr } = await supabase
            .from('services').insert({ ...req.pending_service_data, provider_id: req.provider_id });
          if (sErr) throw sErr;

          const { error: rErr } = await supabase
            .from('category_upgrade_requests')
            .update({ status: 'approved', reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
            .eq('id', req.id);
          if (rErr) throw rErr;

          fetchRequests();
        } catch (err) {
          showAlert('Error', err.message);
        } finally {
          setProcessing(null);
        }
      }
    );
  }

  async function rejectRequest(req) {
    if (!noteFor(req).trim()) {
      showAlert('Add a note', 'Say why this request was rejected — this is what the provider will actually see.');
      return;
    }
    confirm(
      'Reject this request?',
      `"${req.provider?.name}" will stay registered under "${req.current_category}" and the pending service won't be created.`,
      async () => {
        setProcessing(req.id);
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const { error } = await supabase
            .from('category_upgrade_requests')
            .update({ status: 'rejected', admin_notes: noteFor(req).trim(), reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
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

  // Edit/revoke/delete/request-more-docs -- same scope as the other three
  // screens, confirmed with the user.
  function requestMoreInfo(req) {
    if (!noteFor(req).trim()) {
      showAlert('Add a note', "Say what's missing — this is what the provider will actually see.");
      return;
    }
    confirm(
      'Request more info?',
      `Ask ${req.provider?.name} for more information about this upgrade? They'll be notified with your note and can resubmit.`,
      async () => {
        setProcessing(req.id);
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const { error } = await supabase
            .from('category_upgrade_requests')
            .update({ status: 'more_info_needed', admin_notes: noteFor(req).trim(), reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
            .eq('id', req.id);
          if (error) throw error;
          if (req.requester_user_id) {
            await notifyMoreInfoNeeded(req.requester_user_id, `category upgrade request for "${req.provider?.name}"`, noteFor(req).trim());
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

  // Revoke an approved upgrade: reverts providers.category back to
  // current_category (the one real value this request actually stored,
  // unlike provider_claims' claimed_category which only has the NEW
  // value) via the same admin_set_provider_category RPC approval used --
  // it's a plain admin-checked category setter, symmetric either
  // direction. Deliberately does NOT delete the services row the approval
  // created -- same data-preservation call as every other revoke in this
  // feature (a provider may have real bookings against it by now).
  function revokeRequest(req) {
    if (!noteFor(req).trim()) {
      showAlert('Add a note', 'Say why this upgrade is being revoked — this is what the provider will actually see.');
      return;
    }
    confirm(
      'Revoke this upgrade?',
      `"${req.provider?.name}" will be reverted from "${req.requested_category}" back to "${req.current_category}" immediately, and this request deleted. The "${req.pending_service_data?.title}" service already created stays on the listing -- remove it separately if needed. They'll be notified with your note below. This can't be undone from here.`,
      async () => {
        setProcessing(req.id);
        try {
          const { error: catErr } = await supabase.rpc('admin_set_provider_category', {
            p_provider_id: req.provider_id,
            p_new_category: req.current_category,
          });
          if (catErr) throw catErr;

          const { error: delErr } = await supabase.from('category_upgrade_requests').delete().eq('id', req.id);
          if (delErr) throw delErr;

          if (req.requester_user_id) {
            await notifyRequestRevoked(req.requester_user_id, `category upgrade to "${req.requested_category}"`, noteFor(req).trim());
          }
          fetchRequests();
          showAlert('Revoked', `"${req.provider?.name}" is back to "${req.current_category}".`);
        } catch (err) {
          showAlert('Error', err.message);
        } finally {
          setProcessing(null);
        }
      },
      true
    );
  }

  // Plain delete for rejected/more_info_needed -- never approved, nothing
  // to revoke.
  function deleteRequest(req) {
    confirm(
      'Delete this request?',
      `Permanently remove this upgrade request for "${req.provider?.name}"? This can't be undone.`,
      async () => {
        setProcessing(req.id);
        try {
          const { error } = await supabase.from('category_upgrade_requests').delete().eq('id', req.id);
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
    const svc = req.pending_service_data || {};

    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.businessName}>{req.provider?.name || 'Unknown business'}</Text>
            <Text style={s.businessMeta}>
              {req.current_category} → {req.requested_category}
              {req.provider?.city ? ` · ${req.provider.city}` : ''}
            </Text>
          </View>
          <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
            <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
          </View>
        </View>

        <View style={s.divider} />

        <View style={s.claimantRow}>
          <User size={14} color={theme.textSecondary} />
          <Text style={s.claimantText}>
            {req.requester?.name || 'Unknown'}{req.requester?.phone ? ` · ${req.requester.phone}` : ''}
          </Text>
        </View>

        <View style={s.serviceBox}>
          <Text style={s.serviceTitle}>{svc.title}</Text>
          <Text style={s.serviceMeta}>
            {svc.category} · ₹{svc.price_from?.toLocaleString()}{svc.price_to ? ` – ₹${svc.price_to.toLocaleString()}` : '+'}
          </Text>
          {svc.description ? <Text style={s.serviceDesc}>{svc.description}</Text> : null}
        </View>

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
              placeholder="Shown to the provider"
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
            <TouchableOpacity style={s.approveBtn} onPress={() => approveRequest(req)} disabled={isProcessing}>
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
                : <Text style={s.revokeBtnText}>⛔ Revoke upgrade</Text>}
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
      <AppHeader title="Category Upgrade Requests" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

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
          <Text style={{ fontSize: 40 }}>🎪</Text>
          <Text style={s.emptyTitle}>No {activeFilter === 'all' ? '' : activeFilter} requests</Text>
          <Text style={s.emptySubtitle}>
            {activeFilter === 'pending'
              ? 'Providers asking to add a new service category will appear here'
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
  serviceDesc: { fontSize: 12, color: theme.textSecondary, lineHeight: 17, marginTop: 2 },
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
});
