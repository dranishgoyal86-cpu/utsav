import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { showAlert } from '../../helpers';
import SlotField, { slotApplies, slotFilled } from '../../components/SlotField';
import AppHeader from '../../components/AppHeader';
import { CREAM } from '../../lib/desktopTheme';

const DESKTOP_BREAKPOINT = 768;

// "the planning screen should come after the event details and should show
// all the possible options pertaining to that event then execution part"
// (Anish, Sept 16) — Planning (EventScope.js) needs venue_type/guest_count/
// budget_total/theme already known to resolve the full checklist, so those
// four moved from soft prompts into blocking slots here, alongside the
// original sub_type_slug/event_date/city. dietary_restrictions stays a
// soft prompt on purpose — slotFilled() always treats it as answered (a
// boolean's default "no restrictions" is a real answer, not a missing
// one), so it could never block here even if listed. venue_type is safe to
// block on: its "Not decided yet" chip is itself a real, always-available
// answer (SlotField.js's VENUE_TYPE_OPTIONS), so this can never be a dead
// end for a host who genuinely hasn't chosen a venue yet.
//
// location joined the blocking list Sept 18 — "first time it only asks
// where is the event but doesn't ask address" (Anish): previously it was a
// soft prompt (PlanView.js only), asked whenever the host happened to
// revisit that screen, sometimes much later. Placed right after
// venue_type since LocationField's own behavior depends on it (a booked
// marketplace venue shows "Browse venues" instead of the address search).
// Confirmed via a full-codebase search that SlotPrompt.js is the ONLY
// place any of these slots are navigated to, so widening this list is
// safe for every pre-existing event too (they never revisit this screen).
const BLOCKING_SLOTS = ['sub_type_slug', 'event_date', 'city', 'venue_type', 'location', 'guest_count', 'budget_total', 'theme'];

export default function SlotPrompt({ route, navigation }) {
  const { eventId, recap } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // "app should pick all possible details and autofill" (Anish, Sept 16) —
  // PlanHero.js's parse-event-prompt call may have already filled several
  // of these slots from the host's own free-text description before this
  // screen ever loaded; recap (a list of "Label: value" strings, passed as
  // a navigation param, never persisted) surfaces exactly what got picked
  // up so a wrong guess is visible and one tap away from fixing, without
  // blocking on a confirm step. Dismissible, shown only once per visit.
  const [recapVisible, setRecapVisible] = useState(!!(recap && recap.length > 0));

  // Re-fetches every time this screen gains focus, not just on first
  // mount — needed because SlotField's "location" step (LocationField)
  // can send the host to VenuePicker.js and back (e.g. the "I'll decide
  // later" button there resets venue_type/venue_id in the database). A
  // plain mount-only fetch left this screen showing stale local state on
  // return, so it kept re-rendering the same "Browse venues" step forever
  // instead of noticing venue_type was cleared and re-asking that question.
  useFocusEffect(
    useCallback(() => { fetchEvent(); }, [eventId])
  );

  async function fetchEvent() {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('events').select('*').eq('id', eventId).single();
      if (error) throw error;
      setEvent(data);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  const currentSlot = event ? BLOCKING_SLOTS.find(slot => slotApplies(slot, event) && !slotFilled(slot, event)) : null;

  // Both blocking slots filled (or not applicable to this event type) —
  // move on. Navigating from an effect, not during render.
  // planning_stage (see supabase/migrations/20260916000000_planning_
  // execution_split.sql) decides where: a brand-new event defaults to
  // 'planning' and lands on EventScope.js first (decide what's included,
  // no prices/vendors yet); an event that predates that column, or one
  // that's already moved past planning, goes straight to PlanView.js same
  // as always.
  useEffect(() => {
    // Sept 18: "it goes to plan the event screen. But it should go to
    // event details so that whatever event details are left should be
    // filled" (Anish) — every event now lands on EventDetailsScreen.js
    // right after the blocking-slot wizard above, regardless of
    // planning_stage. EventDetailsScreen's own "Save the details" button
    // carries the host on to EventScope from there (see that screen), so
    // the old planning_stage branch (EventScope vs PlanView) simply moves
    // one screen later instead of happening here.
    if (!loading && event && !currentSlot) {
      navigation.replace('EventDetailsScreen', { eventId });
    }
  }, [loading, event, currentSlot, eventId]);

  async function saveField(patch) {
    setSaving(true);
    try {
      const { data, error } = await supabase.from('events').update(patch).eq('id', eventId).select().single();
      if (error) throw error;
      setEvent(data);

      // saved_plans.event_date/city are what PlanScreen.js's "YOUR PLANS"
      // cards and sort options actually read, not a live join to events —
      // event_date and city are both set here first (they're blocking
      // slots), so without this the card shows "No date set" from the very
      // first save, before the host ever reaches PlanView.
      const planMirror = {};
      if ('event_date' in patch) planMirror.event_date = patch.event_date;
      if ('city' in patch) planMirror.city = patch.city;
      if (Object.keys(planMirror).length > 0) {
        await supabase.from('saved_plans').update(planMirror).eq('event_id', eventId);
      }
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading || !event || !currentSlot) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.container, isDesktopWeb && { backgroundColor: CREAM }]}>
      <AppHeader title={event.working_title || 'New event'} theme={theme} navigation={navigation} />
      <ScrollView contentContainerStyle={isDesktopWeb ? ds.centerCol : s.scroll} keyboardShouldPersistTaps="handled">
        {recapVisible && (
          <View style={s.recapBox}>
            <View style={{ flex: 1 }}>
              <Text style={s.recapTitle}>✨ Picked up from what you typed</Text>
              <Text style={s.recapText}>{recap.join(' · ')}</Text>
              <Text style={s.recapHint}>Anything wrong? Just answer that question normally below to fix it.</Text>
            </View>
            <TouchableOpacity onPress={() => setRecapVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.recapClose}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        {saving ? <ActivityIndicator color={theme.accent} style={{ marginBottom: 12 }} /> : null}
        <SlotField slotKey={currentSlot} event={event} onSave={saveField} navigation={navigation} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    headerTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
    scroll: { padding: 20 },

    recapBox: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border,
      padding: 14, marginBottom: 18,
    },
    recapTitle: { fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 4 },
    recapText: { fontSize: 12.5, color: theme.textSecondary, lineHeight: 18 },
    recapHint: { fontSize: 11.5, color: theme.textTertiary, marginTop: 6 },
    recapClose: { fontSize: 15, color: theme.textTertiary, fontWeight: '700' },
  });
}

const ds = StyleSheet.create({
  centerCol: { maxWidth: 480, width: '100%', alignSelf: 'center', padding: 20, paddingTop: 40 },
});
