import { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import AppHeader from '../../components/AppHeader';
import MenuLibrary from '../../components/MenuLibrary';
import { showAlert } from '../../helpers';
import { useTour } from '../../hooks/useTour';
import CoachMarkTour from '../../components/CoachMarkTour';
import { useEventPlan } from '../../hooks/useEventPlan';
import { estimateMenuSpread } from '../../lib/priceEngine';

// "add more tutorials in the profile for invites and other planning
// options" — targets registered from inside MenuLibrary.js itself (see
// that file), since it's this screen's whole body; this is just the
// tour-state owner, same split EventTodo.js/GuestList.js already use for
// their own tours.
const MENUPLANNER_TOUR_STEPS = [
  {
    key: 'foodtype',
    target: 'menuplanner-foodtype',
    title: 'Start with food type',
    description: 'Pick exactly one — Pure Veg, Non-Veg, Jain, and so on. This filters every category below.',
  },
  {
    key: 'cuisine',
    target: 'menuplanner-cuisine',
    title: 'Mix in cuisines',
    description: 'Pick as many cuisines as you like, or choose Multicuisine to see every dish in every category, regardless of cuisine.',
  },
];

// Birthday Event Improvement plan — menu planner rebuild.
// Was an inline collapsible section on PlanView.js (Piece 5, course-size
// model). Now its own destination, reached via a header icon on PlanView
// next to Guests — the request was explicit that this needed a real menu
// icon "in top right corner of the plan screen, next to guest list", which
// only makes sense as a navigation target, matching how the guests icon
// navigates to GuestList.
//
// Registered in App.js as <Stack.Screen name="MenuPlanner" .../> right
// next to GuestList's own registration.
export default function MenuPlanner({ route, navigation }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { event: routeEvent, forceTour } = route.params || {};
  const eventId = routeEvent?.id;

  const [event, setEvent] = useState(routeEvent || null);
  const [selections, setSelections] = useState([]);
  const [loading, setLoading] = useState(true);

  // The tour's targets (food type/cuisine rows) only exist once
  // event.menu_type === 'customized' — before that, MenuLibrary.js shows
  // the "who's building the menu" choice instead. Gating on that here
  // (rather than firing on mount like most other tours) avoids the tour
  // silently marking itself "seen" via CoachMarkTour's unmeasurable-target
  // skip, before the host ever actually saw it.
  const menuTour = useTour('menuplanner_intro');
  useEffect(() => {
    if (event?.menu_type !== 'customized') return;
    if (forceTour === 'menuplanner_intro') {
      menuTour.forceRestart();
    } else if (menuTour.checked) {
      menuTour.startTour();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuTour.checked, forceTour, event?.menu_type]);

  // "the event planner should modify its content... as per the budget of
  // the host" — reuses useEventPlan's own allocation math (same source
  // PlanView.js's budget card already trusts) rather than recomputing
  // budget logic here a second time. This is a second, independent fetch
  // pipeline alongside this screen's own loadEvent/loadSelections below —
  // an accepted overhead for now, since MenuPlanner was deliberately built
  // self-contained and duplicating just the read-only allocation call is
  // simpler than threading it through from PlanView.js's navigation.
  const { allocation, loading: allocationLoading } = useEventPlan(eventId);
  // .allocated (not .cost) — the amount the budget waterfall actually set
  // aside for catering after higher-priority items, which is what "your
  // budget suggests for food" means; .cost is catering's raw estimated
  // price regardless of budget, a different (and less relevant) number.
  const cateringAllocated = (allocation?.lines || [])
    .filter(l => l.category_slug === 'catering')
    .reduce((sum, l) => sum + l.allocated, 0);

  const menuEstimate = useMemo(() => {
    const dishCount = selections.length;
    const liveCounterCount = selections.filter(s => s.course_category === 'live-counters').length;
    const cuisines = [...new Set(selections.map(s => s.cuisine_slug).filter(Boolean))];
    return estimateMenuSpread({
      dishCount, liveCounterCount, cuisines,
      guestCount: event?.guest_count, isVegOnly: !!event?.is_veg_only,
    });
  }, [selections, event?.guest_count, event?.is_veg_only]);

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
  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadEvent(), loadSelections()]);
      setLoading(false);
    })();
  }, [eventId]);

  async function handleSetMenuType(menuType) {
    const { error: err } = await supabase.from('events').update({ menu_type: menuType }).eq('id', eventId);
    if (err) { showAlert('Could not update that', err.message); return; }
    loadEvent();
  }

  // menu_stage — menu-only Selecting/Pricing split (see
  // claude/menu-planning-vs-execution-split.md), independent of the
  // whole-event planning_stage. Freely revisitable, same as that one.
  async function handleSetMenuStage(stage) {
    const { error: err } = await supabase.from('events').update({ menu_stage: stage }).eq('id', eventId);
    if (err) { showAlert('Could not update that', err.message); return; }
    loadEvent();
  }

  async function handleSaveProviderNote(note) {
    const { error: err } = await supabase.from('events').update({ menu_provider_note: note.trim() || null }).eq('id', eventId);
    if (err) { showAlert('Could not save that', err.message); return; }
    loadEvent();
  }

  async function handleAddDish({ name, category, cuisine, foodType, isCustom }) {
    const { error: err } = await supabase.from('event_menu_selections').insert({
      event_id: eventId,
      course_category: category,
      // cuisine_slug is NOT NULL from the original migration — '' means
      // "no specific cuisine", not a missing value.
      cuisine_slug: cuisine || '',
      dish_name: name,
      is_veg: foodType ? foodType === 'pure-veg' || foodType === 'jain' || foodType === 'vegan' : true,
      food_type: foodType || null,
      is_custom: !!isCustom,
    });
    if (err) { showAlert('Could not add that', err.message); return; }
    loadSelections();
  }

  async function handleRemoveDish(selectionId) {
    const { error: err } = await supabase.from('event_menu_selections').delete().eq('id', selectionId);
    if (err) { showAlert('Could not remove that', err.message); return; }
    loadSelections();
  }

  async function handleUpdateDetails(selectionId, patch) {
    const { error: err } = await supabase.from('event_menu_selections').update(patch).eq('id', selectionId);
    if (err) { showAlert('Could not save that', err.message); return; }
    loadSelections();
  }

  if (!event) {
    return <SafeAreaView style={s.container} />;
  }

  // "first after selecting it should make a items list for menu, and give
  // an option to see prices and quantity later" (Anish, Sept 16) - this
  // exact Selecting/Pricing split was already designed and built (see
  // claude/menu-planning-vs-execution-split.md): a brand-new event is
  // meant to default to selecting (plain list, no price/quantity fields
  // until "Done selecting" is tapped). The fallback below used to say
  // pricing instead - the wrong direction. events.menu_stage is
  // not-null-default-selecting at the database level, so this fallback
  // should rarely even matter - unless that migration
  // (20260917000000_menu_planning_execution.sql) has not been pushed to
  // the live database yet, in which case the column does not exist,
  // event.menu_stage comes back undefined for every event, and this
  // fallback decided the behavior every time.
  return (
    <SafeAreaView style={s.container}>
      <AppHeader theme={theme} navigation={navigation} onBack={() => navigation.goBack()} title="Menu" eventId={event.id} />
      <ScrollView style={s.scroll} contentContainerStyle={{ padding: 20 }}>
        {menuEstimate.available && (
          <View style={s.estimateCard}>
            <Text style={s.estimateTitle}>
              Estimated catering: ₹{menuEstimate.perPlateLow.toLocaleString('en-IN')}–₹{menuEstimate.perPlateHigh.toLocaleString('en-IN')}/plate
            </Text>
            <Text style={s.estimateTotal}>
              ≈ ₹{menuEstimate.totalLow.toLocaleString('en-IN')}–₹{menuEstimate.totalHigh.toLocaleString('en-IN')} total for {event.guest_count} guests
            </Text>
            {!allocationLoading && cateringAllocated > 0 && (
              <Text style={menuEstimate.totalLow > cateringAllocated ? s.estimateOverBudget : s.estimateWithinBudget}>
                {menuEstimate.totalLow > cateringAllocated
                  ? `Your budget suggests about ₹${cateringAllocated.toLocaleString('en-IN')} for food — this spread is tracking higher.`
                  : `Your budget suggests about ₹${cateringAllocated.toLocaleString('en-IN')} for food — this spread fits comfortably.`}
              </Text>
            )}
            <Text style={s.estimateBasis}>{menuEstimate.basis}</Text>
          </View>
        )}
        <MenuLibrary
          event={event}
          selections={selections}
          providerNote={event.menu_provider_note}
          menuStage={event.menu_stage || 'selecting'}
          onSetMenuType={handleSetMenuType}
          onSetMenuStage={handleSetMenuStage}
          onAddDish={handleAddDish}
          onRemoveDish={handleRemoveDish}
          onUpdateDetails={handleUpdateDetails}
          onSaveProviderNote={handleSaveProviderNote}
          theme={theme}
        />
      </ScrollView>

      <CoachMarkTour
        visible={menuTour.isTourActive}
        steps={MENUPLANNER_TOUR_STEPS}
        onComplete={menuTour.markComplete}
        onSkip={menuTour.markComplete}
      />
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    scroll: { flex: 1 },
    estimateCard: {
      backgroundColor: theme.cardBg, borderRadius: 16, borderWidth: 0.5, borderColor: theme.border,
      padding: 16, marginBottom: 18,
    },
    estimateTitle: { fontSize: 14.5, fontWeight: '700', color: theme.text },
    estimateTotal: { fontSize: 13, color: theme.textSecondary, marginTop: 4 },
    estimateOverBudget: { fontSize: 12.5, fontWeight: '600', color: '#E65100', marginTop: 8 },
    estimateWithinBudget: { fontSize: 12.5, fontWeight: '600', color: '#2E7D32', marginTop: 8 },
    estimateBasis: { fontSize: 11, color: theme.textTertiary, marginTop: 8, lineHeight: 15 },
  });
}
