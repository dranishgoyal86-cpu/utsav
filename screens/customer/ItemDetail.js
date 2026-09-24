import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, Modal, KeyboardAvoidingView, ScrollView, Linking, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { showAlert, callEdgeFunction, toWhatsappNumber } from '../../helpers';
import { resolveMatchKey } from '../../vendorTaxonomy';
import { eventTypeName } from '../../lib/eventTypeNames';
import { getAvoidProviderIds } from '../../customerMemory';
import { PUBLIC_WEB_URL } from '../../config';
import AppHeader from '../../components/AppHeader';
import DesktopStandalonePage from '../../components/desktop/DesktopStandalonePage';
import { MAROON, CARD, LINE, TEXT, MUTED } from '../../lib/desktopTheme';

const DESKTOP_BREAKPOINT = 768;

export default function ItemDetail({ route, navigation }) {
  const { eventId, itemName, categorySlug, contextualLabel, basis, priceLow, priceHigh, quoteOnRequest } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const [event, setEvent] = useState(null);
  const [savedPlanId, setSavedPlanId] = useState(null);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [arranging, setArranging] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [alreadyArranged, setAlreadyArranged] = useState(false);

  // "booked outside the Utsav app" (Anish, Sept 16) — an optional, richer
  // layer on top of the plain arranged_categories flag above. Saved to its
  // own external_vendor_bookings row (one per event+category) so a host
  // can not only mark the item handled, but also keep the vendor's own
  // contact details here and message them straight from the app.
  const [externalBooking, setExternalBooking] = useState(null);
  const [vendorFormVisible, setVendorFormVisible] = useState(false);
  const [vendorName, setVendorName] = useState('');
  const [vendorEmail, setVendorEmail] = useState('');
  const [vendorPhone, setVendorPhone] = useState('');
  const [vendorAddress, setVendorAddress] = useState('');
  const [vendorBudget, setVendorBudget] = useState('');
  const [vendorInstructions, setVendorInstructions] = useState('');
  const [savingVendor, setSavingVendor] = useState(false);
  const [emailPreviewVisible, setEmailPreviewVisible] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => { fetchData(); }, [eventId, categorySlug]);

  async function fetchData() {
    try {
      setLoading(true);
      const { data: eventData, error: eventError } = await supabase.from('events').select('*').eq('id', eventId).single();
      if (eventError) throw eventError;
      setEvent(eventData);
      setAlreadyArranged((eventData.arranged_categories || []).includes(categorySlug));

      // Any previously-saved "outside Utsav" vendor details for this exact
      // item, if the host has filled them in before — prefills the form so
      // reopening this screen doesn't lose what they already typed.
      const { data: extBooking } = await supabase
        .from('external_vendor_bookings')
        .select('*')
        .eq('event_id', eventId)
        .eq('category_slug', categorySlug)
        .maybeSingle();
      if (extBooking) {
        setExternalBooking(extBooking);
        setVendorName(extBooking.vendor_name || '');
        setVendorEmail(extBooking.vendor_email || '');
        setVendorPhone(extBooking.vendor_phone || '');
        setVendorAddress(extBooking.vendor_address || '');
        setVendorBudget(extBooking.budget != null ? String(extBooking.budget) : '');
        setVendorInstructions(extBooking.instructions || '');
      }

      // Booking (CreateBookingScreen.js) prefills from the event via
      // saved_plans.id, not eventId directly — bookings.saved_plan_id is
      // what actually links a booking back to a plan. Resolved here, once,
      // so tapping a provider row carries it forward instead of silently
      // dropping the event context between here and the booking screen
      // (which is what happened before this — ProviderProfile.js only got
      // a bare providerId).
      const { data: linkedPlan } = await supabase.from('saved_plans').select('id').eq('event_id', eventId).maybeSingle();
      setSavedPlanId(linkedPlan?.id || null);

      // services has no category_slug — and no city — of its own. category
      // is qualified via the same helper the plan engine itself uses
      // (vendorTaxonomy.js's resolveMatchKey); city lives on the provider,
      // not the service (confirmed against the live schema — services has
      // no city column at all), so the city filter has to happen on the
      // providers query below, not here.
      // package_details is pulled too — needed below for the vegetarian-only
      // caterer filter (mealType lives in there, see serviceTemplates.js's
      // CATERERS_FIELDS).
      const { data: activeServices, error: servicesError } = await supabase
        .from('services')
        .select('id, provider_id, category, package_details')
        .eq('is_active', true);
      if (servicesError) throw servicesError;

      // Ported from the old EventPlanner.js flow, which never let a
      // provider the customer rated ≤2 stars or explicitly blocked show up
      // in "Recommended providers" — this list had no equivalent here at
      // all. Avoid-list is the viewer's own (whoever's looking at this
      // screen), not the event host's, matching getAvoidProviderIds' own
      // per-customer contract.
      const { data: { session } } = await supabase.auth.getSession();
      const avoidProviderIds = session ? await getAvoidProviderIds(session.user.id) : [];

      // Vegetarian-only events (events.is_veg_only) hide caterers whose
      // "Meal type" package field is set to exactly "Non-veg available" —
      // a caterer who serves "Both available" still shows (they can run an
      // all-veg menu for this event), and any service outside "Food &
      // Beverages > Caterers" (Bartending Services, Mocktail Bars, etc.)
      // is untouched — is_veg_only is a food restriction only, it doesn't
      // imply a dry event (that's the separate is_dry_event toggle).
      const isCaterersCategory = categorySlug === 'Food & Beverages > Caterers';
      // Dry events (events.is_dry_event) mirror this for alcohol instead of
      // food: Bartending Services is the one Food & Beverages subcategory
      // that's inherently alcohol (Mocktail Bars is explicitly non-alcoholic
      // and stays untouched), so a dry event drops the whole category rather
      // than filtering individual services within it. This is a defense-in-
      // depth check alongside lib/eventResolver.js's suppressed_when_dry
      // requirement flag, which already keeps a dry event's checklist from
      // surfacing a "Bar Service" item in the first place — this covers
      // anyone who still lands here directly (e.g. via Search/CategoryList).
      const isBartendingCategory = categorySlug === 'Food & Beverages > Bartending Services';
      const matchingProviderIds = [...new Set(
        (activeServices || [])
          .filter(sv => resolveMatchKey(sv.category) === categorySlug)
          .filter(() => !(isBartendingCategory && eventData.is_dry_event))
          .filter(sv => !(isCaterersCategory && eventData.is_veg_only && sv.package_details?.mealType === 'Non-veg available'))
          .map(sv => sv.provider_id)
          .filter(Boolean)
      )].filter(id => !avoidProviderIds.includes(id));

      if (matchingProviderIds.length > 0) {
        let providerQuery = supabase
          .from('providers')
          .select('id, name, business_name, city, rating, logo_url')
          .in('id', matchingProviderIds);
        if (eventData.city) providerQuery = providerQuery.eq('city', eventData.city);
        const { data: providerRows, error: providersError } = await providerQuery;
        if (providersError) throw providersError;
        setProviders(providerRows || []);
      } else {
        setProviders([]);
      }
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function markArranged() {
    if (alreadyArranged) return;
    setArranging(true);
    try {
      const updated = [...(event.arranged_categories || []), categorySlug];
      const { error } = await supabase.from('events').update({ arranged_categories: updated }).eq('id', eventId);
      if (error) throw error;
      setEvent(prev => ({ ...prev, arranged_categories: updated }));
      setAlreadyArranged(true);
      showAlert('Marked as arranged ✓', `${itemName} now counts as handled on your plan.`);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setArranging(false);
    }
  }

  async function saveVendorDetails() {
    setSavingVendor(true);
    try {
      const cleanedBudget = vendorBudget.trim().replace(/[^\d.]/g, '');
      const payload = {
        event_id: eventId,
        category_slug: categorySlug,
        item_name: itemName,
        vendor_name: vendorName.trim() || null,
        vendor_email: vendorEmail.trim() || null,
        vendor_phone: vendorPhone.trim() || null,
        vendor_address: vendorAddress.trim() || null,
        budget: cleanedBudget ? Number(cleanedBudget) : null,
        instructions: vendorInstructions.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('external_vendor_bookings')
        .upsert(payload, { onConflict: 'event_id,category_slug' })
        .select()
        .single();
      if (error) throw error;
      setExternalBooking(data);
      // Saving real vendor details is a strong enough signal that this
      // item is being handled outside the app — reuse the exact same
      // arranged_categories flag markArranged() already writes, so every
      // other screen's "is this item handled" logic keeps working without
      // needing to know external_vendor_bookings exists at all.
      if (!alreadyArranged) {
        const updated = [...(event.arranged_categories || []), categorySlug];
        const { error: arrangeErr } = await supabase.from('events').update({ arranged_categories: updated }).eq('id', eventId);
        if (arrangeErr) throw arrangeErr;
        setEvent(prev => ({ ...prev, arranged_categories: updated }));
        setAlreadyArranged(true);
      }
      setVendorFormVisible(false);
      showAlert('Saved ✓', 'Vendor details saved for this item.');
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSavingVendor(false);
    }
  }

  function buildVendorMessage() {
    const dateStr = event?.event_date
      ? new Date(event.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
      : null;
    const lines = [
      `Hi${vendorName.trim() ? ' ' + vendorName.trim() : ''},`,
      '',
      `This is regarding ${label}${event?.working_title ? ` for "${event.working_title}"` : ''}${dateStr ? ` on ${dateStr}` : ''}.`,
    ];
    if (vendorBudget.trim()) lines.push(`Budget: ₹${vendorBudget.trim()}`);
    if (vendorAddress.trim()) lines.push(`Venue/address: ${vendorAddress.trim()}`);
    if (vendorInstructions.trim()) lines.push(`Notes: ${vendorInstructions.trim()}`);
    lines.push('', `— Sent via Utsav (${PUBLIC_WEB_URL})`);
    return lines.join('\n');
  }

  function sendViaWhatsapp() {
    const number = toWhatsappNumber(vendorPhone);
    if (!number) { showAlert('No phone number', "Add the vendor's phone number first, then save."); return; }
    const url = `https://wa.me/${number}?text=${encodeURIComponent(buildVendorMessage())}`;
    Linking.openURL(url).catch(() => {
      showAlert('Could not open WhatsApp', 'Make sure WhatsApp is installed on this device.');
    });
  }

  function openEmailPreview() {
    if (!vendorEmail.trim()) { showAlert('No email address', "Add the vendor's email first, then save."); return; }
    setEmailPreviewVisible(true);
  }

  async function confirmSendEmail() {
    setSendingEmail(true);
    try {
      const html = buildVendorMessage().split('\n').map(l => (l ? `<p>${l}</p>` : '<br/>')).join('');
      await callEdgeFunction('send-email', {
        to: vendorEmail.trim(),
        subject: `Regarding ${label}${event?.working_title ? ` — ${event.working_title}` : ''}`,
        html,
      });
      setEmailPreviewVisible(false);
      showAlert('Email sent ✓', `Your message was sent to ${vendorEmail.trim()}.`);
    } catch (err) {
      showAlert('Could not send email', err.message);
    } finally {
      setSendingEmail(false);
    }
  }

  async function notifyMe() {
    setNotifying(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { showAlert('Not signed in', 'Please log in first.'); return; }

      const { data: existing, error: findError } = await supabase
        .from('category_interest')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('event_id', eventId)
        .eq('category', categorySlug)
        .maybeSingle();
      if (findError) throw findError;

      if (!existing) {
        const { error } = await supabase.from('category_interest').insert({
          user_id: session.user.id,
          event_id: eventId,
          category: categorySlug,
          city: event?.city || null,
          event_type_slug: event?.event_type_slug || null,
        });
        if (error) throw error;
      }
      showAlert("You're on the list", `We'll let you know when a new ${itemName.toLowerCase()} vendor lists here.`);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setNotifying(false);
    }
  }

  function findVendor() {
    // savedPlanId (resolved in fetchData, same value the recommended-
    // providers list below already forwards) was missing here — anyone who
    // used "Find a vendor" instead of tapping a recommended provider lost
    // event-plan context the moment they left this screen, so their
    // eventual booking never autofilled.
    navigation.navigate('Search', { presetCategory: categorySlug, presetCity: event?.city, savedPlanId });
  }

  const label = contextualLabel || itemName;
  const priceText = quoteOnRequest
    ? 'Quote on request'
    : (priceLow != null ? `₹${priceLow.toLocaleString('en-IN')}–${priceHigh.toLocaleString('en-IN')}` : 'Price unavailable yet');
  const vs = isDesktopWeb ? ds : s;

  // "keep it optional" (Anish, Sept 16) — this whole block is available
  // whether or not the item is already marked arranged, and filling it in
  // is never required. Shared between the mobile and desktop return
  // branches below (same pattern as the rest of this file — vs picks the
  // matching style set for whichever branch is rendering).
  // "add a bigger prompt for this" (Anish, Sept 16) — the entry point used
  // to be a small 13px text link, easy to miss under the two big action
  // buttons above. Now a full-width card for the empty state, same visual
  // weight as the vendor-listing cards below it. Once details are actually
  // saved, the existing summary card (name, budget, email/WhatsApp
  // buttons) already carries plenty of visual weight on its own, so that
  // part is unchanged — just a smaller "edit" link above it, same as
  // before.
  const vendorSectionEl = (
    <View style={vs.vendorSection}>
      {externalBooking ? (
        <>
          <TouchableOpacity onPress={() => setVendorFormVisible(true)}>
            <Text style={vs.vendorLinkText}>✎ Edit vendor details</Text>
          </TouchableOpacity>
          <View style={vs.vendorSummaryCard}>
            <Text style={vs.vendorSummaryValue}>{externalBooking.vendor_name || 'Vendor'}</Text>
            {externalBooking.budget != null ? <Text style={vs.vendorSummaryLabel}>Budget: ₹{Number(externalBooking.budget).toLocaleString('en-IN')}</Text> : null}
            <View style={vs.vendorSendRow}>
              <TouchableOpacity
                style={[vs.vendorSendBtn, !externalBooking.vendor_email && vs.vendorSendBtnDisabled]}
                onPress={openEmailPreview}
                disabled={!externalBooking.vendor_email}
              >
                <Text style={vs.vendorSendBtnText}>✉️ Email vendor</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[vs.vendorSendBtn, !externalBooking.vendor_phone && vs.vendorSendBtnDisabled]}
                onPress={sendViaWhatsapp}
                disabled={!externalBooking.vendor_phone}
              >
                <Text style={vs.vendorSendBtnText}>💬 WhatsApp vendor</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      ) : (
        <TouchableOpacity style={vs.vendorPromptCard} onPress={() => setVendorFormVisible(true)}>
          <Text style={vs.vendorPromptIcon}>📝</Text>
          <View style={{ flex: 1 }}>
            <Text style={vs.vendorPromptTitle}>Booked this outside Utsav?</Text>
            <Text style={vs.vendorPromptSub}>Save the vendor's name & contact so you can follow up later</Text>
          </View>
          <Text style={vs.vendorPromptArrow}>›</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const vendorFormModalEl = (
    <Modal visible={vendorFormVisible} transparent animationType="fade" onRequestClose={() => setVendorFormVisible(false)}>
      <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.modalCard}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={s.modalTitle}>Vendor details for {label}</Text>
            <Text style={s.formLabel}>Vendor / business name</Text>
            <TextInput style={s.formInput} value={vendorName} onChangeText={setVendorName} placeholder="e.g. Sharma Caterers" placeholderTextColor={theme.textTertiary} />
            <Text style={s.formLabel}>Email</Text>
            <TextInput style={s.formInput} value={vendorEmail} onChangeText={setVendorEmail} placeholder="vendor@example.com" placeholderTextColor={theme.textTertiary} keyboardType="email-address" autoCapitalize="none" />
            <Text style={s.formLabel}>Phone</Text>
            <TextInput style={s.formInput} value={vendorPhone} onChangeText={setVendorPhone} placeholder="9999999999" placeholderTextColor={theme.textTertiary} keyboardType="phone-pad" />
            <Text style={s.formLabel}>Address</Text>
            <TextInput style={s.formInput} value={vendorAddress} onChangeText={setVendorAddress} placeholder="Shop / venue address" placeholderTextColor={theme.textTertiary} />
            <Text style={s.formLabel}>Budget (₹)</Text>
            <TextInput style={s.formInput} value={vendorBudget} onChangeText={setVendorBudget} placeholder="e.g. 50000" placeholderTextColor={theme.textTertiary} keyboardType="numeric" />
            <Text style={s.formLabel}>Instructions for the vendor</Text>
            <TextInput
              style={[s.formInput, s.formInputMultiline]}
              value={vendorInstructions}
              onChangeText={setVendorInstructions}
              placeholder="Anything specific they should know"
              placeholderTextColor={theme.textTertiary}
              multiline
            />
            <View style={s.modalBtnRow}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setVendorFormVisible(false)} disabled={savingVendor}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalSaveBtn} onPress={saveVendorDetails} disabled={savingVendor}>
                {savingVendor ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={s.modalSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const emailPreviewModalEl = (
    <Modal visible={emailPreviewVisible} transparent animationType="fade" onRequestClose={() => setEmailPreviewVisible(false)}>
      <View style={s.modalOverlay}>
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>Send email to vendor?</Text>
          <Text style={s.formLabel}>To: {vendorEmail}</Text>
          <View style={s.previewBox}>
            <Text style={s.previewText}>{buildVendorMessage()}</Text>
          </View>
          <View style={s.modalBtnRow}>
            <TouchableOpacity style={s.modalCancelBtn} onPress={() => setEmailPreviewVisible(false)} disabled={sendingEmail}>
              <Text style={s.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.modalSaveBtn} onPress={confirmSendEmail} disabled={sendingEmail}>
              {sendingEmail ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={s.modalSaveText}>Send</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (isDesktopWeb) {
    return (
      <DesktopStandalonePage onBack={() => navigation.goBack()} title={label} maxWidth={800}>
        {loading ? (
          <View style={{ paddingVertical: 50, alignItems: 'center' }}><ActivityIndicator color={MAROON} /></View>
        ) : (
          <>
            <View style={ds.priceCard}>
              <Text style={ds.priceValue}>{priceText}</Text>
              {basis ? <Text style={ds.priceBasis}>{basis}</Text> : null}
            </View>
            <View style={ds.actionsRow}>
              <TouchableOpacity style={ds.primaryBtn} onPress={findVendor}>
                <Text style={ds.primaryBtnText}>Find a vendor</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[ds.secondaryBtn, alreadyArranged && { opacity: 0.5 }]} onPress={markArranged} disabled={arranging || alreadyArranged}>
                {arranging ? <ActivityIndicator color={TEXT} size="small" /> : <Text style={ds.secondaryBtnText}>{alreadyArranged ? '✓ Arranged' : 'Mark as arranged'}</Text>}
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={ds.notifyBtn} onPress={notifyMe} disabled={notifying}>
              {notifying ? <ActivityIndicator color={MAROON} size="small" /> : <Text style={ds.notifyBtnText}>🔔 Notify me when a new vendor is available</Text>}
            </TouchableOpacity>

            {vendorSectionEl}

            <Text style={ds.sectionLabel}>{providers.length > 0 ? `VENDORS IN THIS CATEGORY (${providers.length})` : 'NO VENDORS LISTED YET'}</Text>
            {providers.length === 0 ? (
              <Text style={ds.emptyText}>No vendors listed here yet — tap notify above and we'll tell you when one is.</Text>
            ) : (
              <View style={ds.grid}>
                {providers.map(item => (
                  <TouchableOpacity key={item.id} style={ds.providerCard} onPress={() => navigation.navigate('ProviderProfile', { providerId: item.id, savedPlanId, eventId, itemName, categorySlug })}>
                    <Text style={ds.providerName}>{item.business_name || item.name || 'Unnamed provider'}</Text>
                    <Text style={ds.providerMeta}>{item.city}{item.rating ? ` · ⭐ ${item.rating.toFixed(1)}` : ''}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}
        {vendorFormModalEl}
        {emailPreviewModalEl}
      </DesktopStandalonePage>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title={label} onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={providers}
          keyExtractor={p => p.id}
          contentContainerStyle={s.scroll}
          ListHeaderComponent={
            <>
              <View style={s.priceCard}>
                <Text style={s.priceValue}>{priceText}</Text>
                {basis ? <Text style={s.priceBasis}>{basis}</Text> : null}
              </View>

              <View style={s.actionsRow}>
                <TouchableOpacity style={s.primaryBtn} onPress={findVendor}>
                  <Text style={s.primaryBtnText}>Find a vendor</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.secondaryBtn, alreadyArranged && { opacity: 0.5 }]}
                  onPress={markArranged}
                  disabled={arranging || alreadyArranged}
                >
                  {arranging ? <ActivityIndicator color={theme.text} size="small" /> : (
                    <Text style={s.secondaryBtnText}>{alreadyArranged ? '✓ Arranged' : 'Mark as arranged'}</Text>
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={s.notifyBtn} onPress={notifyMe} disabled={notifying}>
                {notifying ? <ActivityIndicator color={theme.accent} size="small" /> : (
                  <Text style={s.notifyBtnText}>🔔 Notify me when a new vendor is available</Text>
                )}
              </TouchableOpacity>

              {vendorSectionEl}

              <Text style={s.sectionLabel}>
                {providers.length > 0 ? `VENDORS IN THIS CATEGORY (${providers.length})` : 'NO VENDORS LISTED YET'}
              </Text>
            </>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={s.providerRow} onPress={() => navigation.navigate('ProviderProfile', { providerId: item.id, savedPlanId, eventId, itemName, categorySlug })}>
              <Text style={s.providerName}>{item.business_name || item.name || 'Unnamed provider'}</Text>
              <Text style={s.providerMeta}>{item.city}{item.rating ? ` · ⭐ ${item.rating.toFixed(1)}` : ''}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            providers.length === 0 && !loading ? (
              <Text style={s.emptyText}>No vendors listed here yet — tap notify above and we'll tell you when one is.</Text>
            ) : null
          }
        />
      )}
      {vendorFormModalEl}
      {emailPreviewModalEl}
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backBtn: { width: 30 },
    backIcon: { fontSize: 20, color: theme.text },
    headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: theme.text, textAlign: 'center' },
    scroll: { padding: 20, paddingBottom: 60 },

    priceCard: { backgroundColor: theme.cardBg, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border, padding: 18, marginBottom: 16, alignItems: 'center' },
    priceValue: { fontSize: 22, fontWeight: '700', color: theme.text, marginBottom: 6 },
    priceBasis: { fontSize: 12.5, color: theme.textSecondary, textAlign: 'center' },

    actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    primaryBtn: { flex: 1, backgroundColor: theme.btnPrimary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    primaryBtnText: { color: theme.btnPrimaryText, fontSize: 13.5, fontWeight: '700' },
    secondaryBtn: { flex: 1, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    secondaryBtnText: { color: theme.text, fontSize: 13.5, fontWeight: '700' },

    notifyBtn: { paddingVertical: 12, alignItems: 'center', marginBottom: 20 },
    notifyBtnText: { color: theme.accent, fontSize: 13, fontWeight: '600' },

    sectionLabel: { fontSize: 11, fontWeight: '700', color: theme.textTertiary, letterSpacing: 0.5, marginBottom: 10 },
    providerRow: { backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border, padding: 14, marginBottom: 8 },
    providerName: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 3 },
    providerMeta: { fontSize: 12, color: theme.textSecondary },
    emptyText: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', paddingVertical: 20, lineHeight: 19 },

    vendorSection: { marginBottom: 20 },
    vendorLinkText: { fontSize: 13, fontWeight: '700', color: theme.accent },
    vendorPromptCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: theme.cardBg, borderRadius: 16, borderWidth: 1, borderColor: theme.accent,
      padding: 16,
    },
    vendorPromptIcon: { fontSize: 22 },
    vendorPromptTitle: { fontSize: 14.5, fontWeight: '700', color: theme.text, marginBottom: 3 },
    vendorPromptSub: { fontSize: 12.5, color: theme.textSecondary, lineHeight: 17 },
    vendorPromptArrow: { fontSize: 20, color: theme.textTertiary },
    vendorSummaryCard: { backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border, padding: 14, marginTop: 10 },
    vendorSummaryValue: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 3 },
    vendorSummaryLabel: { fontSize: 12.5, color: theme.textSecondary, marginBottom: 8 },
    vendorSendRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
    vendorSendBtn: { flex: 1, backgroundColor: theme.btnPrimary, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
    vendorSendBtnDisabled: { opacity: 0.4 },
    vendorSendBtnText: { color: theme.btnPrimaryText, fontSize: 12.5, fontWeight: '700' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
    modalCard: { backgroundColor: theme.cardBg, borderRadius: 20, padding: 20, maxHeight: '85%' },
    modalTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 14 },
    formLabel: { fontSize: 12.5, fontWeight: '700', color: theme.textSecondary, marginBottom: 6, marginTop: 12 },
    formInput: { backgroundColor: theme.bg, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14, borderWidth: 1, borderColor: theme.border, color: theme.text },
    formInputMultiline: { minHeight: 70, textAlignVertical: 'top' },
    modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
    modalCancelBtn: { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: theme.border },
    modalCancelText: { color: theme.text, fontSize: 14, fontWeight: '700' },
    modalSaveBtn: { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: 14, backgroundColor: theme.btnPrimary },
    modalSaveText: { color: theme.btnPrimaryText, fontSize: 14, fontWeight: '700' },
    previewBox: { backgroundColor: theme.bg, borderRadius: 12, borderWidth: 1, borderColor: theme.border, padding: 14, marginTop: 10 },
    previewText: { fontSize: 13, color: theme.text, lineHeight: 19 },
  });
}

const ds = StyleSheet.create({
  priceCard: { backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: LINE, padding: 20, marginBottom: 18, alignItems: 'center' },
  priceValue: { fontFamily: 'Fraunces-SemiBold', fontSize: 24, color: TEXT, marginBottom: 6 },
  priceBasis: { fontSize: 12.5, color: MUTED, textAlign: 'center' },
  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  primaryBtn: { flex: 1, backgroundColor: MAROON, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 13.5, fontWeight: '700' },
  secondaryBtn: { flex: 1, backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  secondaryBtnText: { color: TEXT, fontSize: 13.5, fontWeight: '700' },
  notifyBtn: { paddingVertical: 12, alignItems: 'center', marginBottom: 20 },
  notifyBtnText: { color: MAROON, fontSize: 13, fontWeight: '600' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.5, marginBottom: 10 },
  emptyText: { fontSize: 13, color: MUTED, textAlign: 'center', paddingVertical: 20, lineHeight: 19 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  providerCard: { width: 240, backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: LINE, padding: 14 },
  providerName: { fontSize: 14, fontWeight: '700', color: TEXT, marginBottom: 3 },
  providerMeta: { fontSize: 12, color: MUTED },

  vendorSection: { marginBottom: 18 },
  vendorLinkText: { fontSize: 13, fontWeight: '700', color: MAROON },
  vendorPromptCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1.5, borderColor: MAROON,
    padding: 16,
  },
  vendorPromptIcon: { fontSize: 22 },
  vendorPromptTitle: { fontSize: 14.5, fontWeight: '700', color: TEXT, marginBottom: 3 },
  vendorPromptSub: { fontSize: 12.5, color: MUTED, lineHeight: 17 },
  vendorPromptArrow: { fontSize: 20, color: MUTED },
  vendorSummaryCard: { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: LINE, padding: 14, marginTop: 10 },
  vendorSummaryValue: { fontSize: 14, fontWeight: '700', color: TEXT, marginBottom: 3 },
  vendorSummaryLabel: { fontSize: 12.5, color: MUTED, marginBottom: 8 },
  vendorSendRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  vendorSendBtn: { flex: 1, backgroundColor: MAROON, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  vendorSendBtnDisabled: { opacity: 0.4 },
  vendorSendBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
});
