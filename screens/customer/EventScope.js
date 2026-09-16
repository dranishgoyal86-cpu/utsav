import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Switch, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { showAlert } from '../../helpers';
import { useEventPlan } from '../../hooks/useEventPlan';
import { eventTypeName } from '../../lib/eventTypeNames';
import AppHeader from '../../components/AppHeader';
import ActivityIdeasLibrary from '../../components/ActivityIdeasLibrary';
import DesktopEventShell from '../../components/desktop/DesktopEventShell';
import { MAROON, CARD, LINE, TEXT, MUTED } from '../../lib/desktopTheme';
import { ITEM_DESCRIPTIONS } from '../../lib/itemDescriptions';

const DESKTOP_BREAKPOINT = 768;

// "first thing is planning like what all we want to include in an event of
// ours... and then comes actual execution where host can actual see
// pricing per feature and vendors" — this is the new first stage. Same
// resolved P1-P5 checklist PlanView.js (the Execution stage) already
// computes via useEventPlan — nothing about that engine changes here, this
// screen just presents it differently: a plain include/skip toggle per
// item, a rough price shown only as a light hint (not tappable, no vendor
// browsing at all), and a single "Done planning" action at the bottom that
// hands off to PlanView.js. See the project doc
// "planning-vs-execution-split.md" for the full design this implements.
const PRIORITY_META = {
  P1: 'The Essentials',
  P2: 'Important to lock in',
  P3: 'Worth arranging',
  P4: 'Nice touches',
  P5: 'You may also love',
};

