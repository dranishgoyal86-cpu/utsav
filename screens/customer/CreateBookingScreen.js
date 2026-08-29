import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, ActivityIndicator, Platform, KeyboardAvoidingView, useWindowDimensions
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CREAM } from '../../lib/desktopTheme';

const DESKTOP_BREAKPOINT = 768;
import { supabase } from '../../supabase';
import { resolveGuestPartySize } from '../../helpers';
import { createRazorpayOrder, initiatePayment, verifyPayment } from '../../payment';
import { useTheme } from '../../ThemeContext';
import { notifyNewBooking, notifyPaymentReceived } from '../../notifications';
import { resolveParentCategory } from '../../serviceTemplates';
import { resolveVenue, formatTimeLabel } from '../../lib/eventContext';
import { eventTypeName } from '../../lib/eventTypeNames';
import SlotField from '../../components/SlotField';
import { PencilSimple } from 'phosphor-react-native';
import AppHeader from '../../components/AppHeader';

const EVENT_TYPES = ['Wedding', 'Birthday', 'Corporate', 'Diwali', 'Engagement', 'Baby Shower'];
const DAYS_AHEAD = Array.from({ length: 365 }, (_, i) => {
  const date = new Date();
  date.setDate(date.getDate() + i);
  return date;
});
// A booking still "counts" for duplicate-prevention unless it's a dead end
// (cancelled/declined/payment_failed) — those are exactly the statuses a
// second attempt should be allowed to replace.
const ACTIVE_BOOKING_STATUSES = ['pending', 'payment_pending', 'confirmed', 'completed', 'reviewed'];

