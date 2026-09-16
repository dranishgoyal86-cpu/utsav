import { useState, useCallback } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { showAlert } from '../../helpers';
import AppHeader from '../../components/AppHeader';
import { notifyQuoteReceived, notifyQuoteDeclined } from '../../notifications';

// Provider-side inbox for menu quote requests — "share with a caterer or
// multiple caterers of host's choice to get an estimate" (Anish, Sept 16).
// Counterpart to screens/customer/MenuPricing.js. Same shell/fetch pattern
// as ProviderInbox.js (useFocusEffect refresh, two-query no-join).
//
// Only rows in menu_quote_responses where provider_id = this provider's
// own id are ever visible (RLS-enforced too — see
// supabase/migrations/20260918000000_menu_caterer_quotes.sql), so this
// screen is naturally empty for a provider who isn't a caterer — no role
// check needed here.
export default function CatererQuoteInbox({ navigation }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [providerId, setProviderId] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [priceDrafts, setPriceDrafts] = useState({});
  const [noteDrafts, setNoteDrafts] = useState({});
  const [submittingId, setSubmittingId] = useState(null);

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

      const { data: responseRows } = await supabase
        .from('menu_quote_responses')
        .select('*')
        .eq('provider_id', providerData.id)
        .order('created_at', { ascending: false });
      const responses = responseRows || [];
      if (!responses.length) { setRows([]); return; }

      const requestIds = [...new Set(responses.map(r => r.quote_request_id))];
      const { data: requestRows } = await supabase.from('menu_quote_requests').select('*').in('id', requestIds);
      const requestsById = {};
      (requestRows || []).forEach(r => { requestsById[r.id] = r; });

      const eventIds = [...new Set((requestRows || []).map(r => r.event_id).filter(Boolean))];
      const { data: eventRows } = await supabase.from('events').select('id, event_type_slug, guest_count, venue, event_date').in('id', eventIds);
      const eventsById = {};
      (eventRows || []).forEach(e => { eventsById[e.id] = e; });

      const hostIds = [...new Set((requestRows || []).map(r => r.host_id).filter(Boolean))];
      const { data: hostRows } = await supabase.from('users').select('id, name').in('id', hostIds);
      const hostsById = {};
      (hostRows || []).forEach(h => { hostsById[h.id] = h.name; });

      setRows(responses.map(r => {
        const req = requestsById[r.quote_request_id] || {};
        const ev = eventsById[req.event_id] || {};
        return { ...r, request: req, event: ev, hostName: hostsById[req.host_id] || 'A host' };
      }));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(row) {
    const priceStr = (priceDrafts[row.id] || '').trim();
    const priceNum = Number(priceStr);
    if (!priceStr || Number.isNaN(priceNum)) {
      showAlert('Enter a price', 'Type the price you want to quote for this menu.');
      return;
    }
    setSubmittingId(row.id);
    try {
      const { error: err } = await supabase.from('menu_quote_responses').update({
        status: 'quoted', price: priceNum, notes: (noteDrafts[row.id] || '').trim() || null, responded_at: new Date().toISOString(),
      }).eq('id', row.id);
      if (err) { showAlert('Could not send that', err.message); return; }

      const { data: providerRow } = await supabase.from('providers').select('name, business_name').eq('id', providerId).maybeSingle();
      const providerName = providerRow?.business_name || providerRow?.name || 'A caterer';
      await notifyQuoteReceived(row.request.host_id, providerName, priceNum, row.quote_request_id);

      fetchRequests();
    } finally {
      setSubmittingId(null);
    }
  }

  async function handleDecline(row) {
    setSubmittingId(row.id);
    try {
      const { error: err } = await supabase.from('menu_quote_responses').update({
        status: 'declined', responded_at: new Date().toISOString(),
      }).eq('id', row.id);
      if (err) { showAlert('Could not update that', err.message); return; }

      const { data: providerRow } = await supabase.from('providers').select('name, business_name').eq('id', providerId).maybeSingle();
      const providerName = providerRow?.business_name || providerRow?.name || 'A caterer';
      await notifyQuoteDeclined(row.request.host_id, providerName, row.quote_request_id);

      fetchRequests();
    } finally {
      setSubmittingId(null);
    }
  }

  function renderRow({ item }) {
    const snapshot = Array.isArray(item.request.menu_snapshot) ? item.request.menu_snapshot : [];
    const dishCount = snapshot.length;
    const canRespond = item.status === 'invited';

    return (
      <View style={s.card}>
        <Text style={s.hostName}>{item.hostName}'s {item.event.event_type_slug || 'event'}</Text>
        <Text style={s.meta}>
          {dishCount} dish{dishCount === 1 ? '' : 'es'}{item.event.guest_count ? ` · ${item.event.guest_count} guests` : ''}
          {item.event.event_date ? ` · ${new Date(item.event.event_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
        </Text>
        {!!item.event.venue && <Text style={s.meta}>{item.event.venue}</Text>}
        {dishCount > 0 && (
          <Text style={s.dishList} numberOfLines={3}>{snapshot.map(d => d.dish_name).join(', ')}</Text>
        )}
        {!!item.request.note && <Text style={s.hostNote}>Host's note: {item.request.note}</Text>}

        <Text style={s.statusLine}>{statusLabel(item.status)}</Text>

        {canRespond ? (
          <View style={{ marginTop: 10 }}>
            <TextInput
              style={s.input}
              placeholder="Your price (₹)"
              placeholderTextColor={theme.textTertiary}
              keyboardType="numeric"
              value={priceDrafts[item.id] || ''}
              onChangeText={t => setPriceDrafts(prev => ({ ...prev, [item.id]: t }))}
            />
            <TextInput
              style={s.input}
              placeholder="Notes for the host (optional)"
              placeholderTextColor={theme.textTertiary}
              value={noteDrafts[item.id] || ''}
              onChangeText={t => setNoteDrafts(prev => ({ ...prev, [item.id]: t }))}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <TouchableOpacity style={s.declineBtn} onPress={() => handleDecline(item)} disabled={submittingId === item.id}>
                <Text style={s.declineBtnText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.submitBtn, { flex: 1 }]} onPress={() => handleSubmit(item)} disabled={submittingId === item.id}>
                {submittingId === item.id ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.submitBtnText}>Send quote</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          item.price != null && <Text style={s.quotedPrice}>Your quote: ₹{Number(item.price).toLocaleString('en-IN')}</Text>
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
          <Text style={s.emptyText}>No quote requests yet. When a host invites you to quote on their menu, it'll show up here.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={item => item.id}
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
  });
}
