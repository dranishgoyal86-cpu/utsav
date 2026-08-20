import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform, Modal, TextInput, Linking, KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import {
  EVENT_TYPES, CATEGORY_BY_ID, CITY_GROUPS, SERVICE_OPTIONS,
  getServiceOptionsFor, getVenueTypesFor, generateEventPlan, estimateBudget, suggestBudgetRange,
  generateDynamicTips,
} from '../../planLogic';
import { getAvoidProviderIds } from '../../customerMemory';
import LocationAutocomplete from '../../components/LocationAutocomplete';
import { renameEvent, googleCalendarUrl, fetchMarketData } from '../../helpers';
import AppHeader from '../../components/AppHeader';
import { resolveEventTypeSlug } from '../../lib/eventTypeSlug';

function googleMapsUrl(address) {
  if (/^https?:\/\//i.test(address.trim())) return address.trim(); // already a link — use as-is
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

const CUISINES = ['North Indian', 'South Indian', 'Chinese', 'Continental', 'Italian', 'Mughlai', 'Multi Cuisine'];
const GUEST_RANGES = ['Under 50', '50-100', '100-200', '200-500', 'Above 500'];

// Physical venue kind for the capability resolver (lib/capabilities.js) —
// deliberately named venueKind, not venueType: formData.venueType already
// means "which vendor category to browse for" (see the "Where will it be
// held?" section below), an unrelated, pre-existing field.
const VENUE_KINDS = [
  { id: 'independent_house', label: '🏡 Independent house' },
  { id: 'society_flat', label: '🏠 Society flat' },
  { id: 'society_clubhouse', label: '🏘️ Society clubhouse' },
  { id: 'banquet_hall', label: '🎪 Banquet hall' },
  { id: 'farmhouse', label: '🌳 Farmhouse' },
  { id: 'hotel', label: '🏨 Hotel' },
  { id: 'temple', label: '🛕 Temple' },
  { id: 'office', label: '🏢 Office' },
  { id: 'outdoor', label: '⛺ Outdoor venue' },
];
const BUDGET_RANGES = ['Under ₹50K', '₹50K-1L', '₹1L-3L', '₹3L-10L', 'Above ₹10L'];

const DAYS_AHEAD = Array.from({ length: 365 }, (_, i) => {
  const date = new Date();
  date.setDate(date.getDate() + i);
  return date;
});

export default function EventPlanner({ navigation, route }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const incomingType = route?.params?.eventType || '';
  const savedPlan = route?.params?.savedPlan || null;
  const prefilledFormData = route?.params?.prefilledFormData || null;
  const prefilledPlan = route?.params?.prefilledPlan || null;

  const [step, setStep] = useState((savedPlan || prefilledPlan) ? 'plan' : 'form');
  const [plan, setPlan] = useState(savedPlan?.plan_data || prefilledPlan || null);
  const [currentPlanId, setCurrentPlanId] = useState(savedPlan?.id || null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [guestEditModal, setGuestEditModal] = useState(false);
  const [guestCountInput, setGuestCountInput] = useState('');
  const [updatingGuests, setUpdatingGuests] = useState(false);
  const [linkedEventId, setLinkedEventId] = useState(savedPlan?.event_id || null);
  const [linkingGuestList, setLinkingGuestList] = useState(false);
  const [importPickerModal, setImportPickerModal] = useState(false);
  const [otherGuestLists, setOtherGuestLists] = useState([]);
  const [guestCounts, setGuestCounts] = useState({});
  const [loadingOtherLists, setLoadingOtherLists] = useState(false);
  const [importingListId, setImportingListId] = useState(null);
  // Rotates the visible planning-tips page on a timer — a full wall of every
  // applicable tip at once buries the useful ones; showing 2 at a time that
  // keep cycling surfaces the whole set without dumping it all in one go.
  const [tipPage, setTipPage] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTipPage(p => p + 1), 6000);
    return () => clearInterval(id);
  }, []);
  // Base defaults for every field this screen reads — merged UNDER whatever
  // comes in from a saved plan or the chat-draft parser (parseEventText in
  // planLogic.js), neither of which necessarily knows about every field this
  // screen adds over time. Without this merge, a field newly added here but
  // missing from an older saved_plans row or the parser's output would be
  // `undefined` rather than a safe empty value — real crash seen during
  // testing: `formData.homeAddress.trim()` threw when arriving via the
  // draft-adjust path, since the parser never sets homeAddress at all.
  const FORM_DEFAULTS = {
    eventName: '', eventType: incomingType, subEvent: null, eventDate: new Date(), timeOfDay: '', location: '',
    city: '', cityGroup: '', homeAddress: '', venueType: '',
    venueKind: '', isDryEvent: false, isVegOnly: false,
    guestRange: '', exactGuests: null, budgetRange: '', needsCatering: false,
    isNonVeg: false, hasAlcohol: false, cuisines: [], needsDecoration: false,
    needsPhotography: false, needsMusic: false, needsMehendi: false, needsMakeup: false,
    needsPandit: false, needsMandap: false, needsSeating: false, needsInvitations: false,
  };
  const [formData, setFormData] = useState(
    savedPlan?.form_data
      ? { ...FORM_DEFAULTS, ...savedPlan.form_data, eventDate: new Date(savedPlan.form_data.eventDate) }
      : prefilledFormData
      ? { ...FORM_DEFAULTS, ...prefilledFormData, eventDate: new Date(prefilledFormData.eventDate) }
      : FORM_DEFAULTS
  );

  // Vendors the customer has blocked or rated poorly — kept out of
  // recommendations here too, since this screen's "Recommended providers"
  // is the same passive-suggestion surface as PlanScreen's draft card.
  const [avoidProviderIds, setAvoidProviderIds] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setAvoidProviderIds(await getAvoidProviderIds(session.user.id));
    })();
  }, []);

  function update(key, value) {
    if (key === 'eventType') {
      // Switching category changes both which sub-events are offered and
      // which service toggles are shown (getServiceOptionsFor) — clear the
      // sub-event choice and all service flags rather than leaving stale
      // ones on from the previous category but hidden from view.
      setFormData(prev => ({
        ...prev, eventType: value, subEvent: null, venueType: '',
        needsCatering: false, needsDecoration: false, needsPhotography: false,
        needsMusic: false, needsMehendi: false, needsMakeup: false,
        needsPandit: false, needsMandap: false, needsSeating: false, needsInvitations: false,
      }));
      return;
    }
    if (key === 'subEvent') {
      // Changing sub-event within the same category can flip a Last-Rites
      // style override (getServiceOptionsFor is sub-event-aware) — clear
      // service flags here too so switching into/out of Last Rites doesn't
      // leave inappropriate ones silently on.
      setFormData(prev => ({
        ...prev, subEvent: value,
        needsCatering: false, needsDecoration: false, needsPhotography: false,
        needsMusic: false, needsMehendi: false, needsMakeup: false,
        needsPandit: false, needsMandap: false, needsSeating: false, needsInvitations: false,
      }));
      return;
    }
    setFormData(prev => ({ ...prev, [key]: value }));
  }

  function updateService(serviceId, value) {
    update(SERVICE_OPTIONS[serviceId].key, value);
  }

  // Host-typed name wins; otherwise fall back to the auto label this screen
  // has always used. Called fresh (not memoized) so it always reflects the
  // latest formData.eventName/eventType/city at the moment it's needed.
  function resolveEventName() {
    const eventTypeLabel = EVENT_TYPES.find(e => e.id === formData.eventType)?.label || 'Event';
    return formData.eventName?.trim() || `${eventTypeLabel} · ${formData.city || 'TBD'}`;
  }

  function toggleCuisine(cuisine) {
    setFormData(prev => ({
      ...prev,
      cuisines: prev.cuisines.includes(cuisine)
        ? prev.cuisines.filter(c => c !== cuisine)
        : [...prev.cuisines, cuisine],
    }));
  }

  function showAlert(title, message) {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  }

 async function handleGeneratePlan() {
    if (!formData.eventType || !formData.city || !formData.guestRange || !formData.budgetRange) {
      showAlert('Missing details', 'Please fill in event type, city, guest count and budget.');
      return;
    }
    try {
      setLoading(true);
      const { providers, services } = await fetchMarketData(formData.city);
      // Regenerating from the form is always bucket-driven — clear any earlier
      // exact-guest override so it can't silently outlive the guestRange pick.
      const generatedPlan = generateEventPlan({ ...formData, exactGuests: null }, providers, services, avoidProviderIds);
      setPlan(generatedPlan);
      setStep('plan');
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  // Silent, alert-free counterpart to savePlan()'s insert path. Bookings
  // need a real saved_plans row to attach to, but "Save plan" was never a
  // required step before browsing/booking — a host routinely taps "Browse
  // vendors" or a recommended-provider card straight off a freshly-generated
  // plan, well before ever tapping Save. Without this, currentPlanId is
  // still null at that moment and the resulting booking silently ends up
  // with no plan link at all (the actual root cause behind "no bookings
  // folder is being created"). Returns the id to use immediately, since
  // state set here hasn't re-rendered into scope yet.
  async function ensurePlanSaved() {
    if (currentPlanId) return currentPlanId;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const payload = {
        customer_id: session.user.id,
        event_type: formData.eventType,
        title: resolveEventName(),
        event_date: formData.eventDate.toISOString(),
        city: formData.city,
        total_budget: plan?.summary?.totalBudget || null,
        form_data: { ...formData, eventDate: formData.eventDate.toISOString() },
        plan_data: plan,
        status: 'planning',
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from('saved_plans').insert(payload).select().single();
      if (error) throw error;
      setCurrentPlanId(data.id);
      return data.id;
    } catch (err) {
      console.log('ensurePlanSaved error:', err.message);
      return null;
    }
  }

  async function savePlan() {
    try {
      setSaving(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { showAlert('Not signed in', 'Please log in to save plans.'); return; }

      const title = resolveEventName();

      const payload = {
        customer_id: session.user.id,
        event_type: formData.eventType,
        title,
        event_date: formData.eventDate.toISOString(),
        city: formData.city,
        total_budget: plan?.summary?.totalBudget || null,
        form_data: { ...formData, eventDate: formData.eventDate.toISOString() },
        plan_data: plan,
        status: 'planning',
        updated_at: new Date().toISOString(),
      };

      if (currentPlanId) {
        const { error } = await supabase
          .from('saved_plans').update(payload).eq('id', currentPlanId);
        if (error) throw error;
        showAlert('Updated! ✓', 'Your saved plan has been updated.');
      } else {
        const { data, error } = await supabase
          .from('saved_plans').insert(payload).select().single();
        if (error) throw error;
        setCurrentPlanId(data.id);
        showAlert('Plan saved! 🎉', 'Find it anytime in your Plan tab to compare or continue later.');
      }
    } catch (err) {
      console.log('savePlan error:', err.message);
      showAlert('Error saving plan', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveGuestCount() {
    const n = parseInt(guestCountInput, 10);
    if (!Number.isInteger(n) || n < 1) {
      showAlert('Invalid number', 'Enter a whole number of guests (1 or more).');
      return;
    }
    setUpdatingGuests(true);
    try {
      const updatedFormData = { ...formData, exactGuests: n };

      // Re-derive the plan with the corrected count — catering scales per
      // guest, so leaving the old breakdown in place would go stale (wrong
      // catering cost, wrong "capacity for N guests" venue note).
      const { providers, services } = await fetchMarketData(updatedFormData.city);

      const updatedPlan = generateEventPlan(updatedFormData, providers, services, avoidProviderIds);
      setFormData(updatedFormData);
      setPlan(updatedPlan);
      setGuestEditModal(false);

      if (currentPlanId) {
        const { error } = await supabase
          .from('saved_plans')
          .update({
            form_data: { ...updatedFormData, eventDate: updatedFormData.eventDate.toISOString() },
            plan_data: updatedPlan,
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentPlanId);
        if (error) throw error;
      }
    } catch (err) {
      showAlert('Error updating plan', err.message);
    } finally {
      setUpdatingGuests(false);
    }
  }

  function addToGoogleCalendar() {
    const eventTypeLabel = EVENT_TYPES.find(e => e.id === formData.eventType)?.label || 'Event';
    const location = formData.location === 'home' ? formData.homeAddress : (formData.venueType ? `${formData.venueType}, ${formData.city}` : formData.city);
    const url = googleCalendarUrl({
      title: `${eventTypeLabel} · ${formData.city || ''}`,
      date: formData.eventDate,
      details: `Planned on Utsav — ${plan?.summary?.guests || ''} guests, ₹${plan?.summary?.totalBudget?.toLocaleString() || ''} budget.`,
      location,
    });
    Linking.openURL(url);
  }

  // Guest lists are event-scoped (the `events` table), while a saved plan is
  // a lighter-weight JSONB record — so the first time someone wants a guest
  // list here, create the paired event on demand and link it, then just
  // hand off to the existing GuestList screen (manual add, contacts import,
  // tags — all already built there, no need to duplicate any of it).
  async function openGuestList() {
    if (!currentPlanId) {
      showAlert('Save your plan first', 'Save this plan before adding a guest list to it.');
      return;
    }

    if (linkedEventId) {
      setLinkingGuestList(true);
      try {
        const { data: event, error } = await supabase.from('events').select('*').eq('id', linkedEventId).single();
        if (error) throw error;
        navigation.navigate('GuestList', { event });
      } catch (err) {
        showAlert('Error', err.message);
      } finally {
        setLinkingGuestList(false);
      }
      return;
    }

    // Nothing linked yet — before defaulting to a blank list, offer to reuse
    // one of this host's other guest lists (e.g. from a past event), since
    // re-typing/re-importing the same guests for every new plan is exactly
    // the busywork this is meant to avoid. Skips straight to a blank list
    // for a first-time host with nothing to reuse.
    setLoadingOtherLists(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: events } = await supabase
        .from('events').select('*').eq('host_id', session.user.id).order('created_at', { ascending: false });

      if (!events?.length) {
        await createFreshGuestList();
        return;
      }

      const { data: invitees } = await supabase
        .from('event_invitees').select('event_id').eq('owner_user_id', session.user.id);
      const counts = {};
      (invitees || []).forEach(i => { counts[i.event_id] = (counts[i.event_id] || 0) + 1; });

      setGuestCounts(counts);
      setOtherGuestLists(events);
      setImportPickerModal(true);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setLoadingOtherLists(false);
    }
  }

  // Fields the capability resolver (lib/capabilities.js, via useCapabilities)
  // reads to decide what's visible on this event — shared by both event
  // creation paths below. guest_count/budget_total come from the generated
  // plan (same source savePlan() already uses for total_budget), not a
  // fresh guestRange lookup, so the two stay consistent with each other.
  function buildCapabilityFields() {
    return {
      venue_type: formData.venueKind || null,
      is_dry_event: formData.isDryEvent,
      is_veg_only: formData.isVegOnly,
      event_type_slug: resolveEventTypeSlug(formData.eventType, formData.subEvent),
      guest_count: plan?.summary?.guests ?? formData.exactGuests ?? null,
      budget_total: plan?.summary?.totalBudget ?? null,
    };
  }

  async function createFreshGuestList() {
    setLinkingGuestList(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resolvedName = resolveEventName();
      const { data: event, error: eventError } = await supabase
        .from('events')
        .insert({
          host_id: session.user.id,
          name: resolvedName,
          event_date: formData.eventDate.toISOString().split('T')[0],
          city: formData.city || '',
          // The home address the host typed for a home event becomes the
          // invite's venue automatically — a venue-based event has no single
          // exact address (just a venue type), so it's left blank there.
          venue: formData.location === 'home' ? formData.homeAddress?.trim() || '' : '',
          ...buildCapabilityFields(),
        })
        .select().single();
      if (eventError) throw eventError;

      // A named photo album for this event, no face-matching set up yet —
      // that stays an opt-in the host can enable later from the album.
      await supabase.from('albums').insert({ user_id: session.user.id, name: resolvedName, event_id: event.id });

      const { error: linkError } = await supabase
        .from('saved_plans').update({ event_id: event.id }).eq('id', currentPlanId);
      if (linkError) throw linkError;

      setLinkedEventId(event.id);
      setImportPickerModal(false);
      navigation.navigate('GuestList', { event });
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setLinkingGuestList(false);
    }
  }

  // Copies guest identities (name/phone/tag) from an existing guest list
  // into a fresh event created for THIS plan, named after it — RSVP status,
  // plus-ones and food prefs are answers to the OLD occasion's invite, not
  // part of who the guest is, so those deliberately reset rather than
  // carrying over stale answers into a new event.
  async function importGuestList(sourceEvent) {
    setImportingListId(sourceEvent.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resolvedName = resolveEventName();

      const { data: sourceGuests, error: guestsError } = await supabase
        .from('event_invitees').select('name, phone, tag').eq('event_id', sourceEvent.id);
      if (guestsError) throw guestsError;

      const { data: event, error: eventError } = await supabase
        .from('events')
        .insert({
          host_id: session.user.id,
          name: resolvedName,
          event_date: formData.eventDate.toISOString().split('T')[0],
          city: formData.city || '',
          venue: formData.location === 'home' ? formData.homeAddress?.trim() || '' : '',
          ...buildCapabilityFields(),
        })
        .select().single();
      if (eventError) throw eventError;

      await supabase.from('albums').insert({ user_id: session.user.id, name: resolvedName, event_id: event.id });

      if (sourceGuests?.length) {
        const rows = sourceGuests.map(g => ({
          event_id: event.id,
          owner_user_id: session.user.id,
          name: g.name,
          phone: g.phone,
          tag: g.tag,
        }));
        const { error: insertError } = await supabase.from('event_invitees').insert(rows);
        if (insertError) throw insertError;
      }

      const { error: linkError } = await supabase
        .from('saved_plans').update({ event_id: event.id }).eq('id', currentPlanId);
      if (linkError) throw linkError;

      setLinkedEventId(event.id);
      setImportPickerModal(false);
      navigation.navigate('GuestList', { event });
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setImportingListId(null);
    }
  }

  function SelectChip({ label, selected, onPress }) {
    return (
      <TouchableOpacity style={[s.chip, selected && s.chipActive]} onPress={onPress}>
        <Text style={[s.chipText, selected && s.chipTextActive]}>{label}</Text>
      </TouchableOpacity>
    );
  }

  function SectionTitle({ title, subtitle }) {
    return (
      <View style={s.sectionTitle}>
        <Text style={s.sectionTitleText}>{title}</Text>
        {subtitle && <Text style={s.sectionSubText}>{subtitle}</Text>}
      </View>
    );
  }

  function ToggleRow({ label, value, onToggle }) {
    return (
      <TouchableOpacity style={s.toggleRow} onPress={onToggle}>
        <Text style={s.toggleLabel}>{label}</Text>
        <View style={[s.toggle, value && s.toggleActive]}>
          <View style={[s.toggleThumb, value && s.toggleThumbActive]} />
        </View>
      </TouchableOpacity>
    );
  }

  if (step === 'plan' && plan) {
    return (
      <SafeAreaView style={s.container}>
        <AppHeader
          title="Your event plan"
          onBack={() => setStep('form')}
          theme={theme}
          navigation={navigation}
          rightActions={[
            <TouchableOpacity key="calendar" style={s.calendarTabBtn} onPress={addToGoogleCalendar}>
              <Text style={s.calendarTabBtnText}>📅</Text>
            </TouchableOpacity>,
          ]}
        />
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={s.planHero}>
            <Text style={s.planHeroIcon}>
              {EVENT_TYPES.find(e => e.label === plan.summary.eventType)?.icon || '🎉'}
            </Text>
            <Text style={s.planHeroTitle}>{plan.summary.eventType} Plan</Text>
            <Text style={s.planHeroSub}>
              {new Date(plan.summary.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} • {plan.summary.city}
            </Text>
            <View style={s.planStats}>
              <TouchableOpacity
                style={s.planStat}
                onPress={() => { setGuestCountInput(String(plan.summary.guests)); setGuestEditModal(true); }}
              >
                <Text style={s.planStatValue}>👥 {plan.summary.guests} <Text style={s.planStatEditHint}>✎</Text></Text>
                <Text style={s.planStatLabel}>Guests</Text>
              </TouchableOpacity>
              <View style={s.planStatDivider} />
              <View style={s.planStat}>
                <Text style={s.planStatValue}>💰 ₹{(plan.summary.totalBudget / 100000).toFixed(1)}L</Text>
                <Text style={s.planStatLabel}>Budget</Text>
              </View>
              <View style={s.planStatDivider} />
              <View style={s.planStat}>
                <Text style={s.planStatValue}>📋 {plan.breakdown.length}</Text>
                <Text style={s.planStatLabel}>Categories</Text>
              </View>
            </View>
          </View>

          <View style={s.planSection}>
            <Text style={s.planSectionTitle}>💰 Budget breakdown</Text>
            {plan.breakdown.map((item, index) => (
              <View key={index} style={s.breakdownRow}>
                <View style={s.breakdownLeft}>
                  <Text style={s.breakdownIcon}>{item.icon}</Text>
                  <View>
                    <Text style={s.breakdownCategory}>{item.category}</Text>
                    <Text style={s.breakdownNote}>{item.note}</Text>
                  </View>
                </View>
                <Text style={s.breakdownAmount}>₹{item.budget.toLocaleString()}</Text>
              </View>
            ))}
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Total budget</Text>
              <Text style={s.totalAmount}>₹{plan.summary.totalBudget.toLocaleString()}</Text>
            </View>
          </View>

          {plan.matchedProviders.length > 0 && (
            <View style={s.planSection}>
              <Text style={s.planSectionTitle}>⭐ Recommended providers</Text>
              {plan.matchedProviders.map(provider => (
                <TouchableOpacity
                  key={provider.id}
                  style={s.providerCard}
                  onPress={async () => navigation.navigate('ProviderProfile', { provider, savedPlanId: await ensurePlanSaved() })}
                >
                  <View style={s.providerAvatar}>
                    <Text style={s.providerAvatarText}>{provider.users?.name?.[0] || '?'}</Text>
                  </View>
                  <View style={s.providerInfo}>
                    <Text style={s.providerName}>{provider.users?.name}</Text>
                    <Text style={s.providerCategory}>{provider.category}</Text>
                    <Text style={s.providerRating}>⭐ {provider.rating?.toFixed(1) || 'New'}</Text>
                  </View>
                  <Text style={s.providerArrow}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {(() => {
            // Computed fresh (not plan.tips, which was frozen at generation
            // time) — the pool shifts as the event date gets closer and as
            // service/category selections change; only a rotating page of it
            // shows at once (see tipPage above) instead of the whole list.
            const allTips = generateDynamicTips(formData);
            const TIPS_PER_PAGE = 2;
            const totalPages = Math.max(1, Math.ceil(allTips.length / TIPS_PER_PAGE));
            const page = tipPage % totalPages;
            const visibleTips = allTips.slice(page * TIPS_PER_PAGE, page * TIPS_PER_PAGE + TIPS_PER_PAGE);
            return (
              <View style={s.planSection}>
                <Text style={s.planSectionTitle}>💡 Planning tips</Text>
                {visibleTips.map((tip, index) => (
                  <View key={`${page}-${index}`} style={s.tipRow}>
                    <Text style={s.tipDot}>•</Text>
                    <Text style={s.tipText}>{tip}</Text>
                  </View>
                ))}
                {totalPages > 1 && (
                  <View style={s.tipDots}>
                    {Array.from({ length: totalPages }).map((_, i) => (
                      <View key={i} style={[s.tipDotIndicator, i === page && s.tipDotIndicatorActive]} />
                    ))}
                  </View>
                )}
              </View>
            );
          })()}

         <View style={s.planActions}>
            <TouchableOpacity style={s.replanBtn} onPress={() => setStep('form')}>
              <Text style={s.replanBtnText}>↺ Modify</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.saveBtn, saving && { opacity: 0.7 }]}
              onPress={savePlan}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color={theme.text} />
                : <Text style={s.saveBtnText}>{currentPlanId ? '✓ Saved' : '🔖 Save plan'}</Text>
              }
            </TouchableOpacity>
          </View>

          <View style={s.quickTabRow}>
            <TouchableOpacity style={s.quickTab} onPress={openGuestList} disabled={linkingGuestList || loadingOtherLists}>
              {(linkingGuestList || loadingOtherLists)
                ? <ActivityIndicator color={theme.text} size="small" />
                : (
                  <>
                    <Text style={s.quickTabIcon}>👥</Text>
                    <Text style={s.quickTabLabel}>{linkedEventId ? 'Guest list' : 'Import list'}</Text>
                  </>
                )
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={s.quickTab}
              onPress={async () => navigation.navigate('CustomerTabs', {
                screen: 'Discover',
                params: {
                  savedPlanId: await ensurePlanSaved(),
                  eventTitle: `${plan.summary.eventType} · ${plan.summary.city}`,
                },
              })}
            >
              <Text style={s.quickTabIcon}>🔍</Text>
              <Text style={s.quickTabLabel}>Browse vendors</Text>
            </TouchableOpacity>
            {!!currentPlanId && (
              <TouchableOpacity
                style={s.quickTab}
                onPress={() => navigation.navigate('CustomerTabs', {
                  screen: 'Bookings',
                  params: { savedPlanId: currentPlanId, planTitle: resolveEventName() },
                })}
              >
                <Text style={s.quickTabIcon}>📁</Text>
                <Text style={s.quickTabLabel}>Bookings</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>

        <Modal
          visible={guestEditModal}
          transparent
          animationType="fade"
          onRequestClose={() => setGuestEditModal(false)}
        >
          <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={s.modalCard}>
              <Text style={s.modalTitle}>How many guests?</Text>
              <Text style={s.modalSub}>Enter the exact number attending — the budget breakdown updates to match.</Text>
              <TextInput
                style={s.modalInput}
                placeholder="e.g. 180"
                placeholderTextColor={theme.textSecondary}
                value={guestCountInput}
                onChangeText={setGuestCountInput}
                keyboardType="number-pad"
                autoFocus
                editable={!updatingGuests}
              />
              <View style={s.modalActions}>
                <TouchableOpacity style={s.modalCancelBtn} onPress={() => setGuestEditModal(false)} disabled={updatingGuests}>
                  <Text style={s.modalCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalSaveBtn} onPress={saveGuestCount} disabled={updatingGuests}>
                  {updatingGuests
                    ? <ActivityIndicator color={theme.btnPrimaryText} />
                    : <Text style={s.modalSaveBtnText}>Save</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <Modal
          visible={importPickerModal}
          transparent
          animationType="fade"
          onRequestClose={() => setImportPickerModal(false)}
        >
          <View style={s.modalOverlay}>
            <View style={[s.modalCard, { maxHeight: '78%' }]}>
              <Text style={s.modalTitle}>Guest list for this plan</Text>
              <Text style={s.modalSub}>
                Reuse guests from a past event — it's renamed to match this plan — or start with a blank list.
              </Text>
              <TouchableOpacity style={s.importFreshBtn} onPress={createFreshGuestList} disabled={linkingGuestList}>
                {linkingGuestList
                  ? <ActivityIndicator size="small" color={theme.accent} />
                  : <Text style={s.importFreshBtnText}>+ Start a new guest list</Text>
                }
              </TouchableOpacity>
              <ScrollView style={{ maxHeight: 280, marginTop: 4 }} showsVerticalScrollIndicator={false}>
                {otherGuestLists.map(ev => {
                  const count = guestCounts[ev.id] || 0;
                  const busy = importingListId === ev.id;
                  return (
                    <TouchableOpacity
                      key={ev.id}
                      style={s.importRow}
                      onPress={() => importGuestList(ev)}
                      disabled={!!importingListId}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={s.importRowName}>{ev.name}</Text>
                        <Text style={s.importRowMeta}>{count} guest{count === 1 ? '' : 's'}</Text>
                      </View>
                      {busy
                        ? <ActivityIndicator size="small" color={theme.accent} />
                        : <Text style={s.importRowAction}>Import →</Text>
                      }
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity
                style={{ alignItems: 'center', paddingVertical: 12 }}
                onPress={() => setImportPickerModal(false)}
                disabled={!!importingListId || linkingGuestList}
              >
                <Text style={s.importCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Plan my event" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.hero}>
          <Text style={s.heroIcon}>✦</Text>
          <Text style={s.heroTitle}>Your event agent is ready</Text>
          <Text style={s.heroSub}>
            Answer a few questions and your agent will build a complete plan with budget breakdown and provider matches.
          </Text>
        </View>
        <View style={s.form}>
          <View style={s.addressBox}>
            <Text style={s.addressLabel}>Event name</Text>
            <TextInput
              style={s.modalInput}
              placeholder="e.g. Aanya's 5th Birthday, Sharma-Verma Wedding"
              placeholderTextColor={theme.textSecondary}
              value={formData.eventName}
              onChangeText={v => update('eventName', v)}
              onBlur={() => { if (linkedEventId) renameEvent(linkedEventId, resolveEventName()); }}
            />
            <Text style={s.addressHint}>Leave blank and we'll name it for you.</Text>
          </View>

          <SectionTitle title="What kind of event?" />
          <View style={s.eventTypeGrid}>
            {EVENT_TYPES.map(type => (
              <TouchableOpacity
                key={type.id}
                style={[s.eventTypeCard, formData.eventType === type.id && s.eventTypeCardActive]}
                onPress={() => update('eventType', type.id)}
              >
                <Text style={s.eventTypeIcon}>{type.icon}</Text>
                <Text style={[s.eventTypeLabel, formData.eventType === type.id && s.eventTypeLabelActive]}>
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {!!formData.eventType && !!CATEGORY_BY_ID[formData.eventType]?.subs?.length && (
            <View>
              <Text style={s.addressLabel}>Specifically, which one?</Text>
              <View style={s.chipRow}>
                {CATEGORY_BY_ID[formData.eventType].subs.map(sub => (
                  <SelectChip
                    key={sub.id}
                    label={sub.label}
                    selected={formData.subEvent === sub.id}
                    onPress={() => update('subEvent', formData.subEvent === sub.id ? null : sub.id)}
                  />
                ))}
              </View>
            </View>
          )}

          <SectionTitle title="When is the event?" />
          <TouchableOpacity style={s.datePicker} onPress={() => setShowDatePicker(!showDatePicker)}>
            <Text style={s.dateIcon}>📅</Text>
            <Text style={s.dateText}>
              {formData.eventDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
          </TouchableOpacity>
          {showDatePicker && (
            <View style={s.customDatePicker}>
              <View style={s.datePickerHeader}>
                <Text style={s.datePickerTitle}>Select date</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={s.datePickerClose}>Done</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.datePickerRow}>
                {DAYS_AHEAD.slice(0, 60).map((date, i) => {
                  const isSelected = formData.eventDate.toDateString() === date.toDateString();
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[s.dateOption, isSelected && s.dateOptionActive]}
                      onPress={() => { update('eventDate', date); setShowDatePicker(false); }}
                    >
                      <Text style={[s.dateOptionDay, isSelected && s.dateOptionTextActive]}>
                        {date.toLocaleDateString('en-IN', { weekday: 'short' })}
                      </Text>
                      <Text style={[s.dateOptionNum, isSelected && s.dateOptionTextActive]}>
                        {date.getDate()}
                      </Text>
                      <Text style={[s.dateOptionMonth, isSelected && s.dateOptionTextActive]}>
                        {date.toLocaleDateString('en-IN', { month: 'short' })}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <SectionTitle title="Day or night event?" />
          <View style={s.chipRow}>
            <SelectChip label="☀️ Daytime" selected={formData.timeOfDay === 'day'} onPress={() => update('timeOfDay', 'day')} />
            <SelectChip label="🌙 Evening / Night" selected={formData.timeOfDay === 'night'} onPress={() => update('timeOfDay', 'night')} />
          </View>

          <SectionTitle title="Where will it be held?" />
          <View style={s.chipRow}>
            <SelectChip label="🏠 At home" selected={formData.location === 'home'} onPress={() => update('location', 'home')} />
            <SelectChip label="🏛️ At a venue" selected={formData.location === 'venue'} onPress={() => update('location', 'venue')} />
          </View>

          <SectionTitle title="What kind of venue?" />
          <View style={s.chipRow}>
            {VENUE_KINDS.map(vk => (
              <SelectChip key={vk.id} label={vk.label} selected={formData.venueKind === vk.id} onPress={() => update('venueKind', vk.id)} />
            ))}
          </View>

          <SectionTitle title="Any restrictions?" />
          <View style={s.chipRow}>
            <SelectChip label="🚫 Dry event (no alcohol)" selected={formData.isDryEvent} onPress={() => update('isDryEvent', !formData.isDryEvent)} />
            <SelectChip label="🥦 Vegetarian only" selected={formData.isVegOnly} onPress={() => update('isVegOnly', !formData.isVegOnly)} />
          </View>

          {formData.location === 'home' && (
            <View style={s.addressBox}>
              <Text style={s.addressLabel}>Home address</Text>
              <LocationAutocomplete
                value={formData.homeAddress}
                onChangeText={v => update('homeAddress', v)}
                onSelect={address => update('homeAddress', address)}
                placeholder="Search for your address"
              />
              {!!formData.homeAddress.trim() && (
                <TouchableOpacity onPress={() => Linking.openURL(googleMapsUrl(formData.homeAddress))}>
                  <Text style={s.addressMapLink}>📍 Preview on Google Maps ›</Text>
                </TouchableOpacity>
              )}
              <Text style={s.addressHint}>This gets added automatically as the venue on your invite.</Text>
            </View>
          )}

          {formData.location === 'venue' && !!formData.eventType && (
            <View>
              <Text style={s.addressLabel}>Venue type</Text>
              <View style={s.chipRow}>
                {getVenueTypesFor(formData.subEvent, formData.eventType).map(vt => (
                  <SelectChip key={vt} label={vt} selected={formData.venueType === vt} onPress={() => update('venueType', vt)} />
                ))}
              </View>
              {!!formData.venueType && !!formData.city && (
                <TouchableOpacity
                  style={s.browseVenuesBtn}
                  onPress={async () => navigation.navigate('Search', { presetCategory: formData.venueType, presetCity: formData.city, savedPlanId: await ensurePlanSaved() })}
                >
                  <Text style={s.browseVenuesBtnText}>Browse {formData.venueType} in {formData.city} →</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <SectionTitle title="Which city?" />
          <View style={s.chipRow}>
            {CITY_GROUPS.map(group => (
              <SelectChip
                key={group.id}
                label={group.label}
                selected={formData.cityGroup === group.id}
                onPress={() => {
                  update('cityGroup', group.id);
                  if (group.cities.length === 1) update('city', group.cities[0]);
                }}
              />
            ))}
          </View>
          {(() => {
            const group = CITY_GROUPS.find(g => g.id === formData.cityGroup);
            if (!group || group.cities.length <= 1) return null;
            return (
              <View style={[s.chipRow, { marginTop: 8 }]}>
                {group.cities.map(city => (
                  <SelectChip key={city} label={city} selected={formData.city === city} onPress={() => update('city', city)} />
                ))}
              </View>
            );
          })()}

          <SectionTitle title="How many guests?" />
          <View style={s.chipRow}>
            {GUEST_RANGES.map(range => (
              <SelectChip
                key={range}
                label={range}
                selected={!formData.exactGuests && formData.guestRange === range}
                onPress={() => { update('guestRange', range); update('exactGuests', null); }}
              />
            ))}
          </View>
          <View style={s.exactGuestsRow}>
            <Text style={s.exactGuestsLabel}>Or exact number:</Text>
            <TextInput
              style={s.exactGuestsInput}
              placeholder="e.g. 180"
              placeholderTextColor={theme.textSecondary}
              keyboardType="number-pad"
              value={formData.exactGuests ? String(formData.exactGuests) : ''}
              onChangeText={v => update('exactGuests', v ? parseInt(v, 10) || null : null)}
            />
          </View>

          <SectionTitle
            title="What is your budget?"
            subtitle={`Suggested: ₹${estimateBudget(formData).toLocaleString()} based on your guests & choices`}
          />
          <View style={s.chipRow}>
            {BUDGET_RANGES.map(range => (
              <SelectChip key={range} label={range} selected={formData.budgetRange === range} onPress={() => update('budgetRange', range)} />
            ))}
          </View>
          <TouchableOpacity onPress={() => update('budgetRange', suggestBudgetRange(formData))}>
            <Text style={s.useSuggestedText}>Use suggested budget</Text>
          </TouchableOpacity>

          <SectionTitle title="What do you need?" subtitle="Select all that apply" />
          <View style={s.togglesBox}>
            {getServiceOptionsFor(formData.subEvent, formData.eventType).map(serviceId => {
              const svc = SERVICE_OPTIONS[serviceId];
              return (
                <ToggleRow
                  key={serviceId}
                  label={`${svc.icon} ${svc.label}`}
                  value={formData[svc.key]}
                  onToggle={() => updateService(serviceId, !formData[svc.key])}
                />
              );
            })}
          </View>

          {formData.needsCatering && (
            <>
              <SectionTitle title="Food preferences" />
              <View style={s.togglesBox}>
                <ToggleRow label="🍗 Non-vegetarian" value={formData.isNonVeg} onToggle={() => update('isNonVeg', !formData.isNonVeg)} />
                <ToggleRow label="🍷 Alcohol / Bar" value={formData.hasAlcohol} onToggle={() => update('hasAlcohol', !formData.hasAlcohol)} />
              </View>
              <SectionTitle title="Cuisine preferences" subtitle="Select all you want" />
              <View style={s.chipRow}>
                {CUISINES.map(cuisine => (
                  <SelectChip key={cuisine} label={cuisine} selected={formData.cuisines.includes(cuisine)} onPress={() => toggleCuisine(cuisine)} />
                ))}
              </View>
            </>
          )}

          <TouchableOpacity
            style={[s.generateBtn, loading && { opacity: 0.7 }]}
            onPress={handleGeneratePlan}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={theme.btnPrimaryText} />
              : <Text style={s.generateBtnText}>✦ Generate my event plan</Text>
            }
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.bg, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backIcon: { fontSize: 22, color: theme.text, width: 32 },
    headerTitle: { fontSize: 16, fontWeight: '600', color: theme.text },
    calendarTabBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.bgSecondary, borderWidth: 0.5, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    calendarTabBtnText: { fontSize: 15 },

    hero: { backgroundColor: theme.text, margin: 16, borderRadius: 22, padding: 22, alignItems: 'center' },
    heroIcon: { fontSize: 32, color: theme.accent, marginBottom: 10 },
    heroTitle: { fontSize: 19, fontWeight: '700', color: theme.bg, marginBottom: 6, textAlign: 'center' },
    heroSub: { fontSize: 13, color: theme.textTertiary, textAlign: 'center', lineHeight: 19 },

    form: { paddingHorizontal: 16 },
    sectionTitle: { marginTop: 22, marginBottom: 10 },
    sectionTitleText: { fontSize: 15, fontWeight: '700', color: theme.text },
    sectionSubText: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },

    eventTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
    eventTypeCard: { width: '22%', backgroundColor: theme.cardBg, borderRadius: 14, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: theme.border },
    eventTypeCardActive: { borderColor: theme.text, borderWidth: 1.5, backgroundColor: theme.bg },
    eventTypeIcon: { fontSize: 22, marginBottom: 4 },
    eventTypeLabel: { fontSize: 10, color: theme.textSecondary, textAlign: 'center', fontWeight: '500' },
    eventTypeLabelActive: { color: theme.text, fontWeight: '700' },

    datePicker: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.cardBg, borderRadius: 14, padding: 14, borderWidth: 0.5, borderColor: theme.border, gap: 10 },
    dateIcon: { fontSize: 18 },
    dateText: { fontSize: 14, color: theme.text },
    customDatePicker: { backgroundColor: theme.cardBg, borderRadius: 16, marginTop: 8, borderWidth: 0.5, borderColor: theme.border, overflow: 'hidden' },
    datePickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    datePickerTitle: { fontSize: 14, fontWeight: '600', color: theme.text },
    datePickerClose: { fontSize: 14, color: theme.accent, fontWeight: '600' },
    datePickerRow: { paddingVertical: 12, paddingHorizontal: 8 },
    dateOption: { alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, marginHorizontal: 3, minWidth: 52 },
    dateOptionActive: { backgroundColor: theme.text },
    dateOptionDay: { fontSize: 10, color: theme.textSecondary, marginBottom: 4 },
    dateOptionNum: { fontSize: 18, fontWeight: '700', color: theme.text },
    dateOptionMonth: { fontSize: 10, color: theme.textSecondary, marginTop: 2 },
    dateOptionTextActive: { color: theme.bg },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 0.5, borderColor: theme.border, backgroundColor: theme.cardBg },
    chipActive: { backgroundColor: theme.text, borderColor: theme.text },
    chipText: { fontSize: 13, color: theme.textSecondary },
    chipTextActive: { color: theme.bg, fontWeight: '600' },

    input: {
      backgroundColor: theme.cardBg, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 14, color: theme.text, borderWidth: 0.5, borderColor: theme.border,
    },
    addressBox: { marginTop: 8, gap: 8 },
    addressLabel: { fontSize: 12.5, fontWeight: '600', color: theme.textSecondary, marginBottom: 2 },
    addressMapLink: { fontSize: 12.5, fontWeight: '700', color: theme.accent },
    addressHint: { fontSize: 11.5, color: theme.textSecondary, lineHeight: 16 },
    browseVenuesBtn: { marginTop: 10, alignSelf: 'flex-start' },
    browseVenuesBtnText: { fontSize: 12.5, fontWeight: '700', color: theme.accent },
    exactGuestsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
    exactGuestsLabel: { fontSize: 12.5, color: theme.textSecondary },
    exactGuestsInput: {
      flex: 1, backgroundColor: theme.cardBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
      fontSize: 13, color: theme.text, borderWidth: 0.5, borderColor: theme.border, maxWidth: 100,
    },
    useSuggestedText: { fontSize: 12, fontWeight: '600', color: theme.accent, marginTop: 8 },
    togglesBox: { backgroundColor: theme.cardBg, borderRadius: 16, overflow: 'hidden', borderWidth: 0.5, borderColor: theme.border },
    toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    toggleLabel: { fontSize: 14, color: theme.text },
    toggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: theme.border, justifyContent: 'center', paddingHorizontal: 2 },
    toggleActive: { backgroundColor: theme.text },
    toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: theme.bg },
    toggleThumbActive: { transform: [{ translateX: 20 }] },

    generateBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
    generateBtnText: { color: theme.btnPrimaryText, fontSize: 16, fontWeight: '700' },

    planHero: { backgroundColor: theme.text, margin: 16, borderRadius: 22, padding: 22, alignItems: 'center' },
    planHeroIcon: { fontSize: 42, marginBottom: 8 },
    planHeroTitle: { fontSize: 21, fontWeight: '700', color: theme.bg, marginBottom: 4 },
    planHeroSub: { fontSize: 13, color: theme.textTertiary, textAlign: 'center', marginBottom: 16 },
    planStats: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 12, gap: 16 },
    planStat: { alignItems: 'center' },
    planStatValue: { fontSize: 14, fontWeight: '700', color: theme.bg },
    planStatEditHint: { fontSize: 11, color: theme.accent },
    planStatLabel: { fontSize: 11, color: theme.textTertiary, marginTop: 2 },
    planStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.15)' },

    modalOverlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 },
    modalCard: { backgroundColor: theme.cardBg, borderRadius: 20, padding: 24, gap: 4 },
    modalTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
    modalSub: { fontSize: 12.5, color: theme.textSecondary, marginBottom: 10 },
    modalInput: {
      borderWidth: 1, borderColor: theme.border, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text,
    },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    modalCancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: theme.border, alignItems: 'center' },
    modalCancelBtnText: { fontSize: 14, fontWeight: '600', color: theme.text },
    modalSaveBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: theme.btnPrimary, alignItems: 'center' },
    modalSaveBtnText: { fontSize: 14, fontWeight: '700', color: theme.btnPrimaryText },

    importFreshBtn: {
      alignItems: 'center', paddingVertical: 13, borderRadius: 14, marginTop: 6,
      borderWidth: 1, borderColor: theme.accent, borderStyle: 'dashed',
    },
    importFreshBtnText: { fontSize: 14, fontWeight: '700', color: theme.accent },
    importRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 12, paddingHorizontal: 4,
      borderBottomWidth: 0.5, borderBottomColor: theme.border,
    },
    importRowName: { fontSize: 14, fontWeight: '700', color: theme.text },
    importRowMeta: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
    importRowAction: { fontSize: 12.5, fontWeight: '700', color: theme.accent },
    importCancelText: { fontSize: 14, fontWeight: '600', color: theme.textSecondary },

    planSection: { backgroundColor: theme.cardBg, marginHorizontal: 16, borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 0.5, borderColor: theme.border },
    planSectionTitle: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 12 },
    breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    breakdownLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    breakdownIcon: { fontSize: 20 },
    breakdownCategory: { fontSize: 14, fontWeight: '600', color: theme.text },
    breakdownNote: { fontSize: 11, color: theme.textSecondary, marginTop: 2 },
    breakdownAmount: { fontSize: 14, fontWeight: '700', color: theme.text },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: theme.border },
    totalLabel: { fontSize: 16, fontWeight: '700', color: theme.text },
    totalAmount: { fontSize: 18, fontWeight: '700', color: theme.accent },

    providerCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: theme.border, gap: 10 },
    providerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
    providerAvatarText: { fontSize: 18, color: '#fff', fontWeight: '700' },
    providerInfo: { flex: 1 },
    providerName: { fontSize: 14, fontWeight: '600', color: theme.text },
    providerCategory: { fontSize: 12, color: theme.textSecondary, marginTop: 1 },
    providerRating: { fontSize: 11, color: theme.textSecondary, marginTop: 2 },
    providerArrow: { fontSize: 20, color: theme.textTertiary },

    tipRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'flex-start' },
    tipDot: { fontSize: 16, color: theme.accent, lineHeight: 20 },
    tipText: { fontSize: 13, color: theme.textSecondary, lineHeight: 20, flex: 1 },
    tipDots: { flexDirection: 'row', gap: 5, justifyContent: 'center', marginTop: 6 },
    tipDotIndicator: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: theme.border },
    tipDotIndicatorActive: { backgroundColor: theme.accent, width: 14 },

    planActions: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginBottom: 12 },
    saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: theme.cardBg, borderWidth: 1, borderColor: theme.text, alignItems: 'center' },
    saveBtnText: { fontSize: 14, fontWeight: '700', color: theme.text },
    replanBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: theme.border, alignItems: 'center' },
    replanBtnText: { fontSize: 14, fontWeight: '600', color: theme.text },
    quickTabRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 10 },
    quickTab: {
      flex: 1, paddingVertical: 12, borderRadius: 14,
      borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', gap: 4,
    },
    quickTabIcon: { fontSize: 18 },
    quickTabLabel: { fontSize: 11.5, fontWeight: '700', color: theme.text, textAlign: 'center' },
    bookAllBtnText: { fontSize: 14, fontWeight: '600', color: theme.btnPrimaryText },
  });
}