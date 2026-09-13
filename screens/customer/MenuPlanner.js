import { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import AppHeader from '../../components/AppHeader';
import MenuLibrary from '../../components/MenuLibrary';
import { showAlert } from '../../helpers';

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
  const { event: routeEvent } = route.params || {};
  const eventId = routeEvent?.id;

  const [event, setEvent] = useState(routeEvent || null);
  const [selections, setSelections] = useState([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <SafeAreaView style={s.container}>
      <AppHeader theme={theme} navigation={navigation} onBack={() => navigation.goBack()} title="Menu" eventId={event.id} />
      <ScrollView style={s.scroll} contentContainerStyle={{ padding: 20 }}>
        <MenuLibrary
          event={event}
          selections={selections}
          providerNote={event.menu_provider_note}
          onSetMenuType={handleSetMenuType}
          onAddDish={handleAddDish}
          onRemoveDish={handleRemoveDish}
          onUpdateDetails={handleUpdateDetails}
          onSaveProviderNote={handleSaveProviderNote}
          theme={theme}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    scroll: { flex: 1 },
  });
}
