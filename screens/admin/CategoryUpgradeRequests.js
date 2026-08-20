import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert, RefreshControl, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { ArrowLeft, Check, X, User } from 'phosphor-react-native';
import { showAlert } from '../../helpers';
import AppHeader from '../../components/AppHeader';

const STATUS_STYLES = {
  pending:  { label: 'Pending',  color: '#FF9800', bg: '#FF980022' },
  approved: { label: 'Approved', color: '#4CAF50', bg: '#4CAF5022' },
  rejected: { label: 'Rejected', color: '#F44336', bg: '#F4433622' },
};

export default function CategoryUpgradeRequests({ navigation }) {
  const { theme } = useTheme();
  const s = styles(theme);

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('pending');
  const [processing, setProcessing] = useState(null);

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
    confirm(
      'Reject this request?',
      `"${req.provider?.name}" will stay registered under "${req.current_category}" and the pending service won't be created.`,
      async () => {
        setProcessing(req.id);
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const { error } = await supabase
            .from('category_upgrade_requests')
            .update({ status: 'rejected', reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
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

  const filters = ['pending', 'approved', 'rejected', 'all'];
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

        {req.status === 'pending' && (
          <View style={s.actionRow}>
            <TouchableOpacity style={s.rejectBtn} onPress={() => rejectRequest(req)} disabled={isProcessing}>
              <X size={16} color="#F44336" />
              <Text style={s.rejectBtnText}>Reject</Text>
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
              {f.charAt(0).toUpperCase() + f.slice(1)}
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
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
  emptySubtitle: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', paddingHorizontal: 40 },
});
