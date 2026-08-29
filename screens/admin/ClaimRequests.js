import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert, Image, Modal, RefreshControl, Platform, Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import {
  ArrowLeft, Check, X, Phone, FileText,
  ArrowSquareOut, User
} from 'phosphor-react-native';
import { showAlert, getSignedDocumentUrl } from '../../helpers';
import AppHeader from '../../components/AppHeader';
import { autoDescription } from '../../serviceTemplates';
import { sendBulkImportInviteEmail } from '../../lib/bulkImportInvite';

const DOCUMENT_LABELS = {
  business_image: 'Business image',
  gst_certificate: 'GST certificate',
  visiting_card: 'Visiting card',
  letterhead: 'Letterhead',
  other_govt_id: 'Other govt. ID',
};

const STATUS_STYLES = {
  pending:  { label: 'Pending',  color: '#FF9800', bg: '#FF980022' },
  approved: { label: 'Approved', color: '#4CAF50', bg: '#4CAF5022' },
  rejected: { label: 'Rejected', color: '#F44336', bg: '#F4433622' },
};

export default function ClaimRequests({ navigation }) {
  const { theme } = useTheme();
  const s = styles(theme);

  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('pending');
  const [processing, setProcessing] = useState(null); // claim id being processed
  const [proofModal, setProofModal] = useState(null); // resolved (viewable) proof url
  const [resolvingProof, setResolvingProof] = useState(null); // claim id being resolved

  // document_type set → business_proof_url is a private-bucket PATH
  // (stringent existing-listing claims) needing a fresh signed URL each
  // view; null → it's already a public Cloudinary URL (legacy/new-listing
  // light-path claims), rendered as-is like before.
  async function viewProof(claim) {
    if (!claim.document_type) {
      setProofModal(claim.business_proof_url);
      return;
    }
    setResolvingProof(claim.id);
    try {
      const signedUrl = await getSignedDocumentUrl(claim.business_proof_url);
      if (!signedUrl) { showAlert('Error', 'Could not load this document.'); return; }
      setProofModal(signedUrl);
    } finally {
      setResolvingProof(null);
    }
  }

  useEffect(() => { fetchClaims(); }, []);

  async function fetchClaims() {
    try {
      // 1. Claims
      const { data: claimsData, error } = await supabase
        .from('provider_claims')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const list = claimsData || [];
      if (list.length === 0) { setClaims([]); return; }

      // 2. Join providers + claimant users manually (two-query pattern)
      const providerIds = [...new Set(list.map(c => c.provider_id))];
      const userIds = [...new Set(list.map(c => c.claimant_user_id))];

      const [{ data: providers }, { data: users }] = await Promise.all([
        supabase.from('providers').select('id, name, category, city, is_claimed').in('id', providerIds),
        supabase.from('users').select('id, name, email, phone, phone_verified_at, email_verified_at').in('id', userIds),
      ]);

      setClaims(list.map(c => ({
        ...c,
        provider: providers?.find(p => p.id === c.provider_id) || null,
        claimant: users?.find(u => u.id === c.claimant_user_id) || null,
      })));
    } catch (err) {
      console.log('fetchClaims error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchClaims();
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

  async function approveClaim(claim) {
    confirm(
      'Approve claim?',
      `"${claim.provider?.name}" will be linked to ${claim.claimant?.name || claim.claimant_name} and they will become a provider.`,
      async () => {
        setProcessing(claim.id);
        try {
          const { data: { user } } = await supabase.auth.getUser();

          // 1. Link provider to claimant + mark claimed
          const { error: pErr } = await supabase
            .from('providers')
            .update({
              is_claimed: true,
              user_id: claim.claimant_user_id,
              phone: claim.claimant_phone,
              // Only overwrite category if the claimant actually declared a
              // Major Head — older claims predating this feature won't have
              // one, and shouldn't wipe out whatever the listing already had.
              ...(claim.claimed_category ? { category: claim.claimed_category } : {}),
            })
            .eq('id', claim.provider_id);
          if (pErr) throw pErr;

          // 1b. Each subcategory the claimant picked becomes a real service —
          // created here (on approval), not at claim submission, so a
          // rejected claim never leaves junk services attached to a listing
          // someone else might legitimately claim later. Skips cleanly for
          // claims filed before this feature existed (claimed_subcategories
          // null/empty).
          if (claim.claimed_subcategories?.length) {
            const { error: svcErr } = await supabase.from('services').insert(
              claim.claimed_subcategories.map(sub => ({
                provider_id: claim.provider_id,
                title: sub,
                category: sub,
                description: autoDescription(sub, claim.provider?.city),
                is_active: true,
              }))
            );
            if (svcErr) throw svcErr;
          }

          // 2. Promote claimant to provider role
          const { error: uErr } = await supabase
            .from('users')
            .update({ role: 'provider' })
            .eq('id', claim.claimant_user_id);
          if (uErr) throw uErr;

          // 3. Mark claim approved
          const { error: cErr } = await supabase
            .from('provider_claims')
            .update({
              status: 'approved',
              reviewed_by: user?.id,
              reviewed_at: new Date().toISOString(),
            })
            .eq('id', claim.id);
          if (cErr) throw cErr;

          // 4. Auto-reject other pending claims on the same provider
          await supabase
            .from('provider_claims')
            .update({
              status: 'rejected',
              reviewed_by: user?.id,
              reviewed_at: new Date().toISOString(),
            })
            .eq('provider_id', claim.provider_id)
            .eq('status', 'pending')
            .neq('id', claim.id);

          // Non-fatal (catches its own errors), self-guarding against a
          // duplicate send if this provider also later goes through
          // verification approval -- see lib/bulkImportInvite.js.
          await sendBulkImportInviteEmail(claim.provider_id);

          fetchClaims();
        } catch (err) {
          showAlert('Error', err.message);
        } finally {
          setProcessing(null);
        }
      }
    );
  }

  async function rejectClaim(claim) {
    confirm(
      'Reject claim?',
      `The claim by ${claim.claimant?.name || claim.claimant_name} for "${claim.provider?.name}" will be rejected.`,
      async () => {
        setProcessing(claim.id);
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const { error } = await supabase
            .from('provider_claims')
            .update({
              status: 'rejected',
              reviewed_by: user?.id,
              reviewed_at: new Date().toISOString(),
            })
            .eq('id', claim.id);
          if (error) throw error;
          fetchClaims();
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
  const filtered = activeFilter === 'all'
    ? claims
    : claims.filter(c => c.status === activeFilter);

  function renderClaim({ item: claim }) {
    const st = STATUS_STYLES[claim.status] || STATUS_STYLES.pending;
    const isProcessing = processing === claim.id;

    return (
      <View style={s.card}>
        {/* Business */}
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.businessName}>{claim.provider?.name || 'Unknown business'}</Text>
            <Text style={s.businessMeta}>
              {claim.provider?.category}{claim.provider?.city ? ` · ${claim.provider.city}` : ''}
            </Text>
            {claim.claimed_category ? (
              <Text style={s.businessMeta}>Declared category: {claim.claimed_category}</Text>
            ) : null}
            {claim.claimed_subcategories?.length ? (
              <Text style={s.businessMeta}>
                Services on approval: {claim.claimed_subcategories.join(', ')}
              </Text>
            ) : null}
          </View>
          <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
            <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* Claimant */}
        <View style={s.claimantRow}>
          <User size={14} color={theme.textSecondary} />
          <Text style={s.claimantText}>
            {claim.claimant_name}
            {claim.claimant?.email ? ` · ${claim.claimant.email}` : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={s.claimantRow}
          onPress={() => Linking.openURL(`tel:${claim.claimant_phone}`)}
        >
          <Phone size={14} color={theme.accent} />
          <Text style={[s.claimantText, { color: theme.accent, fontWeight: '600' }]}>
            {claim.claimant_phone}
          </Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Text style={[s.verifyBadge, { color: claim.claimant?.phone_verified_at ? '#4CAF50' : theme.textTertiary }]}>
            {claim.claimant?.phone_verified_at ? '✓ Phone verified' : 'Phone not verified'}
          </Text>
          <Text style={[s.verifyBadge, { color: claim.claimant?.email_verified_at ? '#4CAF50' : theme.textTertiary }]}>
            {claim.claimant?.email_verified_at ? '✓ Email verified' : 'Email not verified'}
          </Text>
        </View>

        {claim.message ? (
          <Text style={s.message}>💬 {claim.message}</Text>
        ) : null}

        {/* Proof */}
        {claim.business_proof_url ? (
          <TouchableOpacity
            style={s.proofBtn}
            onPress={() => viewProof(claim)}
            disabled={resolvingProof === claim.id}
          >
            {resolvingProof === claim.id ? (
              <ActivityIndicator size="small" color={theme.text} />
            ) : (
              <>
                <FileText size={14} color={theme.text} />
                <Text style={s.proofBtnText}>
                  View {claim.document_type ? DOCUMENT_LABELS[claim.document_type] || 'proof' : 'business proof'}
                </Text>
                <ArrowSquareOut size={12} color={theme.textSecondary} />
              </>
            )}
          </TouchableOpacity>
        ) : (
          <Text style={s.noProof}>No proof document attached</Text>
        )}

        <Text style={s.date}>
          Submitted {new Date(claim.created_at).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric'
          })}
        </Text>

        {/* Actions — only for pending */}
        {claim.status === 'pending' && (
          <View style={s.actionRow}>
            <TouchableOpacity
              style={s.rejectBtn}
              onPress={() => rejectClaim(claim)}
              disabled={isProcessing}
            >
              <X size={16} color="#F44336" />
              <Text style={s.rejectBtnText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.approveBtn}
              onPress={() => approveClaim(claim)}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
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
      {/* Header */}
      <AppHeader title="Claim Requests" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      {/* Filter pills */}
      <View style={s.filterRow}>
        {filters.map(f => (
          <TouchableOpacity
            key={f}
            style={[s.filterPill, activeFilter === f && s.filterPillActive]}
            onPress={() => setActiveFilter(f)}
          >
            <Text style={[s.filterPillText, activeFilter === f && s.filterPillTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== 'all' && ` (${claims.filter(c => c.status === f).length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      ) : filtered.length === 0 ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 40 }}>📋</Text>
          <Text style={s.emptyTitle}>No {activeFilter === 'all' ? '' : activeFilter} claims</Text>
          <Text style={s.emptySubtitle}>
            {activeFilter === 'pending'
              ? 'New claim requests will appear here'
              : 'Try a different filter'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderClaim}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />
          }
        />
      )}

      {/* Proof viewer modal */}
      <Modal visible={!!proofModal} transparent animationType="fade" onRequestClose={() => setProofModal(null)}>
        <View style={s.proofOverlay}>
          <TouchableOpacity style={s.proofClose} onPress={() => setProofModal(null)}>
            <X size={24} color="#FFF" />
          </TouchableOpacity>
          {proofModal && (
            <Image
              source={{ uri: proofModal }}
              style={s.proofImage}
              resizeMode="contain"
            />
          )}
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
  filterRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12, flexWrap: 'wrap',
  },
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
  verifyBadge: { fontSize: 11.5, fontWeight: '600' },
  message: {
    fontSize: 12.5, color: theme.textSecondary, lineHeight: 18,
    backgroundColor: theme.bg, borderRadius: 10, padding: 10,
    borderWidth: 0.5, borderColor: theme.border,
  },
  proofBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: theme.bg, borderWidth: 0.5, borderColor: theme.border,
    alignSelf: 'flex-start',
  },
  proofBtnText: { fontSize: 13, fontWeight: '600', color: theme.text },
  noProof: { fontSize: 12, color: theme.textTertiary || theme.textSecondary, fontStyle: 'italic' },
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
  emptySubtitle: { fontSize: 13, color: theme.textSecondary },
  proofOverlay: {
    flex: 1, backgroundColor: '#000000EE',
    alignItems: 'center', justifyContent: 'center',
  },
  proofClose: {
    position: 'absolute', top: 56, right: 20, zIndex: 10,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FFFFFF22', alignItems: 'center', justifyContent: 'center',
  },
  proofImage: { width: '92%', height: '75%' },
});