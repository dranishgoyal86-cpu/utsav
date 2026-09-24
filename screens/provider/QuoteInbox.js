import { useState, useCallback } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { showAlert } from '../../helpers';
import AppHeader from '../../components/AppHeader';
import { notifyQuoteReceived, notifyQuoteDeclined, notifyServiceQuoteReceived, notifyServiceQuoteDeclined } from '../../notifications';
import { resolveMatchKey } from '../../vendorTaxonomy';

// Combined provider-side quote inbox — generalizes CatererQuoteInbox.js
// (menu_quote_* tables, unchanged) to show it alongside the new
// service_quote_* tables (every other category), in one list, still
// reached from the same "Quote Requests" tile in ProviderERP.js. "quote
// menu tool sitting in the provider main screen should be used for it and
// it should be service specific for that particular service provider"
// (Anish, Sept 23) — see quote-first-booking-all-services.md.
//
// CatererQuoteInbox.js itself is left in place, unused — this is a new,
// separate screen rather than an edit to that one, so the working menu
// quote flow can't regress from this change.
//
// Both response tables are RLS-scoped to provider_id = this provider's own
// id, so a provider only ever sees rows for categories they actually
// offer — no client-side role/category filtering needed, same reasoning
// as CatererQuoteInbox.js's original comment.
export default function QuoteInbox({ navigation }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [providerId, setProviderId] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [priceDrafts, setPriceDrafts] = useState({});
  const [noteDrafts, setNoteDrafts] = useState({});
  const [submittingId, setSubmittingId] = useState(null);
  // Deposit % + "valid for N days" — provider sets both when quoting
  // (open-source scan items #1 and #6). Defaults match what most small
  // vendors already ask for informally (a modest deposit, a few days to
  // decide) but are fully editable per quote.
  const [depositDrafts, setDepositDrafts] = useState({});
  const [validDaysDrafts, setValidDaysDrafts] = useState({});
  // Decline reason (scan item #5) — tapping Decline once reveals a quick
  // reason row instead of declining immediately; tapping a reason confirms.
  const [decliningId, setDecliningId] = useState(null);

  useFocusEffect(
    useCallback(() => {
      fetchRequests();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  async function fetchRequests() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: providerData } = await supabase.from('providers').select('id').eq('user_id', session.user.id).maybeSingle();
      if (!providerData) { setRows([]); return; }
      setProviderId(providerData.id);

      // Intake-question hints (scan item #3) — this provider's own
      // per-service questions, merged by category, so a service quote
      // request can remind them what they usually ask a host upfront.
      const { data: myServices } = await supabase.from('services').select('category, intake_questions').eq('provider_id', providerData.id);
      const hintsByCategory = {};
      (myServices || []).forEach(sv => {
        if (!Array.isArray(sv.intake_questions) || !sv.intake_questions.length) return;
        const key = resolveMatchKey(sv.category);
        if (!key) return;
        const existing = hintsByCategory[key] || [];
        hintsByCategory[key] = [...new Set([...existing, ...sv.intake_questions])];
      });

      const [menuRes, serviceRes] = await Promise.all([
        supabase.from('menu_quote_responses').select('*').eq('provider_id', providerData.id).order('created_at', { ascending: false }),
        supabase.from('service_quote_responses').select('*').eq('provider_id', providerData.id).order('created_at', { ascending: false }),
      ]);
      const menuResponses = (menuRes.data || []).map(r => ({ ...r, source: 'menu' }));
      const serviceResponses = (serviceRes.data || []).map(r => ({ ...r, source: 'service' }));
      const allResponses = [...menuResponses, ...serviceResponses];
      if (!allResponses.length) { setRows([]); return; }

      const menuRequestIds = [...new Set(menuResponses.map(r => r.quote_request_id))];
      const serviceRequestIds = [...new Set(serviceResponses.map(r => r.quote_request_id))];
      const [menuReqRes, serviceReqRes] = await Promise.all([
        menuRequestIds.length ? supabase.from('menu_quote_requests').select('*').in('id', menuRequestIds) : Promise.resolve({ data: [] }),
        serviceRequestIds.length ? supabase.from('service_quote_requests').select('*').in('id', serviceRequestIds) : Promise.resolve({ data: [] }),
      ]);
      const requestsById = {};
      (menuReqRes.data || []).forEach(r => { requestsById[r.id] = r; });
      (serviceReqRes.data || []).forEach(r => { requestsById[r.id] = r; });

      const eventIds = [...new Set(Object.values(requestsById).map(r => r.event_id).filter(Boolean))];
      const { data: eventRows } = eventIds.length
        ? await supabase.from('events').select('id, event_type_slug, guest_count, venue, event_date').in('id', eventIds)
        : { data: [] };
      const eventsById = {};
      (eventRows || []).forEach(e => { eventsById[e.id] = e; });

      const hostIds = [...new Set(Object.values(requestsById).map(r => r.host_id).filter(Boolean))];
      const { data: hostRows } = hostIds.length
        ? await supabase.from('users').select('id, name').in('id', hostIds)
        : { data: [] };
      const hostsById = {};
      (hostRows || []).forEach(h => { hostsById[h.id] = h.name; });

      const combined = allResponses.map(r => {
        const req = requestsById[r.quote_request_id] || {};
        const ev = eventsById[req.event_id] || {};
        const intakeHints = r.source === 'service' ? (hintsByCategory[req.category_slug] || []) : [];
        return { ...r, request: req, event: ev, hostName: hostsById[req.host_id] || 'A host', intakeHints };
      });
      combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setRows(combined);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(row) {
    const priceStr = (priceDrafts[row.id] || '').trim();
    const priceNum = Number(priceStr);
    if (!priceStr || Number.isNaN(priceNum)) {
      showAlert('Enter a price', 'Type the price you want to quote.');
      return;
    }
    const table = row.source === 'menu' ? 'menu_quote_responses' : 'service_quote_responses';
    const depositStr = (depositDrafts[row.id] || '').trim();
    const depositNum = depositStr ? Number(depositStr) : null;
    if (depositStr && (Number.isNaN(depositNum) || depositNum < 0 || depositNum > 100)) {
      showAlert('Check the deposit %', 'Deposit should be a number between 0 and 100, or left blank.');
      return;
    }
    const validDaysStr = (validDaysDrafts[row.id] || '').trim();
    const validDaysNum = validDaysStr ? Number(validDaysStr) : null;
    const expiresAt = validDaysNum ? new Date(Date.now() + validDaysNum * 24 * 60 * 60 * 1000).toISOString() : null;
    setSubmittingId(row.id);
    try {
      const { error: err } = await supabase.from(table).update({
        status: 'quoted', price: priceNum, notes: (noteDrafts[row.id] || '').trim() || null, responded_at: new Date().toISOString(),
        deposit_percent: depositNum, expires_at: expiresAt,
      }).eq('id', row.id);
      if (err) { showAlert('Could not send that', err.message); return; }

      const { data: providerRow } = await supabase.from('providers').select('name, business_name').eq('id', providerId).maybeSingle();
      const providerName = providerRow?.business_name || providerRow?.name || 'A provider';
      if (row.source === 'menu') {
        await notifyQuoteReceived(row.request.host_id, providerName, priceNum, row.quote_request_id);
      } else {
        await notifyServiceQuoteReceived(row.request.host_id, providerName, priceNum, row.quote_request_id);
      }

      fetchRequests();
    } finally {
      setSubmittingId(null);
    }
  }

  async function handleDecline(row, reason) {
    const table = row.source === 'menu' ? 'menu_quote_responses' : 'service_quote_responses';
    setSubmittingId(row.id);
    try {
      const { error: err } = await supabase.from(table).update({
        status: 'declined', responded_at: new Date().toISOString(), decline_reason: reason || null,
      }).eq('id', row.id);
      if (err) { showAlert('Could not update that', err.message); return; }

      const { data: providerRow } = await supabase.from('providers').select('name, business_name').eq('id', providerId).maybeSingle();
      const providerName = providerRow?.business_name || providerRow?.name || 'A provider';
      if (row.source === 'menu') {
        await notifyQuoteDeclined(row.request.host_id, providerName, row.quote_request_id);
      } else {
        await notifyServiceQuoteDeclined(row.request.host_id, providerName, row.quote_request_id);
      }

      setDecliningId(null);
      fetchRequests();
    } finally {
      setSubmittingId(null);
    }
  }

  function renderRow({ item }) {
    const isMenu = item.source === 'menu';
    const snapshot = isMenu && Array.isArray(item.request.menu_snapshot) ? item.request.menu_snapshot : [];
    const dishCount = snapshot.length;
    const canRespond = item.status === 'invited';
    const title = isMenu ? 'their menu' : (item.request.item_name || 'a service');

    return (
      <View style={s.card}>
        <View style={s.badgeRow}>
          <Text style={s.badge}>{isMenu ? 'MENU' : (item.request.category_slug || 'SERVICE').toUpperCase()}</Text>
        </View>
        <Text style={s.hostName}>{item.hostName}'s {item.event.event_type_slug || 'event'} — {title}</Text>
        <Text style={s.meta}>
          {isMenu && dishCount ? `${dishCount} dish${dishCount === 1 ? '' : 'es'} · ` : ''}
          {item.event.guest_count ? `${item.event.guest_count} guests` : ''}
          {item.event.event_date ? ` · ${new Date(item.event.event_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
        </Text>
        {!!item.event.venue && <Text style={s.meta}>{item.event.venue}</Text>}
        {isMenu && dishCount > 0 && (
          <Text style={s.dishList} numberOfLines={3}>{snapshot.map(d => d.dish_name).join(', ')}</Text>
        )}
        {!!item.request.note && <Text style={s.hostNote}>Host's note: {item.request.note}</Text>}

        <Text style={s.statusLine}>{statusLabel(item.status)}</Text>

        {canRespond ? (
          <View style={{ marginTop: 10 }}>
            {Array.isArray(item.intakeHints) && item.intakeHints.length > 0 && (
              <View style={s.hintsBox}>
                <Text style={s.hintsTitle}>You usually ask:</Text>
                {item.intakeHints.map((q, i) => <Text key={i} style={s.hintLine}>• {q}</Text>)}
              </View>
            )}
            <TextInput
              style={s.input}
              placeholder="Your price (₹)"
              placeholderTextColor={theme.textTertiary}
              keyboardType="numeric"
              value={priceDrafts[item.id] || ''}
              onChangeText={t => setPriceDrafts(prev => ({ ...prev, [item.id]: t }))}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                placeholder="Deposit % (optional)"
                placeholderTextColor={theme.textTertiary}
                keyboardType="numeric"
                value={depositDrafts[item.id] || ''}
                onChangeText={t => setDepositDrafts(prev => ({ ...prev, [item.id]: t }))}
              />
              <TextInput
                style={[s.input, { flex: 1 }]}
                placeholder="Valid for (days)"
                placeholderTextColor={theme.textTertiary}
                keyboardType="numeric"
                value={validDaysDrafts[item.id] || ''}
                onChangeText={t => setValidDaysDrafts(prev => ({ ...prev, [item.id]: t }))}
              />
            </View>
            <TextInput
              style={s.input}
              placeholder="Notes for the host (optional)"
              placeholderTextColor={theme.textTertiary}
              value={noteDrafts[item.id] || ''}
              onChangeText={t => setNoteDrafts(prev => ({ ...prev, [item.id]: t }))}
            />
            {decliningId === item.id ? (
              <View>
                <Text style={s.declineReasonPrompt}>Why are you declining?</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {['Price doesn\'t work', 'Not available', 'Outside my area', 'Other'].map(reason => (
                    <TouchableOpacity key={reason} style={s.reasonChip} onPress={() => handleDecline(item, reason)} disabled={submittingId === item.id}>
                      <Text style={s.reasonChipText}>{reason}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity onPress={() => setDecliningId(null)} style={{ marginTop: 8 }}>
                  <Text style={s.cancelDeclineText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <TouchableOpacity style={s.declineBtn} onPress={() => setDecliningId(item.id)} disabled={submittingId === item.id}>
                  <Text style={s.declineBtnText}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.submitBtn, { flex: 1 }]} onPress={() => handleSubmit(item)} disabled={submittingId === item.id}>
                  {submittingId === item.id ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.submitBtnText}>Send quote</Text>}
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <>
            {item.price != null && <Text style={s.quotedPrice}>Your quote: ₹{Number(item.price).toLocaleString('en-IN')}</Text>}
            {item.deposit_percent != null && <Text style={s.meta}>Deposit asked: {item.deposit_percent}%</Text>}
            {!!item.expires_at && <Text style={s.meta}>Valid until {new Date(item.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>}
            {item.status === 'declined' && !!item.decline_reason && <Text style={s.meta}>Reason: {item.decline_reason}</Text>}
          </>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Quote Requests" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : rows.length === 0 ? (
        <View style={s.emptyWrap}>
          <Text style={s.emptyText}>No quote requests yet. When a host invites you to quote on their menu or a service, it'll show up here.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={item => `${item.source}_${item.id}`}
          renderItem={renderRow}
          contentContainerStyle={{ padding: 20 }}
        />
      )}
    </SafeAreaView>
  );
}

function statusLabel(status) {
  if (status === 'invited') return 'Awaiting your quote';
  if (status === 'quoted') return 'You quoted this — waiting on the host';
  if (status === 'declined') return 'You declined this request';
  if (status === 'booked') return '✓ Booked by the host';
  return status;
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
    emptyText: { fontSize: 13.5, color: theme.textSecondary, textAlign: 'center', lineHeight: 19 },
    card: { backgroundColor: theme.cardBg, borderRadius: 16, borderWidth: 0.5, borderColor: theme.border, padding: 16, marginBottom: 12 },
    badgeRow: { flexDirection: 'row', marginBottom: 6 },
    badge: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6, color: theme.accent, backgroundColor: theme.bg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, overflow: 'hidden' },
    hostName: { fontSize: 14.5, fontWeight: '700', color: theme.text },
    meta: { fontSize: 12, color: theme.textSecondary, marginTop: 4 },
    dishList: { fontSize: 12, color: theme.textSecondary, marginTop: 8, lineHeight: 17 },
    hostNote: { fontSize: 12, color: theme.text, marginTop: 8, fontStyle: 'italic' },
    statusLine: { fontSize: 12, fontWeight: '600', color: theme.accent || theme.text, marginTop: 10 },
    quotedPrice: { fontSize: 15, fontWeight: '800', color: theme.text, marginTop: 8 },
    input: { backgroundColor: theme.bg, borderRadius: 12, borderWidth: 0.5, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: theme.text, marginBottom: 8 },
    declineBtn: { paddingHorizontal: 16, borderRadius: 12, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    declineBtnText: { fontSize: 12.5, fontWeight: '700', color: theme.danger || '#C0392B' },
    submitBtn: { backgroundColor: theme.btnPrimary, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
    submitBtnText: { fontSize: 12.5, fontWeight: '700', color: theme.btnPrimaryText },
    hintsBox: { backgroundColor: theme.bg, borderRadius: 10, padding: 10, marginBottom: 8 },
    hintsTitle: { fontSize: 11, fontWeight: '700', color: theme.textSecondary, marginBottom: 4 },
    hintLine: { fontSize: 12, color: theme.text, lineHeight: 17 },
    declineReasonPrompt: { fontSize: 12.5, fontWeight: '600', color: theme.text, marginBottom: 8 },
    reasonChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border },
    reasonChipText: { fontSize: 12, fontWeight: '600', color: theme.text },
    cancelDeclineText: { fontSize: 12, color: theme.textSecondary, textAlign: 'center' },
  });
}
