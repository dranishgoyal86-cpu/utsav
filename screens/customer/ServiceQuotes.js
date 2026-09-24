import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import AppHeader from '../../components/AppHeader';
import { showAlert } from '../../helpers';
import { resolveMatchKey } from '../../vendorTaxonomy';
import { getAvoidProviderIds } from '../../customerMemory';
import { notifyServiceQuoteRequested, notifyServiceQuoteBooked, notifyNewBooking } from '../../notifications';

// "when hosts go to bookings he should ask for quotes from the providers
// rather than direct booking... scope it to all the service providers...
// it should be service specific for that particular service provider"
// (Anish, Sept 23). This is the generalized, every-category sibling of
// MenuPricing.js's caterer-quote comparison screen — same shape, same
// data flow, just matched against whatever categorySlug the checklist
// item is (via vendorTaxonomy.js's resolveMatchKey, the same helper
// ItemDetail.js already uses to find matching providers), instead of a
// hardcoded "Caterers" category.
//
// Reached from ProviderProfile.js's handleRequestQuote() with
// { eventId, itemName, categorySlug } — that call already created the
// request and invited the one provider being viewed; this screen is
// where the host can see it, invite more providers, add outside quotes,
// and eventually book.
//
// Data model: supabase/migrations/20260923000000_service_quote_requests.sql
// (service_quote_requests + service_quote_responses, purely additive —
// menu_quote_requests/menu_quote_responses and MenuPricing.js are
// untouched and keep working exactly as before).
export default function ServiceQuotes({ route, navigation }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { eventId, itemName, categorySlug } = route.params || {};

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);

  const [quoteRequest, setQuoteRequest] = useState(null);
  const [responses, setResponses] = useState([]);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [selectedProviderIds, setSelectedProviderIds] = useState([]);
  const [requestNote, setRequestNote] = useState('');
  const [sending, setSending] = useState(false);

  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [addingManual, setAddingManual] = useState(false);

  const [bookingId, setBookingId] = useState(null);

  async function loadEvent() {
    if (!eventId) return;
    const { data } = await supabase.from('events').select('*').eq('id', eventId).maybeSingle();
    if (data) setEvent(data);
  }

  // Two-query, no-join fetch — same convention as MenuPricing.js /
  // ProviderERP.js / SearchScreen.js.
  async function loadQuoteData() {
    if (!eventId || !itemName) return;
    const { data: reqs } = await supabase.from('service_quote_requests').select('*')
      .eq('event_id', eventId).eq('item_name', itemName).order('created_at', { ascending: false }).limit(1);
    const req = (reqs || [])[0] || null;
    setQuoteRequest(req);
    if (!req) { setResponses([]); return; }
    const { data: resp } = await supabase.from('service_quote_responses').select('*')
      .eq('quote_request_id', req.id).order('created_at', { ascending: true });
    const rows = resp || [];
    const providerIds = [...new Set(rows.filter(r => r.kind === 'platform' && r.provider_id).map(r => r.provider_id))];
    let providerNames = {};
    if (providerIds.length) {
      const { data: provs } = await supabase.from('providers').select('id, name, business_name').in('id', providerIds);
      (provs || []).forEach(p => { providerNames[p.id] = p.business_name || p.name; });
    }
    setResponses(rows.map(r => ({ ...r, displayName: r.kind === 'manual' ? r.vendor_name : (providerNames[r.provider_id] || 'Provider') })));
  }

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadEvent(), loadQuoteData()]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, itemName]);

  useEffect(() => { loadAll(); }, [loadAll]);
  // Refetch on focus too — a provider may have quoted while the host was
  // elsewhere in the app (matches MenuPricing.js's own behavior implicitly
  // via re-navigation; made explicit here since a host is likely to bounce
  // back to this screen from a notification).
  useFocusEffect(useCallback(() => { loadQuoteData(); }, [eventId, itemName]));

  const requestOpen = !quoteRequest || quoteRequest.status !== 'closed';

  async function ensureQuoteRequest(note) {
    if (quoteRequest) return quoteRequest;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const { data: newReq, error: reqErr } = await supabase.from('service_quote_requests')
      .insert({ event_id: eventId, host_id: session.user.id, item_name: itemName, category_slug: categorySlug, note: note ? note.trim() || null : null })
      .select().single();
    if (reqErr) { showAlert('Could not save that', reqErr.message); return null; }
    setQuoteRequest(newReq);
    return newReq;
  }

  // Same matching logic as ItemDetail.js's "Recommended providers" —
  // services has no category_slug of its own, so category is qualified
  // via resolveMatchKey, and the viewer's own avoid-list is applied too.
  async function openProviderPicker() {
    setPickerVisible(true);
    setCandidatesLoading(true);
    try {
      const { data: activeServices } = await supabase.from('services').select('provider_id, category').eq('is_active', true);
      const { data: { session } } = await supabase.auth.getSession();
      const avoidProviderIds = session ? await getAvoidProviderIds(session.user.id) : [];
      const matchingProviderIds = [...new Set(
        (activeServices || [])
          .filter(sv => resolveMatchKey(sv.category) === categorySlug)
          .map(sv => sv.provider_id)
          .filter(Boolean)
      )].filter(id => !avoidProviderIds.includes(id));
      if (!matchingProviderIds.length) { setCandidates([]); return; }
      const { data: provs } = await supabase.from('providers').select('id, name, business_name, city, is_verified').in('id', matchingProviderIds);
      setCandidates(provs || []);
    } finally {
      setCandidatesLoading(false);
    }
  }
  function toggleCandidate(id) {
    setSelectedProviderIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }

  async function handleSendRequest() {
    if (!selectedProviderIds.length) { showAlert('Pick at least one provider', 'Select one or more providers to send this request to.'); return; }
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: userRow } = await supabase.from('users').select('name').eq('id', session.user.id).maybeSingle();
      const hostName = userRow?.name || 'A host';

      const req = await ensureQuoteRequest(requestNote);
      if (!req) return;

      const alreadyInvited = new Set(responses.filter(r => r.kind === 'platform').map(r => r.provider_id));
      const toInvite = selectedProviderIds.filter(id => !alreadyInvited.has(id));
      if (toInvite.length) {
        const { error: respErr } = await supabase.from('service_quote_responses').insert(
          toInvite.map(providerId => ({ quote_request_id: req.id, kind: 'platform', provider_id: providerId, status: 'invited' }))
        );
        if (respErr) { showAlert('Could not send that', respErr.message); return; }
        await Promise.all(toInvite.map(providerId => notifyServiceQuoteRequested(providerId, hostName, itemName, req.id)));
      }

      setPickerVisible(false);
      setSelectedProviderIds([]);
      setRequestNote('');
      await loadQuoteData();
    } finally {
      setSending(false);
    }
  }

  async function handleAddManualQuote() {
    const name = manualName.trim();
    const priceNum = Number(manualPrice);
    if (!name || !manualPrice.trim() || Number.isNaN(priceNum)) {
      showAlert('Missing details', 'Enter a provider name and a price.');
      return;
    }
    setAddingManual(true);
    try {
      const req = await ensureQuoteRequest();
      if (!req) return;
      const { error: respErr } = await supabase.from('service_quote_responses').insert({
        quote_request_id: req.id, kind: 'manual', vendor_name: name, status: 'manual',
        price: priceNum, notes: manualNote.trim() || null, responded_at: new Date().toISOString(),
      });
      if (respErr) { showAlert('Could not save that', respErr.message); return; }
      setManualName(''); setManualPrice(''); setManualNote('');
      await loadQuoteData();
    } finally {
      setAddingManual(false);
    }
  }

  function confirmBook(response) {
    Alert.alert(
      'Book this provider?',
      `Book ${response.displayName} at ₹${Number(response.price).toLocaleString('en-IN')} for ${itemName}?`,
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Book', onPress: () => doBook(response) }],
    );
  }

  async function doBook(response) {
    if (!quoteRequest) return;
    setBookingId(response.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      if (response.kind === 'platform') {
        const { data: svcRows } = await supabase.from('services').select('id, category').eq('provider_id', response.provider_id).eq('is_active', true);
        const serviceId = (svcRows || []).find(sv => resolveMatchKey(sv.category) === categorySlug)?.id;
        if (!serviceId) {
          showAlert('Could not book', "This provider has no active listing for this category anymore — ask them to check their profile, or add this as an outside quote instead.");
          return;
        }
        const { data: userRow } = await supabase.from('users').select('name').eq('id', session.user.id).maybeSingle();
        const hostName = userRow?.name || 'A host';

        const { data: newBooking, error: bookingErr } = await supabase.from('bookings').insert({
          customer_id: session.user.id,
          provider_id: response.provider_id,
          service_id: serviceId,
          event_date: event?.event_date || null,
          guest_count: event?.guest_count || null,
          venue: event?.venue || null,
          notes: `Booked via quote comparison for "${itemName}" — quoted ₹${response.price}${response.notes ? `. Provider note: ${response.notes}` : ''}`,
          total_amount: response.price,
          status: 'inquiry',
        }).select().single();
        if (bookingErr) { showAlert('Could not book', bookingErr.message); return; }

        await notifyNewBooking(response.provider_id, hostName, itemName, newBooking.id);
        await notifyServiceQuoteBooked(response.provider_id, itemName, quoteRequest.id);
      }

      await supabase.from('service_quote_requests').update({ status: 'closed', booked_response_id: response.id }).eq('id', quoteRequest.id);
      await supabase.from('service_quote_responses').update({ status: 'booked' }).eq('id', response.id);
      await loadQuoteData();
    } finally {
      setBookingId(null);
    }
  }

  if (loading) {
    return <SafeAreaView style={s.container} />;
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader theme={theme} navigation={navigation} onBack={() => navigation.goBack()} title={itemName || 'Quotes'} eventId={eventId} />
      <ScrollView style={s.scroll} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <View style={s.introCard}>
          <Text style={s.introTitle}>Compare quotes for {itemName}</Text>
          <Text style={s.introHint}>Invite one or more providers to quote a price, or add a quote you got outside the app — then book whichever one you like best.</Text>
        </View>

        <View style={s.quoteSection}>
          <Text style={s.sectionTitle}>Quotes</Text>
          <Text style={s.sectionHint}>
            {quoteRequest?.status === 'closed'
              ? 'This request is closed — a provider has been booked.'
              : "Providers you invite will see this in their Quote Requests inbox and can respond with a price."}
          </Text>

          {requestOpen && (
            <TouchableOpacity style={s.inviteBtn} onPress={openProviderPicker}>
              <Text style={s.inviteBtnText}>+ Invite providers</Text>
            </TouchableOpacity>
          )}

          {responses.length > 0 && (
            <View style={{ marginTop: 14 }}>
              {responses.map(r => (
                <View key={r.id} style={s.quoteRow}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.quoteName}>{r.displayName}{r.kind === 'manual' ? ' (outside quote)' : ''}</Text>
                      <Text style={s.quoteStatus}>{statusLabel(r)}</Text>
                      {!!r.notes && <Text style={s.quoteNotes}>{r.notes}</Text>}
                    </View>
                    {r.price != null && <Text style={s.quotePrice}>₹{Number(r.price).toLocaleString('en-IN')}</Text>}
                  </View>
                  {requestOpen && (r.status === 'quoted' || r.status === 'manual') && (
                    <TouchableOpacity style={s.bookBtn} onPress={() => confirmBook(r)} disabled={bookingId === r.id}>
                      {bookingId === r.id ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.bookBtnText}>Book this provider</Text>}
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          )}

          {requestOpen && (
            <View style={s.manualBlock}>
              <Text style={s.manualTitle}>Add an outside quote</Text>
              <TextInput style={s.input} placeholder="Provider name" placeholderTextColor={theme.textTertiary} value={manualName} onChangeText={setManualName} />
              <TextInput style={s.input} placeholder="Price (₹)" placeholderTextColor={theme.textTertiary} value={manualPrice} onChangeText={setManualPrice} keyboardType="numeric" />
              <TextInput style={s.input} placeholder="Notes (optional)" placeholderTextColor={theme.textTertiary} value={manualNote} onChangeText={setManualNote} />
              <TouchableOpacity style={s.manualAddBtn} onPress={handleAddManualQuote} disabled={addingManual}>
                {addingManual ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.manualAddBtnText}>Add quote</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={pickerVisible} animationType="slide" transparent onRequestClose={() => setPickerVisible(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Invite providers</Text>
            {candidatesLoading ? (
              <ActivityIndicator color={theme.accent} style={{ marginVertical: 20 }} />
            ) : candidates.length === 0 ? (
              <Text style={s.sectionHint}>No matching providers found on Utsav yet — you can still add an outside quote below instead.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 260 }}>
                {candidates.map(c => {
                  const picked = selectedProviderIds.includes(c.id);
                  return (
                    <TouchableOpacity key={c.id} style={[s.candidateRow, picked && s.candidateRowActive]} onPress={() => toggleCandidate(c.id)}>
                      <Text style={s.candidateName}>{picked ? '✓ ' : ''}{c.business_name || c.name}</Text>
                      {!!c.city && <Text style={s.candidateCity}>{c.city}</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            <TextInput
              style={[s.input, { marginTop: 12 }]}
              placeholder="Note for the providers (optional)"
              placeholderTextColor={theme.textTertiary}
              value={requestNote}
              onChangeText={setRequestNote}
              multiline
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setPickerVisible(false)}>
                <Text style={s.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalSendBtn, { flex: 1 }]} onPress={handleSendRequest} disabled={sending}>
                {sending ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.modalSendBtnText}>Send request</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function statusLabel(r) {
  if (r.kind === 'manual') return 'Outside quote';
  if (r.status === 'invited') return 'Waiting for quote…';
  if (r.status === 'quoted') return 'Quoted';
  if (r.status === 'declined') return 'Declined';
  if (r.status === 'booked') return '✓ Booked';
  return r.status;
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    scroll: { flex: 1 },
    introCard: { backgroundColor: theme.cardBg, borderRadius: 16, borderWidth: 0.5, borderColor: theme.border, padding: 16, marginBottom: 18 },
    introTitle: { fontSize: 15, fontWeight: '800', color: theme.text },
    introHint: { fontSize: 12.5, color: theme.textSecondary, marginTop: 8, lineHeight: 17 },
    quoteSection: { marginTop: 4, borderTopWidth: 0.5, borderTopColor: theme.border, paddingTop: 16 },
    sectionTitle: { fontSize: 15, fontWeight: '800', color: theme.text },
    sectionHint: { fontSize: 12.5, color: theme.textSecondary, marginTop: 6, lineHeight: 17 },
    inviteBtn: { backgroundColor: theme.btnPrimary, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
    inviteBtnText: { fontSize: 13.5, fontWeight: '700', color: theme.btnPrimaryText },
    quoteRow: { backgroundColor: theme.cardBg, borderRadius: 12, borderWidth: 0.5, borderColor: theme.border, padding: 12, marginBottom: 8 },
    quoteName: { fontSize: 13.5, fontWeight: '700', color: theme.text },
    quoteStatus: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
    quoteNotes: { fontSize: 11.5, color: theme.textTertiary, marginTop: 4 },
    quotePrice: { fontSize: 15, fontWeight: '800', color: theme.text },
    bookBtn: { backgroundColor: theme.text, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 10 },
    bookBtnText: { fontSize: 12.5, fontWeight: '700', color: theme.bg },
    manualBlock: { marginTop: 20, backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border, padding: 14 },
    manualTitle: { fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 10 },
    input: { backgroundColor: theme.bg, borderRadius: 12, borderWidth: 0.5, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 11, fontSize: 13, color: theme.text, marginBottom: 8 },
    manualAddBtn: { backgroundColor: theme.btnPrimary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
    manualAddBtnText: { fontSize: 13, fontWeight: '700', color: theme.btnPrimaryText },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: theme.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' },
    modalTitle: { fontSize: 16, fontWeight: '800', color: theme.text, marginBottom: 12 },
    candidateRow: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border, marginBottom: 8 },
    candidateRowActive: { borderColor: theme.btnPrimary, backgroundColor: theme.btnPrimary + '22' },
    candidateName: { fontSize: 13.5, fontWeight: '700', color: theme.text },
    candidateCity: { fontSize: 11.5, color: theme.textSecondary, marginTop: 2 },
    modalCancelBtn: { paddingHorizontal: 18, paddingVertical: 13, borderRadius: 14, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    modalCancelBtnText: { fontSize: 13, fontWeight: '700', color: theme.text },
    modalSendBtn: { backgroundColor: theme.btnPrimary, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
    modalSendBtnText: { fontSize: 13.5, fontWeight: '700', color: theme.btnPrimaryText },
  });
}
