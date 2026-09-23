import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { showAlert } from '../../helpers';
import { useEventPlan } from '../../hooks/useEventPlan';
import { eventTypeName } from '../../lib/eventTypeNames';
import SlotField, { slotApplies } from '../../components/SlotField';
import AppHeader from '../../components/AppHeader';
import EventTabStrip from '../../components/EventTabStrip';
import DesktopEventShell from '../../components/desktop/DesktopEventShell';
import { MAROON, CARD, LINE, TEXT, MUTED } from '../../lib/desktopTheme';
import TextPromptModal from '../../components/TextPromptModal';
import { detectGuestFacingChange, notifyGuestsOfEventChange } from '../../lib/eventGuestNotifications';

const DESKTOP_BREAKPOINT = 768;

// New "Event details" tab — Sept 16 hierarchy request: "1. event details,
// then 2. event planning ... 3. executing booking stage" as three peer,
// always-reachable tabs (see components/EventTabStrip.js), not the old
// one-way SlotPrompt → EventScope → PlanView chain.
//
// This is the exact "Event details" block that used to be squeezed inline
// at the top of PlanView.js — same EDITABLE_SLOTS list, same saveField +
// guest-facing-change-notify logic, moved here verbatim (PlanView.js no
// longer renders any of this, so event-detail editing exists in exactly
// one place). One deliberate simplification versus the old inline version:
// there, it had its own open/closed + read-only/edit-mode toggle because it
// was competing for space with a long P1-P5 item list on the same screen.
// Here it has a full dedicated screen, so every field is just always shown,
// always editable, still autosaving individually on change (no Save
// button needed) — one less piece of state to explain, same underlying
// behavior.
// "remove which city and where it will held, just keep address of venue"
// (Anish, Sept 16) — 'city' and 'venue_type' dropped from this screen's
// own field list. Both are still asked once during first-time event setup
// (SlotPrompt.js's BLOCKING_SLOTS, untouched) — this only stops Event
// details from asking them again on every revisit. 'location' (now a
// structured house no./sector/road/landmark/pincode form, see
// SlotField.js's LocationField) stays.
const EDITABLE_SLOTS = ['sub_type_slug', 'birthday_person', 'event_date', 'event_time', 'location', 'guest_count', 'theme', 'dietary_restrictions', 'budget_total'];

