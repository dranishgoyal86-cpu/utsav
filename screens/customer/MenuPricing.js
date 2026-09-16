import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import AppHeader from '../../components/AppHeader';
import { showAlert } from '../../helpers';
import { MENU_CATEGORIES } from '../../lib/menuLibrary';
import { notifyQuoteRequested, notifyQuoteBooked, notifyNewBooking } from '../../notifications';

// "change (done selection - add pricing & quantity) to calculate pricing -
// and show it in bottom of page with everything else collapsed. clicking
// on calculate pricing should open a separate page in the menu itself
// where all this can be planned and if host want can be shared with a
// caterer or multiple caterers of host's choice to get an estimate and
// eventually host can book from whomever he gets best price and quality"
// (Anish, Sept 16).
//
// Reached from MenuPlanner.js's sticky "Calculate pricing →" bar.
// Two jobs on one screen:
//   1. Price/Quantity/Notes per dish (moved here from the old inline
//      MenuLibrary.js pricing-mode — see that file's own comments).
//   2. Optionally invite one or more Caterers-category providers to quote
//      a real price back, compare them side by side (in-app quotes AND
//      manually-typed outside quotes together), and book whichever one.
//
// Data model: supabase/migrations/20260918000000_menu_caterer_quotes.sql
// (menu_quote_requests + menu_quote_responses, purely additive).
export default function MenuPricing({ route, navigation }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { eventId } = route.params || {};

  const [event, setEvent] = useState(null);
  const [selections, setSelections] = useState([]);
  const [loading, setLoading] = useState(true);

  const [quoteRequest, setQuoteRequest] = useState(null);
  const [responses, setResponses] = useState([]);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [caterers, setCaterers] = useState([]);
  const [caterersLoading, setCaterersLoading] = useState(false);
  const [selectedCatererIds, setSelectedCatererIds] = useState([]);
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
  async function loadSelections() {
    if (!eventId) return;
    const { data } = await supabase.from('event_menu_selections').select('*').eq('event_id', eventId).order('added_at', { ascending: true });
    setSelections(data || []);
  }
  // Two-query, no-join fetch — same convention the rest of this app uses
  // (ProviderERP.js, SearchScreen.js): fetch the responses, then a second
  // query for the platform providers' names, matched up client-side.
  async function loadQuoteData() {
    if (!eventId) return;
    const { data: reqs } = await supabase.from('menu_quote_requests').select('*').eq('event_id', eventId).order('created_at', { ascending: false }).limit(1);
    const req = (reqs || [])[0] || null;
    setQuoteRequest(req);
    if (!req) { setResponses([]); return; }
    const { data: resp } = await supabase.from('menu_quote_responses').select('*').eq('quote_request_id', req.id).order('created_at', { ascending: true });
    const rows = resp || [];
    const providerIds = [...new Set(rows.filter(r => r.kind === 'platform' && r.provider_id).map(r => r.provider_id))];
    let providerNames = {};
    if (providerIds.length) {
      const { data: provs } = await supabase.from('providers').select('id, name, business_name').in('id', providerIds);
      (provs || []).forEach(p => { providerNames[p.id] = p.business_name || p.name; });
    }
    setResponses(rows.map(r => ({ ...r, displayName: r.kind === 'manual' ? r.caterer_name : (providerNames[r.provider_id] || 'Caterer') })));
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadEvent(), loadSelections(), loadQuoteData()]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function handleUpdateDish(selectionId, patch) {
    const { error: err } = await supabase.from('event_menu_selections').update(patch).eq('id', selectionId);
    if (err) { showAlert('Could not save that', err.message); return; }
    loadSelections();
  }

  const total = selections.reduce((sum, sel) => sum + (typeof sel.price === 'number' ? sel.price : 0), 0);
  const requestOpen = !quoteRequest || quoteRequest.status !== 'closed';

  function buildSnapshot() {
    return selections.map(sel => ({
      dish_name: sel.dish_name, course_category: sel.course_category, cuisine_slug: sel.cuisine_slug,
      quantity: sel.quantity || null, notes: sel.notes || null,
    }));
  }

  async function ensureQuoteRequest(note) {
    if (quoteRequest) return quoteRequest;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const { data: newReq, error: reqErr } = await supabase.from('menu_quote_requests')
      .insert({ event_id: eventId, host_id: session.user.id, menu_snapshot: buildSnapshot(), note: note ? note.trim() || null : null })
      .select().single();
    if (reqErr) { showAlert('Could not save that', reqErr.message); return null; }
    setQuoteRequest(newReq);
    return newReq;
  }

  async function openCatererPicker() {
    setPickerVisible(true);
    setCaterersLoading(true);
    const { data: svc } = await supabase.from('services').select('provider_id').eq('category', 'Caterers').eq('is_active', true);
    const providerIds = [...new Set((svc || []).map(row => row.provider_id))];
    if (!providerIds.length) { setCaterers([]); setCaterersLoading(false); return; }
    const { data: provs } = await supabase.from('providers').select('id, name, business_name, city, is_verified').in('id', providerIds);
    setCaterers(provs || []);
    setCaterersLoading(false);
  }
  function toggleCaterer(id) {
    setSelectedCatererIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }

  async function handleSendRequest() {
    if (!selectedCatererIds.length) { showAlert('Pick at least one caterer', 'Select one or more caterers to send this request to.'); return; }
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: userRow } = await supabase.from('users').select('name').eq('id', session.user.id).maybeSingle();
      const hostName = userRow?.name || 'A host';

      const req = await ensureQuoteRequest(requestNote);
      if (!req) return;

      const alreadyInvited = new Set(responses.filter(r => r.kind === 'platform').map(r => r.provider_id));
      const toInvite = selectedCatererIds.filter(id => !alreadyInvited.has(id));
      if (toInvite.length) {
        const { error: respErr } = await supabase.from('menu_quote_responses').insert(
          toInvite.map(providerId => ({ quote_request_id: req.id, kind: 'platform', provider_id: providerId, status: 'invited' }))
        );
        if (respErr) { showAlert('Could not send that', respErr.message); return; }
        await Promise.all(toInvite.map(providerId => notifyQuoteRequested(providerId, hostName, event?.event_type_slug || 'event', req.id)));
      }

      setPickerVisible(false);
      setSelectedCatererIds([]);
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
      showAlert('Missing details', 'Enter a caterer name and a price.');
      return;
    }
    setAddingManual(true);
    try {
      const req = await ensureQuoteRequest();
      if (!req) return;
      const { error: respErr } = await supabase.from('menu_quote_responses').insert({
        quote_request_id: req.id, kind: 'manual', caterer_name: name, status: 'manual',
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
      'Book this caterer?',
      `Book ${response.displayName} at ₹${Number(response.price).toLocaleString('en-IN')} for this event?`,
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
        const { data: svcRows } = await supabase.from('services').select('id').eq('provider_id', response.provider_id).eq('category', 'Caterers').eq('is_active', true).limit(1);
        const serviceId = (svcRows || [])[0]?.id;
        if (!serviceId) {
          showAlert('Could not book', "This caterer has no active Caterers listing to book against — ask them to check their profile, or add this as an outside quote instead.");
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
          notes: `Booked via caterer quote comparison — quoted ₹${response.price}${response.notes ? `. Caterer note: ${response.notes}` : ''}`,
          total_amount: response.price,
          status: 'inquiry',
        }).select().single();
        if (bookingErr) { showAlert('Could not book', bookingErr.message); return; }

        await notifyNewBooking(response.provider_id, hostName, event?.event_type_slug || 'event', newBooking.id);
        await notifyQuoteBooked(response.provider_id, event?.event_type_slug || 'event', quoteRequest.id);
      }

      await supabase.from('menu_quote_requests').update({ status: 'closed', booked_response_id: response.id }).eq('id', quoteRequest.id);
      await supabase.from('menu_quote_responses').update({ status: 'booked' }).eq('id', response.id);
      await loadQuoteData();
    } finally {
      setBookingId(null);
    }
  }

  if (loading || !event) {
    return <SafeAreaView style={s.container} />;
  }

  const groupedCategories = MENU_CATEGORIES
    .map(cat => ({ cat, dishes: selections.filter(sel => sel.course_category === cat.slug) }))
    .filter(g => g.dishes.length > 0);

  return (
    <SafeAreaView style={s.container}>
      <AppHeader theme={theme} navigation={navigation} onBack={() => navigation.goBack()} title="Pricing & Quotes" eventId={eventId} />
      <ScrollView style={s.scroll} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <View style={s.totalCard}>
          <Text style={s.totalLabel}>Your prices so far</Text>
          <Text style={s.totalValue}>₹{total.toLocaleString('en-IN')}</Text>
          <Text style={s.totalHint}>Sum of the price you've entered per dish below — not multiplied by quantity, since quantity is often a note like "2 kg" or "50 pieces" rather than a plain number.</Text>
        </View>

        {groupedCategories.map(({ cat, dishes }) => (
          <View key={cat.slug} style={s.categoryBlock}>
            <Text style={s.categoryTitle}>{cat.icon} {cat.label}</Text>
            {dishes.map(sel => (
              <PriceRow key={sel.id} sel={sel} theme={theme} s={s} onUpdate={patch => handleUpdateDish(sel.id, patch)} />
            ))}
          </View>
        ))}

        <View style={s.quoteSection}>
          <Text style={s.sectionTitle}>Get quotes from caterers</Text>
          <Text style={s.sectionHint}>
            {quoteRequest?.status === 'closed'
              ? 'This request is closed — a caterer has been booked.'
              : "Invite one or more caterers to quote a real price on this exact dish list, or add a quote you got outside the app to compare alongside."}
          </Text>

          {requestOpen && (
            <TouchableOpacity style={s.inviteBtn} onPress={openCatererPicker}>
              <Text style={s.inviteBtnText}>+ Invite caterers</Text>
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
                      {bookingId === r.id ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.bookBtnText}>Book this caterer</Text>}
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          )}

          {requestOpen && (
            <View style={s.manualBlock}>
              <Text style={s.manualTitle}>Add an outside quote</Text>
              <TextInput style={s.input} placeholder="Caterer name" placeholderTextColor={theme.textTertiary} value={manualName} onChangeText={setManualName} />
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
            <Text style={s.modalTitle}>Invite caterers</Text>
            {caterersLoading ? (
              <ActivityIndicator color={theme.accent} style={{ marginVertical: 20 }} />
            ) : caterers.length === 0 ? (
              <Text style={s.sectionHint}>No caterers found on Utsav yet — you can still add an outside quote below instead.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 260 }}>
                {caterers.map(c => {
                  const picked = selectedCatererIds.includes(c.id);
                  return (
                    <TouchableOpacity key={c.id} style={[s.catererRow, picked && s.catererRowActive]} onPress={() => toggleCaterer(c.id)}>
                      <Text style={s.catererName}>{picked ? '✓ ' : ''}{c.business_name || c.name}</Text>
                      {!!c.city && <Text style={s.catererCity}>{c.city}</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            <TextInput
              style={[s.input, { marginTop: 12 }]}
              placeholder="Note for the caterers (optional)"
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

function PriceRow({ sel, theme, s, onUpdate }) {
  const [price, setPrice] = useState(sel.price != null ? String(sel.price) : '');
  const [quantity, setQuantity] = useState(sel.quantity || '');
  const [notes, setNotes] = useState(sel.notes || '');

  return (
    <View style={s.pickedRow}>
      <Text style={s.pickedName}>{sel.is_custom ? '✎ ' : ''}{sel.dish_name}</Text>
      <View style={s.pickedFieldsRow}>
        <TextInput
          style={[s.pickedInput, { flex: 1 }]}
          placeholder="Price"
          placeholderTextColor={theme.textTertiary}
          value={price}
          onChangeText={setPrice}
          onBlur={() => onUpdate({ price: price.trim() ? Number(price) : null })}
          keyboardType="numeric"
        />
        <TextInput
          style={[s.pickedInput, { flex: 1 }]}
          placeholder="Quantity"
          placeholderTextColor={theme.textTertiary}
          value={quantity}
          onChangeText={setQuantity}
          onBlur={() => onUpdate({ quantity: quantity.trim() || null })}
        />
      </View>
      <TextInput
        style={s.pickedNotesInput}
        placeholder="Notes (spice level, dietary notes, etc.)"
        placeholderTextColor={theme.textTertiary}
        value={notes}
        onChangeText={setNotes}
        onBlur={() => onUpdate({ notes: notes.trim() || null })}
      />
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    scroll: { flex: 1 },
    totalCard: { backgroundColor: theme.cardBg, borderRadius: 16, borderWidth: 0.5, borderColor: theme.border, padding: 16, marginBottom: 18 },
    totalLabel: { fontSize: 13, fontWeight: '700', color: theme.text },
    totalValue: { fontSize: 22, fontWeight: '800', color: theme.text, marginTop: 4 },
    totalHint: { fontSize: 11, color: theme.textTertiary, marginTop: 8, lineHeight: 15 },
    categoryBlock: { marginTop: 16, borderTopWidth: 0.5, borderTopColor: theme.border, paddingTop: 12 },
    categoryTitle: { fontSize: 14.5, fontWeight: '700', color: theme.text, marginBottom: 10 },
    pickedRow: { backgroundColor: theme.cardBg, borderRadius: 12, borderWidth: 0.5, borderColor: theme.border, padding: 12, marginBottom: 8 },
    pickedName: { fontSize: 13.5, fontWeight: '700', color: theme.text },
    pickedFieldsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    pickedInput: { backgroundColor: theme.bg, borderRadius: 10, borderWidth: 0.5, borderColor: theme.border, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12.5, color: theme.text },
    pickedNotesInput: { backgroundColor: theme.bg, borderRadius: 10, borderWidth: 0.5, borderColor: theme.border, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12.5, color: theme.text, marginTop: 8 },
    quoteSection: { marginTop: 28, borderTopWidth: 0.5, borderTopColor: theme.border, paddingTop: 16 },
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
    catererRow: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border, marginBottom: 8 },
    catererRowActive: { borderColor: theme.btnPrimary, backgroundColor: theme.btnPrimary + '22' },
    catererName: { fontSize: 13.5, fontWeight: '700', color: theme.text },
    catererCity: { fontSize: 11.5, color: theme.textSecondary, marginTop: 2 },
    modalCancelBtn: { paddingHorizontal: 18, paddingVertical: 13, borderRadius: 14, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    modalCancelBtnText: { fontSize: 13, fontWeight: '700', color: theme.text },
    modalSendBtn: { backgroundColor: theme.btnPrimary, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
    modalSendBtnText: { fontSize: 13.5, fontWeight: '700', color: theme.btnPrimaryText },
  });
}