export default function EventScope({ route, navigation }) {
  const { eventId } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const { resolved, estimates, resolvedByFunction, event, allocation, extraActivities, loading, refresh } = useEventPlan(eventId);
  const [movingOn, setMovingOn] = useState(false);
  const [togglingItem, setTogglingItem] = useState(null);
  const [startingSelection, setStartingSelection] = useState(true);
  const initedRef = useRef(false);

  // "things in the planning screen are already selected — it should be
  // opposite so that host can select whatever he wants, not unselect"
  // (Anish, Sept 16). We keep events.excluded_items exactly as it is —
  // same column, same meaning ("these item names are hidden from
  // Execution"), so PlanView.js and every pre-existing event that's
  // already past Planning are completely untouched. The only thing that
  // changes is what a BRAND NEW event's excluded_items starts as: instead
  // of empty (= everything included, today's bug), the very first time
  // this screen opens for an event we write the FULL resolved item list
  // into excluded_items once — so every toggle below starts OFF, and the
  // host turns ON only what they actually want (which removes that one
  // item from excluded_items). This only fires once per event, guarded by
  // "excluded_items is still empty" — once the host touches anything, the
  // array is never empty again (removing even one item still leaves the
  // rest excluded), so it can never accidentally re-fire and wipe a host's
  // real choices.
  useEffect(() => {
    if (initedRef.current || loading || !event) return;
    if (event.excluded_items && event.excluded_items.length > 0) {
      initedRef.current = true;
      setStartingSelection(false);
      return;
    }
    const allNames = new Set();
    ['P1', 'P2', 'P3', 'P4', 'P5'].forEach(p => (resolved[p] || []).forEach(item => allNames.add(item.item_name)));
    resolvedByFunction.forEach(fn => fn.items.forEach(item => allNames.add(item.item_name)));
    if (allNames.size === 0) {
      // Nothing resolved yet (or genuinely nothing applies) — nothing to
      // pre-exclude. Leave excluded_items empty and stop waiting on it.
      initedRef.current = true;
      setStartingSelection(false);
      return;
    }
    initedRef.current = true;
    supabase.from('events').update({ excluded_items: [...allNames] }).eq('id', eventId).then(({ error }) => {
      if (error) {
        console.log('EventScope opt-in init error:', error.message);
        setStartingSelection(false);
        return;
      }
      refresh().then(() => setStartingSelection(false));
    });
  }, [loading, event, resolved, resolvedByFunction, eventId, refresh]);

  const excludedItems = event?.excluded_items || [];
  const excludedSet = new Set(excludedItems);

  async function toggleItem(itemName) {
    if (!event) return;
    setTogglingItem(itemName);
    try {
      const nextExcluded = excludedSet.has(itemName)
        ? excludedItems.filter(n => n !== itemName)
        : [...excludedItems, itemName];
      const { error } = await supabase.from('events').update({ excluded_items: nextExcluded }).eq('id', eventId);
      if (error) throw error;
      await refresh();
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setTogglingItem(null);
    }
  }

  // Activity Ideas Library — moved here from PlanView.js (Sept 16):
  // "the browse activity ideas should also be in planning stage" — this is
  // choosing WHAT the event includes, same as every other item toggle on
  // this screen, so it belongs before Execution now, not after. Handlers
  // ported as-is from PlanView.js, unchanged.
  async function handleAddActivity(item) {
    const { error: err } = await supabase.from('event_extra_activities').insert({
      event_id: eventId,
      activity_slug: item.slug,
      item_name: item.name,
      category_slug: item.categorySlug,
      age_hint: item.ages || null,
      note: item.note || null,
    });
    if (err) { showAlert('Could not add that', err.message); return; }
    refresh();
  }

  async function handleRemoveActivity(row) {
    const { error: err } = await supabase.from('event_extra_activities').delete().eq('id', row.id);
    if (err) { showAlert('Could not remove that', err.message); return; }
    refresh();
  }

  async function handleToggleFeatureActivity(row) {
    const { error: err } = await supabase
      .from('event_extra_activities').update({ is_featured_on_invite: !row.is_featured_on_invite }).eq('id', row.id);
    if (err) { showAlert('Could not update that', err.message); return; }
    refresh();
  }

  async function doneWithPlanning() {
    setMovingOn(true);
    try {
      const { error } = await supabase.from('events').update({ planning_stage: 'executing' }).eq('id', eventId);
      if (error) throw error;
      navigation.replace('PlanView', { eventId });
    } catch (err) {
      showAlert('Error', err.message);
      setMovingOn(false);
    }
  }

  if (loading || !event || startingSelection) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  const priorityGroups = ['P1', 'P2', 'P3', 'P4', 'P5']
    .map(p => ({ key: p, label: PRIORITY_META[p], items: resolved[p] || [] }))
    .filter(g => g.items.length > 0);

  const body = (
    <>
      <Text style={s.intro}>
        Let's figure out what this event actually needs. Turn on whatever you want to include — nothing is added until you switch it on, and nothing here books or prices out a vendor yet.
      </Text>

      {priorityGroups.map(group => (
        <View key={group.key} style={s.section}>
          <Text style={s.sectionTitle}>{group.label} ({group.items.length})</Text>
          {group.items.map(item => (
            <ScopeItemRow
              key={item.item_name}
              item={item}
              estimate={estimates[item.item_name]}
              included={!excludedSet.has(item.item_name)}
              busy={togglingItem === item.item_name}
              onToggle={() => toggleItem(item.item_name)}
              description={ITEM_DESCRIPTIONS[item.item_name]}
              theme={theme}
              s={s}
            />
          ))}
        </View>
      ))}

      {resolvedByFunction.map(fn => (
        fn.items.length > 0 ? (
          <View key={fn.functionId} style={s.section}>
            <Text style={s.sectionTitle}>For {fn.functionName} ({fn.items.length})</Text>
            {fn.items.map(item => (
              <ScopeItemRow
                key={item.item_name}
                item={item}
                estimate={estimates[item.item_name]}
                included={!excludedSet.has(item.item_name)}
                busy={togglingItem === item.item_name}
                onToggle={() => toggleItem(item.item_name)}
                description={ITEM_DESCRIPTIONS[item.item_name]}
                theme={theme}
                s={s}
              />
            ))}
          </View>
        ) : null
      ))}

      <ActivityIdeasLibrary
        event={event}
        added={extraActivities}
        onAdd={handleAddActivity}
        onRemove={handleRemoveActivity}
        onToggleFeature={handleToggleFeatureActivity}
        theme={theme}
        allocation={allocation}
      />
    </>
  );

  const ctaEl = (
    <TouchableOpacity style={s.ctaBtn} onPress={doneWithPlanning} disabled={movingOn}>
      {movingOn ? <ActivityIndicator color="#FFF" /> : <Text style={s.ctaBtnText}>Done planning — see pricing & vendors →</Text>}
    </TouchableOpacity>
  );

  if (isDesktopWeb) {
    return (
      <DesktopEventShell activeItem="overview" event={event} guestCount={0} currentUserName="" navigation={navigation}>
        <Text style={ds.title}>{event.working_title || eventTypeName(event.event_type_slug)}</Text>
        <Text style={ds.subtitle}>Planning</Text>
        <View style={ds.body}>{body}</View>
        <View style={ds.ctaRow}>{ctaEl}</View>
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
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
        {body}
      </ScrollView>
      <View style={s.bottomBar}>{ctaEl}</View>
    </SafeAreaView>
  );
}

function ScopeItemRow({ item, estimate, included, busy, onToggle, description, theme, s }) {
  const label = item.contextual_label || item.item_name;
  // "add description also below features which are not self explanatory —
  // with more details tab" (Anish, Sept 16) — only items with a real entry
  // in lib/itemDescriptions.js show this at all, so obvious items (a plain
  // "Photographer", say) stay exactly as compact as they are today.
  const [detailsOpen, setDetailsOpen] = useState(false);

  function priceHint() {
    if (!estimate || estimate.available === false) {
      return estimate?.quoteOnRequest ? 'Quote on request' : 'Price unavailable yet';
    }
    return `~ ₹${estimate.low.toLocaleString('en-IN')}–${estimate.high.toLocaleString('en-IN')}`;
  }

  return (
    <View style={[s.itemRow, !included && s.itemRowExcluded]}>
      <View style={{ flex: 1 }}>
        <View style={s.itemNameRow}>
          <Text style={[s.itemName, !included && s.itemNameExcluded]}>{label}</Text>
          {description ? (
            <TouchableOpacity onPress={() => setDetailsOpen(o => !o)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Text style={s.moreDetailsLink}>{detailsOpen ? 'Less details ▾' : 'More details ▸'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={s.itemPriceHint}>{priceHint()}</Text>
        {description && detailsOpen ? <Text style={s.itemDescription}>{description}</Text> : null}
      </View>
      {busy ? <ActivityIndicator color={theme.accent} /> : (
        <Switch value={included} onValueChange={onToggle} />
      )}
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    scroll: { padding: 20, paddingBottom: 110 },
    intro: { fontSize: 13.5, color: theme.textSecondary, lineHeight: 20, marginBottom: 18 },

    section: { marginBottom: 18 },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },

    itemRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border,
      paddingHorizontal: 16, paddingVertical: 14, marginBottom: 8,
    },
    itemRowExcluded: { opacity: 0.55 },
    itemNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    itemName: { fontSize: 14.5, fontWeight: '600', color: theme.text },
    itemNameExcluded: { textDecorationLine: 'line-through' },
    itemPriceHint: { fontSize: 12, color: theme.textTertiary, marginTop: 3 },
    moreDetailsLink: { fontSize: 11.5, fontWeight: '700', color: theme.accent },
    itemDescription: { fontSize: 12.5, color: theme.textSecondary, lineHeight: 18, marginTop: 8 },

    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: theme.bg, borderTopWidth: 0.5, borderTopColor: theme.border },
    ctaBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
    ctaBtnText: { fontSize: 15, fontWeight: '700', color: theme.btnPrimaryText },
  });
}

const ds = StyleSheet.create({
  title: { fontFamily: 'Fraunces-SemiBold', fontSize: 24, color: TEXT, marginTop: 2 },
  subtitle: { fontSize: 13, fontWeight: '700', color: MAROON, marginTop: 4, marginBottom: 20, textTransform: 'uppercase', letterSpacing: 0.5 },
  body: { maxWidth: 640 },
  ctaRow: { maxWidth: 640, marginTop: 10 },
});