export default function EventDetailsScreen({ route, navigation }) {
  const { eventId } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const { event: rawEvent, venue, loading, error, refresh } = useEventPlan(eventId);

  // useEventPlan's own mount effect already covers the very first load —
  // this only re-syncs on every LATER focus, e.g. returning from
  // VenuePicker.js's "I'll decide later" (which writes venue_type/venue_id
  // straight to the events row, bypassing this screen's saveField/
  // confirmedPatch overlay entirely). Without this, rawEvent stayed stale
  // after that round trip and the "Browse venues →" button below kept
  // re-rendering forever — same root cause as the SlotPrompt.js fix.
  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) { isFirstFocus.current = false; return; }
      refresh();
    }, [refresh])
  );

  // Same optimistic-overlay pattern PlanView.js's saveField used — a save
  // highlights immediately instead of waiting for the round trip.
  //
  // Sept 18: split into two overlays after Anish reported chips (dry
  // event / veg only, etc.) "get unselected on their own, and then they
  // again take time to get selected". Root cause — pendingPatch used to
  // get cleared only once useEventPlan's refresh() came back, and refresh()
  // is a DOZEN-PLUS sequential queries (events, venue, invitees, functions,
  // sub_events, bookings, services, providers, static rule tables — all
  // needed by PlanView/EventScope's budget math, none of it read by this
  // screen). Any slow beat or hiccup in that whole chain left rawEvent
  // stale right when pendingPatch got cleared, so the just-tapped chip
  // visibly reverted until the next successful reload landed. confirmedPatch
  // now takes over the instant this screen's own single-row write (below)
  // succeeds — never waiting on that unrelated chain — so a tap settles
  // immediately and only ever moves forward, never back.
  const [pendingPatch, setPendingPatch] = useState({});
  const [confirmedPatch, setConfirmedPatch] = useState({});
  const event = useMemo(
    () => (rawEvent ? { ...rawEvent, ...confirmedPatch, ...pendingPatch } : rawEvent),
    [rawEvent, confirmedPatch, pendingPatch]
  );
  const [saving, setSaving] = useState(false);

  // Same two small lookups PlanView.js/EventScope.js each already make for
  // DesktopEventShell's sidebar footer/badge — real values, not the
  // shell's own placeholders.
  const [currentUserName, setCurrentUserName] = useState('');
  const [guestCount, setGuestCount] = useState(0);
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.from('users').select('name').eq('id', session.user.id).maybeSingle();
      if (data?.name) setCurrentUserName(data.name);
    })();
  }, []);
  useEffect(() => {
    if (!eventId) return;
    supabase.from('event_invitees').select('id', { count: 'exact', head: true }).eq('event_id', eventId)
      .then(({ count }) => setGuestCount(count || 0));
  }, [eventId]);

  // Host-confirmed guest notification for a date/time/venue change — ported
  // as-is from PlanView.js's saveField/confirmNotifyGuests.
  const [guestNotifyPrompt, setGuestNotifyPrompt] = useState(null); // { changedSummary } | null

  async function saveField(patch) {
    const oldEvent = event;
    setPendingPatch(prev => ({ ...prev, ...patch }));
    setSaving(true);
    try {
      const { error: err } = await supabase.from('events').update(patch).eq('id', eventId);
      if (err) throw err;

      const planMirror = {};
      if ('event_date' in patch) planMirror.event_date = patch.event_date;
      if ('budget_total' in patch) planMirror.total_budget = patch.budget_total;
      if (Object.keys(planMirror).length > 0) {
        await supabase.from('saved_plans').update(planMirror).eq('event_id', eventId);
      }

      // Confirmed off this screen's own write above (already known to have
      // succeeded) instead of waiting on useEventPlan's full plan reload —
      // see the confirmedPatch comment above for why.
      setConfirmedPatch(prev => ({ ...prev, ...patch }));

      // Fired, not awaited: venue/estimate-affecting fields (guest_count,
      // budget_total, theme, location) still need useEventPlan's fuller
      // event/venue resync for when the host moves on to EventScope/
      // PlanView next, but this screen's own chips/fields no longer wait on
      // it to settle.
      refresh().catch(() => {});

      if (oldEvent?.invites_sent_at) {
        const changedSummary = detectGuestFacingChange(oldEvent, patch);
        if (changedSummary) setGuestNotifyPrompt({ changedSummary });
      }
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
      setPendingPatch({});
    }
  }

  async function confirmNotifyGuests(message) {
    const summary = guestNotifyPrompt?.changedSummary;
    setGuestNotifyPrompt(null);
    try {
      const result = await notifyGuestsOfEventChange(event, message || summary);
      const parts = [];
      if (result.notifiedCount) parts.push(`${result.notifiedCount} notified in-app`);
      if (result.emailedCount) parts.push(`${result.emailedCount} emailed`);
      let msg = parts.length ? parts.join(', ') + '.' : 'No guests to notify yet.';
      if (result.unreachable.length) {
        msg += `\n\n${result.unreachable.length} guest${result.unreachable.length === 1 ? '' : 's'} can't be auto-notified (no account or email on file) — message them yourself: ${result.unreachable.map(g => g.name).join(', ')}.`;
      }
      showAlert('Guests notified', msg);
    } catch (err) {
      showAlert('Error', err.message);
    }
  }

  if (loading && !event) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (error || !event) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centerBox}>
          <Text style={s.errorText}>{error || "This event couldn't be found."}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const applicableEditableSlots = EDITABLE_SLOTS.filter(slot => slotApplies(slot, event));

  const body = (
    <>
      <Text style={s.intro}>Every detail about this event, in one place — change anything below any time; it saves as you go.</Text>
      {saving && <ActivityIndicator color={theme.accent} style={{ marginBottom: 14 }} />}
      {applicableEditableSlots.map(slot => (
        <View key={slot} style={s.fieldWrap}>
          <SlotField slotKey={slot} event={event} onSave={saveField} navigation={navigation} />
        </View>
      ))}
      {/* "saving event details move to plan the event" (Anish, Sept 16) —
          every field above still autosaves the instant it changes (no
          batch Save to hook into), so this is a separate, explicit "I'm
          done here" step rather than a real save action. navigation.replace
          (not .navigate), same lateral-move convention EventTabStrip's own
          tab taps already use, so the back button behaves identically
          either way you got to Plan the event. */}
      <TouchableOpacity
        style={s.continueBtn}
        onPress={() => navigation.replace('EventScope', { eventId })}
      >
        <Text style={s.continueBtnText}>Save the details</Text>
      </TouchableOpacity>
      <View style={{ height: 60 }} />
    </>
  );

  const guestNotifyModal = (
    <TextPromptModal
      visible={!!guestNotifyPrompt}
      title="Notify guests about this?"
      message={guestNotifyPrompt ? `You changed ${guestNotifyPrompt.changedSummary}. Guests already invited to this event can be told.` : ''}
      placeholder="Optional note to include, e.g. why it moved"
      defaultValue=""
      required={false}
      confirmLabel="Notify guests"
      cancelLabel="Skip"
      onConfirm={confirmNotifyGuests}
      onCancel={() => setGuestNotifyPrompt(null)}
    />
  );

  if (isDesktopWeb) {
    return (
      <DesktopEventShell activeItem="details" event={event} guestCount={guestCount} currentUserName={currentUserName} navigation={navigation}>
        <Text style={ds.title}>{event.working_title || eventTypeName(event.event_type_slug)}</Text>
        <Text style={ds.subtitle}>Event details</Text>
        <View style={ds.body}>{body}</View>
        {guestNotifyModal}
      </DesktopEventShell>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader
        title={event.working_title || eventTypeName(event.event_type_slug)}
        theme={theme}
        navigation={navigation}
        onBack={() => navigation.goBack()}
        eventId={event.id}
      />
      <EventTabStrip active="details" eventId={eventId} navigation={navigation} theme={theme} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {body}
      </ScrollView>
      {guestNotifyModal}
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    scroll: { padding: 20 },
    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    errorText: { fontSize: 14, color: theme.textSecondary, textAlign: 'center' },
    intro: { fontSize: 13, color: theme.textSecondary, lineHeight: 19, marginBottom: 18 },
    fieldWrap: { marginBottom: 18 },
    continueBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
    continueBtnText: { fontSize: 15, fontWeight: '700', color: theme.btnPrimaryText },
  });
}

const ds = StyleSheet.create({
  title: { fontFamily: 'Fraunces-SemiBold', fontSize: 24, color: TEXT, marginTop: 2 },
  subtitle: { fontSize: 13, fontWeight: '700', color: MAROON, marginTop: 4, marginBottom: 20, textTransform: 'uppercase', letterSpacing: 0.5 },
  body: { maxWidth: 640 },
});