// This screen does double duty: { provider, service, savedPlanId } starts a
// new booking (unchanged flow); { bookingId } opens an existing one to
// recheck/modify details and, if it's still payment_pending, complete
// payment from the same place — one screen, one path, instead of a
// separate list-inline-edit and a separate dead-end payment button
// (BookingsScreen.js used to have both).
export default function CreateBookingScreen({ route, navigation }) {
  const { bookingId } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // This screen is a real-money Razorpay payment flow (1000+ lines, many
  // state branches) -- deliberately the lightest possible desktop touch,
  // matching ProfileScreen/ClaimBusiness's "centered, not restyled"
  // treatment: cap+center the exact same content, don't restructure a
  // single line of the payment logic or its JSX.
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;

  const [provider, setProvider] = useState(route.params.provider || null);
  const [service, setService] = useState(route.params.service || null);
  const [savedPlanId, setSavedPlanId] = useState(route.params.savedPlanId || null);
  const [existingBooking, setExistingBooking] = useState(null);
  const [loadingBooking, setLoadingBooking] = useState(!!bookingId);
  const [loadError, setLoadError] = useState(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(!bookingId && !!route.params.provider);

  const [eventDate, setEventDate] = useState(DAYS_AHEAD[7]);
  const [eventTime, setEventTime] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState('Wedding');
  const [guestCount, setGuestCount] = useState('');
  const [venue, setVenue] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingChanges, setSavingChanges] = useState(false);
  const [confirmingWithVendor, setConfirmingWithVendor] = useState(false);
  const [step, setStep] = useState('details');
  const [mealBreakdown, setMealBreakdown] = useState(null);
  const [eventPrefilled, setEventPrefilled] = useState(false);
  const [detailsEditingOverride, setDetailsEditingOverride] = useState(undefined);

  // Which function (Haldi/Sangeet/...) this booking is for, if any — only
  // ever shown/settable when the plan's event actually has real
  // event_functions rows. selectedSubEventId is stored as the literal value
  // that gets written to bookings.sub_event_id — that column is a real,
  // existing FK straight to sub_events.id (confirmed live: dormant, 0 of 23
  // real bookings had ever set it before this), so no extra lookup is
  // needed here: event_functions.source_sub_event_id already IS that id,
  // unlike event_todos/event_requirements which resolve it down to
  // sub_events.slug instead (their own matching columns are text, not a
  // uuid FK — same source, different target shape).
  const [eventFunctions, setEventFunctions] = useState([]);
  const [selectedSubEventId, setSelectedSubEventId] = useState(null);

  // What this specific service currently offers — service_payment_options
  // (provider's own choices, already eligibility-filtered at save time in
  // AddServiceScreen.js) joined to payment_term_options for the label/
  // percentage. Two queries, no join, matching this app's convention.
  // Empty for every pre-existing service until its provider actively sets
  // terms — that's the common case today, and degrades to showing nothing.
  const [offeredPaymentTerms, setOfferedPaymentTerms] = useState([]);
  const [selectedPaymentTermId, setSelectedPaymentTermId] = useState(null);
  const [loadingPaymentTerms, setLoadingPaymentTerms] = useState(true);
  const [paymentTermsStale, setPaymentTermsStale] = useState(false);

  // Snapshot of payment_term_option_ids ProviderProfile.js's badge actually
  // showed at tap time, if this screen was reached from there. undefined
  // (not []) when absent — e.g. reached via a deep link or some other path
  // with no badge to have gone stale relative to — which is the signal to
  // skip the staleness comparison below entirely, not just "0 options".
  const [paymentTermsSnapshot] = useState(route.params.paymentTermsSnapshot);

  const isCatering = service ? resolveParentCategory(service.category) === 'Food & Beverages' : false;

  useEffect(() => {
    if (!service?.id) { setLoadingPaymentTerms(false); return; }
    (async () => {
      try {
        setLoadingPaymentTerms(true);
        const { data: offeredRows } = await supabase
          .from('service_payment_options')
          .select('payment_term_option_id')
          .eq('service_id', service.id);

        const optionIds = (offeredRows || []).map(r => r.payment_term_option_id);

        // Staleness check against ProviderProfile.js's snapshot — only when
        // one was actually passed (undefined means this screen wasn't
        // reached from there, so there's nothing to compare against). Set
        // comparison, not array equality — the badge's fetch order has no
        // relationship to this screen's.
        if (paymentTermsSnapshot !== undefined) {
          const liveSet = new Set(optionIds);
          const snapshotSet = new Set(paymentTermsSnapshot);
          const changed = liveSet.size !== snapshotSet.size ||
            [...liveSet].some(id => !snapshotSet.has(id));
          setPaymentTermsStale(changed);
        }

        if (optionIds.length === 0) {
          setOfferedPaymentTerms([]);
          return;
        }

        const { data: optionRows } = await supabase
          .from('payment_term_options')
          .select('*')
          .in('id', optionIds)
          .order('sort_order', { ascending: true });

        const offered = optionRows || [];
        setOfferedPaymentTerms(offered);

        // Recheck-then-pay on an existing booking that already recorded a
        // choice — keep it selected even if the provider's currently-
        // offered list has since changed, since it's what was actually
        // agreed. A brand-new booking (or one with nothing recorded yet)
        // defaults to the single option when there's only one.
        if (existingBooking?.payment_term_option_id) {
          setSelectedPaymentTermId(existingBooking.payment_term_option_id);
        } else if (offered.length === 1) {
          setSelectedPaymentTermId(offered[0].id);
        }
      } catch (err) {
        console.log('Payment terms fetch error:', err.message);
      } finally {
        setLoadingPaymentTerms(false);
      }
    })();
  }, [service?.id, existingBooking?.payment_term_option_id]);

  function showAlert(title, message, onDismiss) {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
      if (onDismiss) onDismiss();
    } else {
      Alert.alert(title, message, onDismiss ? [{ text: 'OK', onPress: onDismiss }] : undefined);
    }
  }

  // Fires whenever savedPlanId resolves, in EITHER mode (new-booking mode
  // gets it from route.params directly; existing-booking mode sets it from
  // booking.saved_plan_id in the effect below) — one shared fetch instead
  // of duplicating it in both. Only functions actually linked to the real
  // sub_events taxonomy (source_sub_event_id set) are selectable — a
  // free-text function name with no taxonomy match has no sub_events.id to
  // write to bookings.sub_event_id at all, so it can't be offered here.
  useEffect(() => {
    if (!savedPlanId) { setEventFunctions([]); return; }
    (async () => {
      const { data: plan } = await supabase.from('saved_plans').select('event_id').eq('id', savedPlanId).maybeSingle();
      if (!plan?.event_id) { setEventFunctions([]); return; }
      const { data: functionsRows } = await supabase
        .from('event_functions').select('id, name, source_sub_event_id').eq('event_id', plan.event_id);
      setEventFunctions((functionsRows || []).filter(f => f.source_sub_event_id));
    })();
  }, [savedPlanId]);

  // Existing-booking mode: loads the booking plus its provider/service —
  // two separate queries each (no joins), same convention as everywhere
  // else. Prefills every field from what's already saved on the booking
  // itself (not the live event) — a booking is a commitment made at a
  // point in time, so "recheck" means showing what was actually agreed,
  // not silently swapping in whatever the event plan says today.
  useEffect(() => {
    if (!bookingId) return;
    (async () => {
      try {
        setLoadingBooking(true);
        const { data: booking, error } = await supabase.from('bookings').select('*').eq('id', bookingId).single();
        if (error) throw error;
        setExistingBooking(booking);
        setSavedPlanId(booking.saved_plan_id || null);
        setEventDate(booking.event_date ? new Date(booking.event_date + 'T00:00:00') : DAYS_AHEAD[7]);
        setEventTime(booking.event_time || '');
        setSelectedEvent(booking.event_type || 'Wedding');
        setGuestCount(booking.guest_count != null ? String(booking.guest_count) : '');
        setVenue(booking.venue || '');
        setNotes(booking.notes || '');
        setSelectedSubEventId(booking.sub_event_id || null);
        setEventPrefilled(true);

        const { data: providerRow } = await supabase.from('providers').select('*').eq('id', booking.provider_id).maybeSingle();
        if (providerRow?.user_id) {
          const { data: userRow } = await supabase.from('users').select('name, avatar_url').eq('id', providerRow.user_id).maybeSingle();
          setProvider({ ...providerRow, users: userRow || null });
        } else {
          setProvider(providerRow || null);
        }

        const { data: serviceRow } = await supabase.from('services').select('*').eq('id', booking.service_id).maybeSingle();
        setService(serviceRow || null);
      } catch (err) {
        setLoadError(err.message);
      } finally {
        setLoadingBooking(false);
      }
    })();
  }, [bookingId]);

  // New-booking mode only — same as before, guarded so it can never fire
  // for an existing booking and silently overwrite what was just loaded
  // from it with whatever the event plan currently says.
  useEffect(() => {
    if (bookingId || !savedPlanId) return;
    (async () => {
      const { data: plan } = await supabase.from('saved_plans').select('event_id').eq('id', savedPlanId).maybeSingle();
      if (!plan?.event_id) return;

      const { data: eventRow } = await supabase.from('events').select('*').eq('id', plan.event_id).maybeSingle();
      if (!eventRow) return;

      let venueRow = null;
      if (eventRow.venue_id) {
        const { data: v } = await supabase.from('venues').select('*').eq('id', eventRow.venue_id).maybeSingle();
        venueRow = v || null;
      }
      const resolvedVenue = resolveVenue(eventRow, venueRow);

      let prefilledSomething = false;
      if (eventRow.event_date) {
        const parsed = new Date(eventRow.event_date + 'T00:00:00');
        if (!isNaN(parsed.getTime())) { setEventDate(parsed); prefilledSomething = true; }
      }
      if (eventRow.event_type_slug) { setSelectedEvent(eventTypeName(eventRow.event_type_slug)); prefilledSomething = true; }
      if (eventRow.event_time) { setEventTime(eventRow.event_time); prefilledSomething = true; }
      const venueText = resolvedVenue.address || resolvedVenue.label;
      if (venueText) { setVenue(venueText); prefilledSomething = true; }
      if (eventRow.guest_count != null) { setGuestCount(String(eventRow.guest_count)); prefilledSomething = true; }
      setEventPrefilled(prefilledSomething);

      const { data: invitees } = await supabase.from('event_invitees')
        .select('rsvp_status, plus_ones, entry_type, household_size, food_pref').eq('event_id', plan.event_id);
      const confirmed = (invitees || []).filter(g => g.rsvp_status === 'yes');
      if (confirmed.length === 0) return;
      const headcount = confirmed.reduce((sum, g) => sum + resolveGuestPartySize(g), 0);
      setGuestCount(String(headcount));
      setMealBreakdown(confirmed.reduce((acc, g) => {
        const k = g.food_pref || 'any';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, { any: 0, veg: 0, nonveg: 0, jain: 0 }));
    })();
  }, [bookingId, savedPlanId]);

  // Blocks a second booking with the same provider for the same service on
  // the same plan before it's ever created — redirects into the existing
  // one (this same screen, existing-booking mode) instead of leaving two
  // near-duplicate bookings for the customer to sort out later.
  useEffect(() => {
    if (bookingId || !provider || !service) return;
    (async () => {
      try {
        setCheckingDuplicate(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        let dupQuery = supabase.from('bookings').select('id')
          .eq('customer_id', session.user.id)
          .eq('provider_id', provider.id)
          .eq('service_id', service.id)
          .in('status', ACTIVE_BOOKING_STATUSES);
        dupQuery = savedPlanId ? dupQuery.eq('saved_plan_id', savedPlanId) : dupQuery.is('saved_plan_id', null);
        const { data: existingRows } = await dupQuery.order('created_at', { ascending: false }).limit(1);
        const existing = existingRows?.[0] || null;

        if (existing) {
          showAlert(
            'Already booked',
            `You already have a booking with ${provider.users?.name || 'this provider'} for ${service.title}. Opening it instead of starting a new one.`,
            () => navigation.replace('Booking', { bookingId: existing.id })
          );
        }
      } catch (err) {
        console.log('Duplicate booking check error:', err.message);
      } finally {
        setCheckingDuplicate(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, provider?.id, service?.id, savedPlanId]);

  // Opens as a read-only summary whenever there's real data to show;
  // once the host taps Modify, their choice wins for the rest of this visit.
  const detailsEditing = detailsEditingOverride !== undefined ? detailsEditingOverride : !eventPrefilled;

  // An existing booking's amount is whatever was actually agreed/stored on
  // it at creation time — never recomputed from the service's current
  // price, which could have changed since. This also matches
  // create-razorpay-order's own server-side rule (it always reads
  // booking.total_amount, never a client-supplied figure).
  const platformFee = existingBooking ? existingBooking.commission_amount : Math.round((service?.price_from || 0) * 0.1);
  const totalAmount = existingBooking ? existingBooking.total_amount : (service?.price_from || 0) + platformFee;

  function handleProceedToPayment() {
    if (!guestCount || !venue) {
      showAlert('Missing details', 'Please fill in guest count and venue.');
      return;
    }
    if (offeredPaymentTerms.length > 1 && !selectedPaymentTermId) {
      showAlert('Choose payment terms', 'This provider offers more than one payment option — pick which one you\'re booking under.');
      return;
    }
    setStep('payment');
  }

  // Genuine third path alongside "proceed to payment": express intent to
  // book without committing to payment terms yet, so the host can negotiate
  // with the vendor first. Creates a real bookings row (status: 'pending' —
  // an existing-but-previously-unwritten status value already wired into
  // BookingsScreen.js's upcoming-tab filter and STATUS label map) with no
  // payment_id, then opens chat on it directly — ChatScreen.js's messages
  // table is keyed on booking_id, so the booking has to exist first; this is
  // the only path in the app that creates one before payment. Same
  // guest-count/venue gate as handleProceedToPayment — a chat about a
  // booking with no details filled in isn't useful either.
  async function handleConfirmWithVendorFirst() {
    if (!guestCount || !venue) {
      showAlert('Missing details', 'Please fill in guest count and venue.');
      return;
    }
    setConfirmingWithVendor(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: userData } = await supabase
        .from('users')
        .select('name')
        .eq('id', session.user.id)
        .maybeSingle();

      const { data: newBooking, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          customer_id: session.user.id,
          provider_id: provider.id,
          service_id: service.id,
          saved_plan_id: savedPlanId || null,
          sub_event_id: selectedSubEventId,
          event_date: eventDate.toISOString().split('T')[0],
          event_time: eventTime || null,
          event_type: selectedEvent,
          guest_count: parseInt(guestCount),
          venue,
          notes,
          // total_amount/commission_amount pre-filled with the current
          // indicative estimate (same as a direct booking) rather than left
          // null — the flow already shows this number to the host, and
          // once the vendor confirms a real price via chat (ChatScreen.js's
          // confirmCard(), see below), this row gets updated with the real
          // figure. status: 'inquiry', NOT 'pending' — 'pending' means "paid,
          // awaiting provider's accept/decline" elsewhere in this app
          // (verify-razorpay-payment/index.ts sets it after a real payment);
          // an inquiry has no payment at all yet, and must stay excluded
          // from every consumer that treats 'pending' as a real, actionable
          // booking (ProviderERP.js's Accept/Decline queue chief among them)
          // — this was the exact bug in this function before this fix.
          total_amount: totalAmount,
          commission_amount: platformFee,
          status: 'inquiry',
          payment_term_option_id: selectedPaymentTermId || null,
        })
        .select()
        .single();

      if (bookingError) throw bookingError;

      await notifyNewBooking(
        provider.id,
        userData?.name || 'Customer',
        selectedEvent,
        newBooking.id
      );

      navigation.replace('Chat', {
        booking: newBooking,
        receiverId: provider.users?.id,
        receiverName: provider.users?.name,
      });
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setConfirmingWithVendor(false);
    }
  }

  // Non-payment-pending existing booking: details can still be modified,
  // but there's no payment step attached — a plain update.
  async function saveDetailsOnly() {
    if (!guestCount || !venue) {
      showAlert('Missing details', 'Please fill in guest count and venue.');
      return;
    }
    setSavingChanges(true);
    try {
      const patch = {
        event_date: eventDate.toISOString().split('T')[0],
        event_time: eventTime || null,
        event_type: selectedEvent,
        guest_count: parseInt(guestCount, 10),
        venue,
        notes: notes.trim() || null,
        sub_event_id: selectedSubEventId,
      };
      const { error } = await supabase.from('bookings').update(patch).eq('id', existingBooking.id);
      if (error) throw error;
      setExistingBooking(prev => ({ ...prev, ...patch }));
      setDetailsEditingOverride(false);
      showAlert('Saved', 'Your booking details have been updated.');
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSavingChanges(false);
    }
  }

  async function handlePayment() {
    let createdBookingId = existingBooking?.id || null;
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: userData } = await supabase
        .from('users')
        .select('name, email, phone')
        .eq('id', session.user.id)
        .maybeSingle();

      let bookingRow = existingBooking;
      if (bookingRow) {
        // Recheck-then-pay: whatever was changed in the details step gets
        // saved now, so the booking that actually gets paid for matches
        // what was last reviewed, not a stale snapshot from when it was
        // first created.
        const patch = {
          event_date: eventDate.toISOString().split('T')[0],
          event_time: eventTime || null,
          event_type: selectedEvent,
          guest_count: parseInt(guestCount, 10),
          venue,
          notes: notes.trim() || null,
          sub_event_id: selectedSubEventId,
          payment_term_option_id: selectedPaymentTermId || null,
        };
        const { error: updateError } = await supabase.from('bookings').update(patch).eq('id', bookingRow.id);
        if (updateError) throw updateError;
        bookingRow = { ...bookingRow, ...patch };
      } else {
        const { data: newBooking, error: bookingError } = await supabase
          .from('bookings')
          .insert({
            customer_id: session.user.id,
            provider_id: provider.id,
            service_id: service.id,
            saved_plan_id: savedPlanId || null,
            sub_event_id: selectedSubEventId,
            event_date: eventDate.toISOString().split('T')[0],
            event_time: eventTime || null,
            event_type: selectedEvent,
            guest_count: parseInt(guestCount),
            venue,
            notes,
            total_amount: totalAmount,
            commission_amount: platformFee,
            status: 'payment_pending',
            payment_term_option_id: selectedPaymentTermId || null,
          })
          .select()
          .single();

        if (bookingError) throw bookingError;
        bookingRow = newBooking;
        createdBookingId = newBooking.id;
      }

      const order = await createRazorpayOrder(bookingRow.id);

      const paymentData = await initiatePayment({
        orderId: order.orderId,
        amount: order.amount,
        bookingId: bookingRow.id,
        customerName: userData?.name || 'Customer',
        customerEmail: userData?.email || session.user.email,
        customerPhone: userData?.phone || '9999999999',
        description: `${selectedEvent} · ${service.title} by ${provider.users?.name}`,
      });

      // The server verifies the Razorpay signature and only then marks the
      // booking/order paid — this call is what actually confirms payment,
      // not the Razorpay checkout promise resolving on its own.
      const verified = await verifyPayment({
        bookingId: bookingRow.id,
        razorpay_order_id: paymentData.razorpay_order_id,
        razorpay_payment_id: paymentData.razorpay_payment_id,
        razorpay_signature: paymentData.razorpay_signature,
      });

      await notifyNewBooking(
        provider.id,
        userData?.name || 'Customer',
        selectedEvent,
        bookingRow.id
      );
      await notifyPaymentReceived(provider.id, verified.totalAmount, selectedEvent, bookingRow.id);

      showAlert(
        'Payment successful! 🎉',
        `Your booking request has been sent to ${provider.users?.name}.\n\nPayment ID: ${verified.paymentId}`,
        () => navigation.navigate('CustomerTabs')
      );
    } catch (err) {
      console.log('Payment error:', err.message || err);
      if (err.code !== 'PAYMENT_CANCELLED') {
        // Only mark as failed the booking WE just created — never touch a
        // pre-existing booking's status on a resume-payment failure, its
        // payment_pending status is already the correct state to retry from.
        if (createdBookingId && !existingBooking) {
          await supabase
            .from('bookings')
            .update({ status: 'payment_failed' })
            .eq('id', createdBookingId);
        }
        showAlert('Payment failed', err.description || err.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (loadingBooking || checkingDuplicate || !provider || !service) {
    if (loadError) {
      return (
        <SafeAreaView style={[s.container, isDesktopWeb && { backgroundColor: CREAM }]}>
          <AppHeader title="Booking" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>{loadError}</Text>
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={[s.container, isDesktopWeb && { backgroundColor: CREAM }]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'payment') {
    return (
      <SafeAreaView style={[s.container, isDesktopWeb && { backgroundColor: CREAM }]}>
        <AppHeader title="Payment" onBack={() => setStep('details')} theme={theme} navigation={navigation} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={isDesktopWeb && ds.centerCol}>
          <View style={s.paymentHero}>
            <Text style={s.paymentHeroLabel}>Total amount</Text>
            <Text style={s.paymentHeroAmount}>₹{totalAmount.toLocaleString()}</Text>
            <Text style={s.paymentHeroSub}>
              Secure payment powered by Razorpay
            </Text>
          </View>

          <View style={s.summaryCard}>
            <Text style={s.summaryTitle}>Booking summary</Text>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Service</Text>
              <Text style={s.summaryValue}>{service.title}</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Provider</Text>
              <Text style={s.summaryValue}>{provider.users?.name}</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Event</Text>
              <Text style={s.summaryValue}>{selectedEvent}</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Date</Text>
              <Text style={s.summaryValue}>
                {eventDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
            </View>
            {eventTime ? (
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Time</Text>
                <Text style={s.summaryValue}>{formatTimeLabel(eventTime)}</Text>
              </View>
            ) : null}
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Guests</Text>
              <Text style={s.summaryValue}>{guestCount}</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Venue</Text>
              <Text style={s.summaryValue}>{venue}</Text>
            </View>
            {selectedPaymentTermId && offeredPaymentTerms.length > 0 ? (
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Payment terms</Text>
                <Text style={s.summaryValue}>
                  {offeredPaymentTerms.find(o => o.id === selectedPaymentTermId)?.label || '—'}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={s.priceCard}>
            <Text style={s.summaryTitle}>Price breakdown</Text>
            <View style={s.priceRow}>
              <Text style={s.priceLabel}>Service fee</Text>
              <Text style={s.priceValue}>₹{(totalAmount - platformFee).toLocaleString()}</Text>
            </View>
            <View style={s.priceRow}>
              <Text style={s.priceLabel}>Platform fee</Text>
              <Text style={s.priceValue}>₹{platformFee.toLocaleString()}</Text>
            </View>
            <View style={s.priceDivider} />
            <View style={s.priceRow}>
              <Text style={s.priceTotalLabel}>Total</Text>
              <Text style={s.priceTotalValue}>₹{totalAmount.toLocaleString()}</Text>
            </View>
          </View>

          <View style={s.securityBox}>
            <Text style={s.securityText}>
              🔒 Your payment is secured by Razorpay. We accept UPI, cards, net banking and wallets.
            </Text>
          </View>

          <View style={s.testCard}>
            <Text style={s.testCardTitle}>Test mode — use these details</Text>
            <Text style={s.testCardText}>Card: 4111 1111 1111 1111</Text>
            <Text style={s.testCardText}>Expiry: Any future date · CVV: Any 3 digits</Text>
            <Text style={s.testCardText}>OTP: 1234</Text>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        <View style={[s.bottomBar, { paddingBottom: 16 + insets.bottom }]}>
          <View style={isDesktopWeb && ds.bottomBarInner}>
            <TouchableOpacity
              style={[s.payBtn, loading && { opacity: 0.7 }]}
              onPress={handlePayment}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#FFF" />
                : <Text style={s.payBtnText}>
                    Pay ₹{totalAmount.toLocaleString()} with Razorpay →
                  </Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // 'pending' included so a booking created via "Confirm with vendor first"
  // can be resumed straight into the payment-terms picker + pay flow once
  // terms are actually settled — same resume path payment_pending already
  // uses ("Recheck details, then pay →" below).
  const canPay = existingBooking ? ['payment_pending', 'pending'].includes(existingBooking.status) : true;

  return (
    <SafeAreaView style={[s.container, isDesktopWeb && { backgroundColor: CREAM }]}>
      <AppHeader
        title={existingBooking ? 'Booking details' : 'Book service'}
        onBack={() => navigation.goBack()}
        theme={theme}
        navigation={navigation}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={isDesktopWeb && ds.centerCol}>
        <View style={s.serviceBanner}>
          <View style={s.serviceInfo}>
            <Text style={s.serviceName}>{service.title}</Text>
            <Text style={s.providerName}>by {provider.users?.name}</Text>
          </View>
          <Text style={s.servicePrice}>₹{(existingBooking ? totalAmount : service.price_from)?.toLocaleString()}</Text>
        </View>

        <View style={s.form}>
          {detailsEditing ? (
            <>
              {eventPrefilled && (
                <TouchableOpacity style={s.saveDetailsBtn} onPress={() => setDetailsEditingOverride(false)}>
                  <Text style={s.saveDetailsBtnText}>Done editing</Text>
                </TouchableOpacity>
              )}

              <Text style={s.label}>Event date</Text>
              <TouchableOpacity
                style={s.datePicker}
                onPress={() => setShowDatePicker(!showDatePicker)}
              >
                <Text style={s.dateIcon}>📅</Text>
                <Text style={s.dateText}>
                  {eventDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              </TouchableOpacity>
              {showDatePicker && (
                <View style={s.datePickerBox}>
                  <View style={s.datePickerHeader}>
                    <Text style={s.datePickerTitle}>Select date</Text>
                    <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                      <Text style={s.datePickerDone}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.datePickerScroll}>
                    {DAYS_AHEAD.slice(0, 60).map((date, i) => {
                      const isSelected = eventDate.toDateString() === date.toDateString();
                      return (
                        <TouchableOpacity
                          key={i}
                          style={[s.dateOption, isSelected && s.dateOptionActive]}
                          onPress={() => { setEventDate(date); setShowDatePicker(false); }}
                        >
                          <Text style={[s.dateOptionDay, isSelected && s.dateOptionActiveText]}>
                            {date.toLocaleDateString('en-IN', { weekday: 'short' })}
                          </Text>
                          <Text style={[s.dateOptionNum, isSelected && s.dateOptionActiveText]}>
                            {date.getDate()}
                          </Text>
                          <Text style={[s.dateOptionMonth, isSelected && s.dateOptionActiveText]}>
                            {date.toLocaleDateString('en-IN', { month: 'short' })}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              <SlotField
                slotKey="event_time"
                event={{ event_time: eventTime }}
                onSave={patch => setEventTime(patch.event_time)}
              />

              <Text style={s.label}>Event type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.pillScroll}>
                {EVENT_TYPES.map(e => (
                  <TouchableOpacity
                    key={e}
                    style={[s.pill, selectedEvent === e && s.pillActive]}
                    onPress={() => setSelectedEvent(e)}
                  >
                    <Text style={[s.pillText, selectedEvent === e && s.pillTextActive]}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {eventFunctions.length > 0 && (
                <>
                  <Text style={s.label}>Which function is this for? (optional)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.pillScroll}>
                    <TouchableOpacity
                      style={[s.pill, selectedSubEventId == null && s.pillActive]}
                      onPress={() => setSelectedSubEventId(null)}
                    >
                      <Text style={[s.pillText, selectedSubEventId == null && s.pillTextActive]}>Whole event</Text>
                    </TouchableOpacity>
                    {eventFunctions.map(fn => (
                      <TouchableOpacity
                        key={fn.id}
                        style={[s.pill, selectedSubEventId === fn.source_sub_event_id && s.pillActive]}
                        onPress={() => setSelectedSubEventId(fn.source_sub_event_id)}
                      >
                        <Text style={[s.pillText, selectedSubEventId === fn.source_sub_event_id && s.pillTextActive]}>{fn.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              <Text style={s.label}>Expected guests</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. 150"
                placeholderTextColor={theme.textTertiary}
                keyboardType="number-pad"
                value={guestCount}
                onChangeText={setGuestCount}
              />
              {isCatering && mealBreakdown ? (
                <Text style={s.guestCountHint}>
                  From your guest list: 🥦 {mealBreakdown.veg} Veg · 🍗 {mealBreakdown.nonveg} Non-veg · 🙏 {mealBreakdown.jain} Jain
                </Text>
              ) : null}

              <Text style={s.label}>Venue / location</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. Taj Banquet Hall, Delhi"
                placeholderTextColor={theme.textTertiary}
                value={venue}
                onChangeText={setVenue}
              />
            </>
          ) : (
            <View style={s.prefilledCard}>
              <View style={s.prefilledHeader}>
                <Text style={s.prefilledTitle}>{existingBooking ? 'Booking details' : 'From your event plan'}</Text>
                <TouchableOpacity style={s.modifyLink} onPress={() => setDetailsEditingOverride(true)}>
                  <PencilSimple size={13} color={theme.accent} />
                  <Text style={s.modifyLinkText}>Modify</Text>
                </TouchableOpacity>
              </View>
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Date</Text>
                <Text style={s.summaryValue}>
                  {eventDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              </View>
              {eventTime ? (
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Time</Text>
                  <Text style={s.summaryValue}>{formatTimeLabel(eventTime)}</Text>
                </View>
              ) : null}
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Event type</Text>
                <Text style={s.summaryValue}>{selectedEvent}</Text>
              </View>
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Guests</Text>
                <Text style={s.summaryValue}>{guestCount || '—'}</Text>
              </View>
              {isCatering && mealBreakdown ? (
                <Text style={s.guestCountHint}>
                  🥦 {mealBreakdown.veg} Veg · 🍗 {mealBreakdown.nonveg} Non-veg · 🙏 {mealBreakdown.jain} Jain
                </Text>
              ) : null}
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Venue</Text>
                <Text style={s.summaryValue}>{venue || '—'}</Text>
              </View>
            </View>
          )}

          <Text style={s.label}>Special requirements (optional)</Text>
          <TextInput
            style={[s.input, s.textArea]}
            placeholder="Any specific requirements..."
            placeholderTextColor={theme.textTertiary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
          />

          {/* Purely informational — never blocks anything below it. The live
              offeredPaymentTerms fetched above is always what's actually
              shown/selectable; this just explains why it might not match
              what the badge showed on ProviderProfile.js a moment ago. */}
          {!loadingPaymentTerms && paymentTermsStale && (
            <View style={s.paymentTermsStaleNotice}>
              <Text style={s.paymentTermsStaleNoticeText}>
                ℹ️ Payment terms have been updated since you viewed this listing.
              </Text>
            </View>
          )}

          {/* Zero rows in offeredPaymentTerms is the common case for every
              pre-existing service until its provider actively sets terms —
              degrades to showing nothing at all, not an empty/broken block. */}
          {!loadingPaymentTerms && offeredPaymentTerms.length === 1 && (
            <View style={s.paymentTermsInfo}>
              <Text style={s.paymentTermsInfoText}>
                💳 Payment terms: {offeredPaymentTerms[0].label}
              </Text>
            </View>
          )}
          {!loadingPaymentTerms && offeredPaymentTerms.length > 1 && (
            <>
              <Text style={s.label}>Payment terms</Text>
              <Text style={s.fieldHint}>This provider offers more than one option — choose which you're booking under.</Text>
              <View style={s.pillWrap}>
                {offeredPaymentTerms.map(opt => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[s.pill, selectedPaymentTermId === opt.id && s.pillActive]}
                    onPress={() => setSelectedPaymentTermId(opt.id)}
                  >
                    <Text style={[s.pillText, selectedPaymentTermId === opt.id && s.pillTextActive]}>
                      {selectedPaymentTermId === opt.id ? '✓ ' : ''}{opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <View style={s.priceCard}>
            <Text style={s.summaryTitle}>Price breakdown</Text>
            <View style={s.priceRow}>
              <Text style={s.priceLabel}>Service fee</Text>
              <Text style={s.priceValue}>₹{(totalAmount - platformFee).toLocaleString()}</Text>
            </View>
            <View style={s.priceRow}>
              <Text style={s.priceLabel}>Platform fee</Text>
              <Text style={s.priceValue}>₹{platformFee.toLocaleString()}</Text>
            </View>
            <View style={s.priceDivider} />
            <View style={s.priceRow}>
              <Text style={s.priceTotalLabel}>Total</Text>
              <Text style={s.priceTotalValue}>₹{totalAmount.toLocaleString()}</Text>
            </View>
          </View>

          <View style={s.securityBox}>
            <Text style={s.securityText}>
              🔒 100% secure payment via Razorpay. UPI, cards, net banking accepted.
            </Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {(canPay || detailsEditing) && (
        <View style={[s.bottomBar, { paddingBottom: 16 + insets.bottom }]}>
          <View style={isDesktopWeb && ds.bottomBarInner}>
          {canPay ? (
            <>
              <TouchableOpacity style={s.proceedBtn} onPress={handleProceedToPayment}>
                <Text style={s.proceedBtnText}>
                  {existingBooking ? 'Recheck details, then pay →' : 'Proceed to payment →'}
                </Text>
              </TouchableOpacity>
              {/* Only offered for a brand-new booking — once one already
                  exists (resuming a pending/payment_pending booking), the
                  chat-first path has already happened or doesn't apply. */}
              {!existingBooking && (
                <TouchableOpacity
                  style={[s.confirmVendorBtn, confirmingWithVendor && { opacity: 0.7 }]}
                  onPress={handleConfirmWithVendorFirst}
                  disabled={confirmingWithVendor}
                >
                  {confirmingWithVendor ? <ActivityIndicator color={theme.accent} /> : (
                    <Text style={s.confirmVendorBtnText}>💬 Confirm with vendor first</Text>
                  )}
                </TouchableOpacity>
              )}
            </>
          ) : (
            <TouchableOpacity style={[s.proceedBtn, savingChanges && { opacity: 0.7 }]} onPress={saveDetailsOnly} disabled={savingChanges}>
              {savingChanges ? <ActivityIndicator color={theme.btnPrimaryText} /> : (
                <Text style={s.proceedBtnText}>Save changes</Text>
              )}
            </TouchableOpacity>
          )}
          </View>
        </View>
      )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: theme.bg, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backIcon: { fontSize: 22, color: theme.text, width: 32 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: theme.text },

    serviceBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.text, margin: 16, borderRadius: 20, padding: 18 },
    serviceInfo: { flex: 1 },
    serviceName: { fontSize: 15, fontWeight: '700', color: theme.bg, marginBottom: 4 },
    providerName: { fontSize: 12, color: theme.textTertiary },
    servicePrice: { fontSize: 21, fontWeight: '700', color: theme.bg },

    form: { paddingHorizontal: 16 },
    label: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, marginBottom: 9, marginTop: 18 },
    input: { backgroundColor: theme.cardBg, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, fontSize: 14, borderWidth: 0.5, borderColor: theme.border, color: theme.text },
    guestCountHint: { fontSize: 12, color: theme.textSecondary, marginTop: 8 },
    textArea: { height: 100, textAlignVertical: 'top' },

    prefilledCard: { backgroundColor: theme.cardBg, borderRadius: 18, padding: 17, borderWidth: 0.5, borderColor: theme.border, marginTop: 18 },
    prefilledHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 },
    prefilledTitle: { fontSize: 13, fontWeight: '700', color: theme.textSecondary },
    modifyLink: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    modifyLinkText: { fontSize: 13, fontWeight: '700', color: theme.accent },
    saveDetailsBtn: { alignSelf: 'flex-end', marginTop: 18, marginBottom: -6 },
    saveDetailsBtnText: { fontSize: 13, fontWeight: '700', color: theme.accent },

    datePicker: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.cardBg, borderRadius: 14, padding: 15, borderWidth: 0.5, borderColor: theme.border, gap: 10 },
    dateIcon: { fontSize: 18 },
    dateText: { fontSize: 14, color: theme.text },
    datePickerBox: { backgroundColor: theme.cardBg, borderRadius: 16, marginTop: 8, borderWidth: 0.5, borderColor: theme.border, overflow: 'hidden' },
    datePickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    datePickerTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
    datePickerDone: { fontSize: 14, color: theme.accent, fontWeight: '700' },
    datePickerScroll: { paddingVertical: 12, paddingHorizontal: 8 },
    dateOption: { alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, marginHorizontal: 3, minWidth: 52 },
    dateOptionActive: { backgroundColor: theme.text },
    dateOptionDay: { fontSize: 10, color: theme.textSecondary, marginBottom: 4 },
    dateOptionNum: { fontSize: 18, fontWeight: '700', color: theme.text },
    dateOptionMonth: { fontSize: 10, color: theme.textSecondary, marginTop: 2 },
    dateOptionActiveText: { color: theme.bg },

    pillScroll: { flexGrow: 0, marginBottom: 4 },
    pill: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border, marginRight: 8, backgroundColor: theme.cardBg },
    pillActive: { backgroundColor: theme.text, borderColor: theme.text },
    pillText: { fontSize: 13, color: theme.textSecondary },
    pillTextActive: { color: theme.bg, fontWeight: '600' },
    pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },

    paymentTermsInfo: { backgroundColor: theme.cardBg, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, borderWidth: 0.5, borderColor: theme.border, marginTop: 18 },
    paymentTermsInfoText: { fontSize: 13, fontWeight: '600', color: theme.text },
    paymentTermsStaleNotice: { backgroundColor: theme.statusPending, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 12, marginTop: 18 },
    paymentTermsStaleNoticeText: { fontSize: 12.5, color: theme.statusPendingText, fontWeight: '600' },

    priceCard: { backgroundColor: theme.cardBg, borderRadius: 18, padding: 17, marginTop: 22, borderWidth: 0.5, borderColor: theme.border },
    summaryCard: { backgroundColor: theme.cardBg, borderRadius: 18, padding: 17, marginHorizontal: 16, marginBottom: 12, borderWidth: 0.5, borderColor: theme.border },
    summaryTitle: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 13 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 9 },
    summaryLabel: { fontSize: 13, color: theme.textSecondary },
    summaryValue: { fontSize: 13, color: theme.text, fontWeight: '600', flex: 1, textAlign: 'right' },
    priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 9 },
    priceLabel: { fontSize: 13, color: theme.textSecondary },
    priceValue: { fontSize: 13, color: theme.text, fontWeight: '600' },
    priceDivider: { height: 0.5, backgroundColor: theme.border, marginVertical: 9 },
    priceTotalLabel: { fontSize: 15, fontWeight: '700', color: theme.text },
    priceTotalValue: { fontSize: 15, fontWeight: '700', color: theme.accent },

    securityBox: { backgroundColor: theme.cardBg, borderRadius: 14, padding: 15, marginTop: 13, borderWidth: 0.5, borderColor: theme.border },
    securityText: { fontSize: 12, color: theme.textSecondary, lineHeight: 18 },
    testCard: { backgroundColor: '#E8F5E9', borderRadius: 14, padding: 15, marginTop: 13, marginHorizontal: 16, borderWidth: 0.5, borderColor: '#C8E6C9' },
    testCardTitle: { fontSize: 12, fontWeight: '700', color: '#2E7D32', marginBottom: 6 },
    testCardText: { fontSize: 12, color: '#2E7D32', marginBottom: 2 },

    paymentHero: { backgroundColor: theme.text, margin: 16, borderRadius: 20, padding: 26, alignItems: 'center' },
    paymentHeroLabel: { fontSize: 13, color: theme.textTertiary, marginBottom: 8 },
    paymentHeroAmount: { fontSize: 38, fontWeight: '700', color: theme.bg, marginBottom: 6, letterSpacing: -0.5 },
    paymentHeroSub: { fontSize: 12, color: theme.textTertiary },

    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: theme.bg, borderTopWidth: 0.5, borderTopColor: theme.border },
    proceedBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
    proceedBtnText: { fontSize: 15, fontWeight: '700', color: theme.btnPrimaryText },
    confirmVendorBtn: { marginTop: 10, borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: theme.accent },
    confirmVendorBtnText: { fontSize: 14, fontWeight: '700', color: theme.accent },
    payBtn: { backgroundColor: '#2E7D32', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
    payBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  });
}

// Desktop: centers the exact same content/buttons, doesn't restyle a
// single line of the real payment flow -- deliberately the lightest touch
// in this whole wave, per this screen's own real-money stakes (see the
// comment where isDesktopWeb is computed above).
const ds = StyleSheet.create({
  centerCol: { maxWidth: 560, width: '100%', alignSelf: 'center', paddingTop: 12 },
  // The bar itself keeps s.bottomBar's real position:absolute/left:0/
  // right:0 (so its background+border still spans the full width, correct
  // either way) -- alignSelf:'center' on this INNER wrapper is what
  // actually centers+caps its own content, independent of the parent's
  // own (unchanged) stretch behaviour.
  bottomBarInner: { alignSelf: 'center', width: '100%', maxWidth: 560 },
});
