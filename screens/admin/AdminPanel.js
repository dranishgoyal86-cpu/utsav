import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput, RefreshControl, Platform, Image, Linking, KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import { notifyProviderVerified } from '../../notifications';
import { getSignedDocumentUrl, showAlert } from '../../helpers';
import AppHeader from '../../components/AppHeader';

export default function AdminPanel({ navigation }) {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState('pending');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    pending: 0, approved: 0, rejected: 0, providers: 0
  });
  const [selected, setSelected] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const s = makeStyles(theme);

  useFocusEffect(
    useCallback(() => {
      fetchRequests();
    }, [activeTab])
  );

 async function fetchRequests() {
    try {
      setLoading(true);

      // 1. Fetch verification_requests with no joins
      const { data: reqData, error: reqError } = await supabase
        .from('verification_requests')
        .select('*')
        .eq('status', activeTab)
        .order('submitted_at', { ascending: true });

      if (reqError) {
        console.log('Verification requests fetch error:', reqError.message);
        setRequests([]);
        return;
      }

      const requestsList = reqData || [];

      if (requestsList.length === 0) {
        setRequests([]);
      } else {
        // 2. Fetch related providers separately
        const providerIds = requestsList.map(r => r.provider_id).filter(Boolean);
        const { data: providersData } = await supabase
          .from('providers')
          .select('id, category, city, rating, total_reviews, logo_url, google_maps_url')
          .in('id', providerIds);

        // 3. Fetch related users separately
        const userIds = requestsList.map(r => r.user_id).filter(Boolean);
        const { data: usersData } = await supabase
          .from('users')
          .select('id, name, email, phone')
          .in('id', userIds);

        // 3b. Legal documents (PAN/Udyam/GST certificate scans) — keyed by
        // the same user id, so an admin reviewing verification sees the
        // fuller compliance picture in one place, not just the request's
        // own single proof upload.
        const { data: billingData } = userIds.length
          ? await supabase
              .from('provider_billing')
              .select('provider_user_id, pan_card_url, udyam_certificate_url, gst_certificate_url, udyam_number')
              .in('provider_user_id', userIds)
          : { data: [] };

        // 4. Manually join in JS
        const merged = requestsList.map(req => ({
          ...req,
          providers: providersData?.find(p => p.id === req.provider_id) || null,
          users: usersData?.find(u => u.id === req.user_id) || null,
          billing: billingData?.find(b => b.provider_user_id === req.user_id) || null,
        }));

        setRequests(merged);
      }

      // Stats (unchanged — these don't use joins, so they were never the problem)
      const [p, a, r, pr] = await Promise.all([
        supabase.from('verification_requests')
          .select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('verification_requests')
          .select('*', { count: 'exact', head: true }).eq('status', 'approved'),
        supabase.from('verification_requests')
          .select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
        supabase.from('providers')
          .select('*', { count: 'exact', head: true }),
      ]);

      setStats({
        pending: p.count || 0,
        approved: a.count || 0,
        rejected: r.count || 0,
        providers: pr.count || 0,
      });
    } catch (err) {
      console.log('Admin fetch error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

async function handleAction(request, action) {
    const confirmTitle = action === 'approved' ? 'Approve verification?' : 'Reject application?';
    const confirmMsg = action === 'approved'
      ? `Verify ${request.users?.name}? They will get a verified badge and notification.`
      : `Reject ${request.users?.name}'s application?`;

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`${confirmTitle}\n\n${confirmMsg}`);
      if (!confirmed) return;
      await performAction(request, action);
    } else {
      Alert.alert(
        confirmTitle,
        confirmMsg,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: action === 'approved' ? '✓ Approve' : '✗ Reject',
            style: action === 'rejected' ? 'destructive' : 'default',
            onPress: () => performAction(request, action)
          }
        ]
      );
    }
  }

  async function performAction(request, action) {
    try {
      setProcessing(true);
      const { data: { session } } = await supabase.auth.getSession();

      const { error: reqError } = await supabase
        .from('verification_requests')
        .update({
          status: action,
          admin_notes: adminNotes.trim() || null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: session?.user.id,
        })
        .eq('id', request.id);

      if (reqError) throw reqError;

      if (action === 'approved') {
        const { error: provError } = await supabase
          .from('providers')
          .update({ is_verified: true, is_active: true })
          .eq('id', request.provider_id);
        if (provError) throw provError;
        await notifyProviderVerified(request.user_id);
      }

      setSelected(null);
      setAdminNotes('');
      await fetchRequests();

      const successTitle = action === 'approved' ? 'Approved! ✓' : 'Rejected';
      const successMsg = action === 'approved'
        ? `${request.users?.name} has been verified and notified.`
        : `${request.users?.name}'s application has been rejected.`;

      if (Platform.OS === 'web') {
        window.alert(`${successTitle}\n\n${successMsg}`);
      } else {
        Alert.alert(successTitle, successMsg);
      }
    } catch (err) {
      if (Platform.OS === 'web') {
        window.alert('Error: ' + err.message);
      } else {
        Alert.alert('Error', err.message);
      }
    } finally {
      setProcessing(false);
    }
  }

  // The three legal documents (PAN/Udyam/GST certificate) live in the
  // private provider_documents bucket as storage paths, not public URLs —
  // need a freshly-signed URL each time one is opened.
  async function openProviderDocument(path) {
    const url = await getSignedDocumentUrl(path);
    if (!url) { showAlert('Error', "Couldn't open this document."); return; }
    Linking.openURL(url);
  }

  async function handleLogout() {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Log out? You will need to sign in again.');
      if (!confirmed) return;
      const { error } = await supabase.auth.signOut();
      if (error) {
        window.alert('Logout failed: ' + error.message);
        console.log('Logout error:', error.message);
      }
    } else {
      Alert.alert(
        'Log out?',
        'You will need to sign in again.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Log out',
            style: 'destructive',
            onPress: async () => {
              const { error } = await supabase.auth.signOut();
              if (error) console.log('Logout error:', error.message);
            }
          }
        ]
      );
    }
  }

  // ── Detail / review screen ──────────────────────
  if (selected) {
    return (
      <SafeAreaView style={s.container}>
        <AppHeader
          title="Review application"
          onBack={() => { setSelected(null); setAdminNotes(''); }}
          theme={theme}
          navigation={navigation}
        />

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <FlatList
          data={[]}
          renderItem={null}
          ListHeaderComponent={
            <View>
              {/* Applicant card */}
              <View style={s.applicantCard}>
                <View style={s.applicantAvatar}>
                  <Text style={s.applicantAvatarText}>
                    {selected.users?.name?.[0] || '?'}
                  </Text>
                </View>
                <View style={s.applicantInfo}>
                  <Text style={s.applicantName}>{selected.users?.name}</Text>
                  <Text style={s.applicantContact}>{selected.users?.email}</Text>
                  <Text style={s.applicantContact}>{selected.users?.phone}</Text>
                </View>
              </View>

              {/* ID / business proof document — the admin should actually see
                  this before approving, otherwise the badge is meaningless */}
              {selected.id_proof_url ? (
                <TouchableOpacity
                  style={s.proofCard}
                  onPress={() => Linking.openURL(selected.id_proof_url)}
                >
                  <Text style={s.proofLabel}>📎 ID / business proof</Text>
                  <Image source={{ uri: selected.id_proof_url }} style={s.proofImage} resizeMode="cover" />
                  <Text style={s.proofHint}>Tap to view full size</Text>
                </TouchableOpacity>
              ) : (
                <View style={s.proofMissingCard}>
                  <Text style={s.proofMissingText}>⚠️ No ID/business proof was submitted with this application</Text>
                </View>
              )}

              {/* Business Profile — logo, Maps listing, legal documents. The
                  fuller compliance picture, separate from this request's own
                  single proof upload. */}
              <View style={s.docsCard}>
                <Text style={s.docsCardTitle}>Business Profile</Text>
                {selected.providers?.logo_url && (
                  <View style={[s.docsRow, { alignItems: 'center' }]}>
                    <Text style={s.docsRowLabel}>Logo</Text>
                    <Image source={{ uri: selected.providers.logo_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                  </View>
                )}
                <View style={s.docsRow}>
                  <Text style={s.docsRowLabel}>Google Maps listing</Text>
                  {selected.providers?.google_maps_url ? (
                    <TouchableOpacity onPress={() => Linking.openURL(selected.providers.google_maps_url)}>
                      <Text style={s.docsRowLink}>Open</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={s.docsRowMissing}>Not set</Text>
                  )}
                </View>
                {[
                  { label: 'PAN card', path: selected.billing?.pan_card_url },
                  { label: `Udyam certificate${selected.billing?.udyam_number ? ` (${selected.billing.udyam_number})` : ''}`, path: selected.billing?.udyam_certificate_url },
                  { label: 'GST certificate', path: selected.billing?.gst_certificate_url },
                ].map(doc => (
                  <View key={doc.label} style={s.docsRow}>
                    <Text style={s.docsRowLabel}>{doc.label}</Text>
                    {doc.path ? (
                      <TouchableOpacity onPress={() => openProviderDocument(doc.path)}>
                        <Text style={s.docsRowLink}>View</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={s.docsRowMissing}>Not uploaded</Text>
                    )}
                  </View>
                ))}
              </View>

              {/* Details */}
              <View style={s.detailsCard}>
                {[
                  { label: 'Business name', value: selected.business_name, icon: '🏢' },
                  { label: 'Business type', value: selected.business_type, icon: '📋' },
                  { label: 'Experience', value: selected.years_experience, icon: '⏱' },
                  { label: 'Service areas', value: selected.service_areas, icon: '📍' },
                  { label: 'Category', value: selected.providers?.category, icon: '🛠' },
                  { label: 'City', value: selected.providers?.city, icon: '🌆' },
                ].map((item, i, arr) => (
                  <View
                    key={item.label}
                    style={[
                      s.detailRow,
                      i === arr.length - 1 && { borderBottomWidth: 0 }
                    ]}
                  >
                    <View style={s.detailLeft}>
                      <Text style={s.detailIcon}>{item.icon}</Text>
                      <Text style={s.detailLabel}>{item.label}</Text>
                    </View>
                    <Text style={s.detailValue} numberOfLines={2}>
                      {item.value || '—'}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Provider stats */}
              <View style={s.statsCard}>
                <View style={s.statBox}>
                  <Text style={s.statValue}>
                    ⭐ {selected.providers?.rating?.toFixed(1) || 'New'}
                  </Text>
                  <Text style={s.statLabel}>Rating</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statBox}>
                  <Text style={s.statValue}>
                    {selected.providers?.total_reviews || 0}
                  </Text>
                  <Text style={s.statLabel}>Reviews</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statBox}>
                  <Text style={s.statValue}>
                    {new Date(selected.submitted_at).toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short'
                    })}
                  </Text>
                  <Text style={s.statLabel}>Applied</Text>
                </View>
              </View>

              {/* Previous admin notes */}
              {selected.admin_notes ? (
                <View style={s.prevNotesBox}>
                  <Text style={s.prevNotesTitle}>Previous admin notes</Text>
                  <Text style={s.prevNotesText}>{selected.admin_notes}</Text>
                </View>
              ) : null}

              {/* Admin notes input — only for pending */}
              {activeTab === 'pending' && (
                <View style={s.notesSection}>
                  <Text style={s.notesLabel}>Admin notes (optional)</Text>
                  <Text style={s.notesSub}>
                    Shown to provider — especially important if rejecting
                  </Text>
                  <TextInput
                    style={s.notesInput}
                    placeholder="e.g. Please provide more details about your experience..."
                    placeholderTextColor={theme.textTertiary}
                    value={adminNotes}
                    onChangeText={setAdminNotes}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                </View>
              )}

              <View style={{ height: 120 }} />
            </View>
          }
        />

        {/* Action buttons — only for pending */}
        {activeTab === 'pending' && (
          <View style={s.actionBar}>
            <TouchableOpacity
              style={[s.rejectBtn, processing && { opacity: 0.6 }]}
              onPress={() => handleAction(selected, 'rejected')}
              disabled={processing}
            >
              <Text style={s.rejectBtnText}>✗  Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.approveBtn, processing && { opacity: 0.6 }]}
              onPress={() => handleAction(selected, 'approved')}
              disabled={processing}
            >
              {processing
                ? <ActivityIndicator color="#FFF" />
                : <Text style={s.approveBtnText}>✓  Approve & verify</Text>
              }
            </TouchableOpacity>
          </View>
        )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Main list screen ────────────────────────────
  return (
    <SafeAreaView style={s.container}>
      <AppHeader
        title="Admin panel"
        theme={theme}
        navigation={navigation}
        rightActions={[
          <TouchableOpacity key="logout" style={s.logoutBtn} onPress={handleLogout}>
            <Text style={s.logoutText}>Logout</Text>
          </TouchableOpacity>,
        ]}
      />
      <Text style={[s.headerSub, { paddingHorizontal: 20, marginTop: -10, marginBottom: 10 }]}>Utsav platform management</Text>

      {/* Stats row */}
      <View style={s.statsRow}>
        <View style={[s.statCard, stats.pending > 0 && s.statCardAlert]}>
          <Text style={[s.statCardValue, stats.pending > 0 && { color: '#E8A020' }]}>
            {stats.pending}
          </Text>
          <Text style={s.statCardLabel}>Pending</Text>
          {stats.pending > 0 && (
            <View style={s.alertDot}>
              <Text style={s.alertDotText}>!</Text>
            </View>
          )}
        </View>
        <View style={s.statCard}>
          <Text style={[s.statCardValue, { color: '#2E7D32' }]}>
            {stats.approved}
          </Text>
          <Text style={s.statCardLabel}>Approved</Text>
        </View>
        <View style={s.statCard}>
          <Text style={[s.statCardValue, { color: '#C62828' }]}>
            {stats.rejected}
          </Text>
          <Text style={s.statCardLabel}>Rejected</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statCardValue}>{stats.providers}</Text>
          <Text style={s.statCardLabel}>Providers</Text>
        </View>
      </View>

      {/* Claim requests link */}
      <TouchableOpacity
        style={s.claimsLink}
        onPress={() => navigation.navigate('ClaimRequests')}
      >
        <Text style={s.claimsLinkIcon}>📋</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.claimsLinkTitle}>Business claim requests</Text>
          <Text style={s.claimsLinkSub}>Review claims on unclaimed listings</Text>
        </View>
        <Text style={s.claimsLinkArrow}>›</Text>
      </TouchableOpacity>

      {/* Category upgrade requests link */}
      <TouchableOpacity
        style={s.claimsLink}
        onPress={() => navigation.navigate('CategoryUpgradeRequests')}
      >
        <Text style={s.claimsLinkIcon}>🎪</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.claimsLinkTitle}>Category upgrade requests</Text>
          <Text style={s.claimsLinkSub}>Review providers asking to become Event Planners</Text>
        </View>
        <Text style={s.claimsLinkArrow}>›</Text>
      </TouchableOpacity>

      {/* Category requests link */}
      <TouchableOpacity
        style={s.claimsLink}
        onPress={() => navigation.navigate('CategoryRequests')}
      >
        <Text style={s.claimsLinkIcon}>🏷️</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.claimsLinkTitle}>Category requests</Text>
          <Text style={s.claimsLinkSub}>Review vendors asking for a new category</Text>
        </View>
        <Text style={s.claimsLinkArrow}>›</Text>
      </TouchableOpacity>

      {/* Manage users link */}
      <TouchableOpacity
        style={s.claimsLink}
        onPress={() => navigation.navigate('ManageUsers')}
      >
        <Text style={s.claimsLinkIcon}>🚫</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.claimsLinkTitle}>Manage users</Text>
          <Text style={s.claimsLinkSub}>Suspend or reactivate provider and customer accounts</Text>
        </View>
        <Text style={s.claimsLinkArrow}>›</Text>
      </TouchableOpacity>

      {/* Capabilities link */}
      <TouchableOpacity
        style={s.claimsLink}
        onPress={() => navigation.navigate('CapabilitiesAdmin')}
      >
        <Text style={s.claimsLinkIcon}>🧩</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.claimsLinkTitle}>Capabilities</Text>
          <Text style={s.claimsLinkSub}>Manage which features show for which event/venue types</Text>
        </View>
        <Text style={s.claimsLinkArrow}>›</Text>
      </TouchableOpacity>

      {/* Tabs */}
      <View style={s.tabRow}>
        {['pending', 'approved', 'rejected'].map(tab => (
          <TouchableOpacity
            key={tab}
            style={[s.tab, activeTab === tab && s.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'pending' && stats.pending > 0
                ? ` (${stats.pending})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {loading ? (
        <View style={s.centerBox}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={s.loadingText}>Loading applications...</Text>
        </View>
      ) : requests.length === 0 ? (
        <View style={s.centerBox}>
          <Text style={s.emptyIcon}>
            {activeTab === 'pending' ? '📭' : activeTab === 'approved' ? '✅' : '❌'}
          </Text>
          <Text style={s.emptyTitle}>No {activeTab} applications</Text>
          <Text style={s.emptySub}>
            {activeTab === 'pending'
              ? 'All caught up! No applications waiting.'
              : `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} applications appear here.`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={item => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchRequests(); }}
              tintColor={theme.accent}
            />
          }
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.requestCard}
              onPress={() => { setSelected(item); setAdminNotes(''); }}
            >
              <View style={s.requestTop}>
                <View style={s.requestAvatar}>
                  <Text style={s.requestAvatarText}>
                    {item.users?.name?.[0] || '?'}
                  </Text>
                </View>
                <View style={s.requestInfo}>
                  <Text style={s.requestName}>{item.users?.name}</Text>
                  <Text style={s.requestBusiness}>{item.business_name}</Text>
                  <Text style={s.requestMeta}>
                    {item.providers?.category} · {item.providers?.city}
                  </Text>
                </View>
                <View style={s.requestRight}>
                  <Text style={s.requestDate}>
                    {new Date(item.submitted_at).toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short'
                    })}
                  </Text>
                  <Text style={s.requestArrow}>›</Text>
                </View>
              </View>

              <View style={s.requestBottom}>
                <View style={s.requestTag}>
                  <Text style={s.requestTagText}>{item.years_experience}</Text>
                </View>
                <Text style={s.requestAreas} numberOfLines={1}>
                  📍 {item.service_areas}
                </Text>
              </View>

              {activeTab === 'pending' && (
                <View style={s.reviewHint}>
                  <Text style={s.reviewHintText}>Tap to review →</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },

    // Header — headerSub/logoutBtn/logoutText were still colored for this
    // screen's OLD custom header bar (backgroundColor: theme.text, a dark
    // near-black strip), from before this screen was migrated to the
    // shared AppHeader component. AppHeader has no dark background of its
    // own — it just sits on this screen's own light `container` background
    // — so light-on-light text here was genuinely invisible (not just low
    // contrast): logoutText's color was theme.bg (white in light mode) on
    // a barely-there translucent-white button, on a white header. header/
    // backBtn/backIcon/headerTitle were the rest of that old header's own
    // styles — confirmed dead (grepped, no longer referenced anywhere in
    // this file's JSX) — removed instead of left as a trap for the same
    // mistake again. logoutBtn now matches AppHeader's own searchBtn
    // convention (cardBg/border/text) sitting right next to it in the same
    // row — a pairing the theme system always keeps correctly contrasted
    // in both light and dark mode, rather than a second hand-picked colour
    // that can silently stop matching its background.
    headerSub: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
    logoutBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      height: 38, borderRadius: 16, paddingHorizontal: 14,
      backgroundColor: theme.cardBg, borderWidth: 1, borderColor: theme.border,
    },
    logoutText: { color: theme.text, fontSize: 13, fontWeight: '600' },

    // Stats
    statsRow: { flexDirection: 'row', gap: 8, padding: 12 },
    statCard: { flex: 1, backgroundColor: theme.cardBg, borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 0.5, borderColor: theme.border, position: 'relative' },
    statCardAlert: { borderColor: '#E8A020', borderWidth: 1 },
    statCardValue: { fontSize: 20, fontWeight: '700', color: theme.text },
    statCardLabel: { fontSize: 10, color: theme.textSecondary, marginTop: 2 },
    alertDot: { position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: 8, backgroundColor: '#E8A020', alignItems: 'center', justifyContent: 'center' },
    alertDotText: { fontSize: 10, color: '#FFF', fontWeight: '700' },

    // Claim requests link
    claimsLink: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginBottom: 10, padding: 14, backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border, gap: 12 },
    claimsLinkIcon: { fontSize: 20 },
    claimsLinkTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
    claimsLinkSub: { fontSize: 12, color: theme.textSecondary, marginTop: 1 },
    claimsLinkArrow: { fontSize: 20, color: theme.textTertiary },

    // Tabs
    tabRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 8 },
    tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.bgSecondary, borderWidth: 0.5, borderColor: theme.border },
    tabActive: { backgroundColor: theme.btnPrimary, borderColor: theme.btnPrimary },
    tabText: { fontSize: 13, fontWeight: '500', color: theme.textSecondary },
    tabTextActive: { color: theme.btnPrimaryText },

    // Empty / loading
    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    loadingText: { marginTop: 12, fontSize: 14, color: theme.textSecondary },
    emptyIcon: { fontSize: 48, marginBottom: 12 },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 6 },
    emptySub: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },

    // Request cards
    list: { padding: 12 },
    requestCard: { backgroundColor: theme.cardBg, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: theme.border },
    requestTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    requestAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    requestAvatarText: { fontSize: 18, color: '#FFF', fontWeight: '700' },
    requestInfo: { flex: 1 },
    requestName: { fontSize: 14, fontWeight: '700', color: theme.text },
    requestBusiness: { fontSize: 13, color: theme.textSecondary, marginBottom: 1 },
    requestMeta: { fontSize: 12, color: theme.textTertiary },
    requestRight: { alignItems: 'flex-end', gap: 4 },
    requestDate: { fontSize: 11, color: theme.textTertiary },
    requestArrow: { fontSize: 18, color: theme.textTertiary },
    requestBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: theme.border },
    requestTag: { backgroundColor: theme.bgSecondary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    requestTagText: { fontSize: 11, color: theme.textSecondary },
    requestAreas: { flex: 1, fontSize: 12, color: theme.textSecondary },
    reviewHint: { marginTop: 10, alignItems: 'center', paddingVertical: 6, borderRadius: 8, backgroundColor: theme.bgSecondary },
    reviewHintText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },

    // Detail view
    applicantCard: { flexDirection: 'row', alignItems: 'center', margin: 16, padding: 16, backgroundColor: theme.cardBg, borderRadius: 16, borderWidth: 0.5, borderColor: theme.border, gap: 14 },
    applicantAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
    applicantAvatarText: { fontSize: 22, color: '#FFF', fontWeight: '700' },
    applicantInfo: { flex: 1 },
    applicantName: { fontSize: 17, fontWeight: '700', color: theme.text, marginBottom: 3 },
    applicantContact: { fontSize: 13, color: theme.textSecondary, marginBottom: 1 },
    proofCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border, padding: 12 },
    proofLabel: { fontSize: 12.5, fontWeight: '700', color: theme.text, marginBottom: 8 },
    proofImage: { width: '100%', height: 180, borderRadius: 10, backgroundColor: theme.bgSecondary },
    proofHint: { fontSize: 11, color: theme.textSecondary, marginTop: 6, textAlign: 'center' },
    proofMissingCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: theme.statusDeclined, borderRadius: 14, padding: 13 },
    proofMissingText: { fontSize: 12.5, color: theme.statusDeclinedText, fontWeight: '600' },
    docsCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border, padding: 14, gap: 4 },
    docsCardTitle: { fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 6 },
    docsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
    docsRowLabel: { fontSize: 13, color: theme.text, flex: 1 },
    docsRowLink: { fontSize: 13, fontWeight: '700', color: theme.accent },
    docsRowMissing: { fontSize: 12.5, color: theme.textSecondary },
    detailsCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border, overflow: 'hidden' },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    detailLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    detailIcon: { fontSize: 14, width: 20 },
    detailLabel: { fontSize: 13, color: theme.textSecondary },
    detailValue: { fontSize: 13, fontWeight: '500', color: theme.text, flex: 1, textAlign: 'right', marginLeft: 8 },
    statsCard: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, padding: 14, backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border },
    statBox: { flex: 1, alignItems: 'center' },
    statValue: { fontSize: 15, fontWeight: '700', color: theme.text },
    statLabel: { fontSize: 11, color: theme.textSecondary, marginTop: 2 },
    statDivider: { width: 0.5, backgroundColor: theme.border },
    prevNotesBox: { marginHorizontal: 16, marginBottom: 12, padding: 14, backgroundColor: '#FFEBEE', borderRadius: 12, borderWidth: 0.5, borderColor: '#FFCDD2' },
    prevNotesTitle: { fontSize: 12, fontWeight: '600', color: '#C62828', marginBottom: 4 },
    prevNotesText: { fontSize: 13, color: '#C62828', lineHeight: 18 },
    notesSection: { paddingHorizontal: 16, marginBottom: 16 },
    notesLabel: { fontSize: 14, fontWeight: '600', color: theme.text, marginBottom: 4 },
    notesSub: { fontSize: 12, color: theme.textSecondary, marginBottom: 10 },
    notesInput: { backgroundColor: theme.bgSecondary, borderRadius: 12, padding: 14, fontSize: 14, borderWidth: 0.5, borderColor: theme.border, color: theme.text, minHeight: 100 },

    // Action bar
    actionBar: { flexDirection: 'row', gap: 10, padding: 16, backgroundColor: theme.bg, borderTopWidth: 0.5, borderTopColor: theme.border },
    rejectBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#C62828', alignItems: 'center' },
    rejectBtnText: { fontSize: 14, fontWeight: '700', color: '#C62828' },
    approveBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: '#2E7D32', alignItems: 'center' },
    approveBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  });
}