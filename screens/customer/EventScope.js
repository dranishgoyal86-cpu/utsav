import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Switch, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { showAlert } from '../../helpers';
import { useEventPlan } from '../../hooks/useEventPlan';
import { eventTypeName } from '../../lib/eventTypeNames';
import AppHeader from '../../components/AppHeader';
import DesktopEventShell from '../../components/desktop/DesktopEventShell';
import { MAROON, CARD, LINE, TEXT, MUTED } from '../../lib/desktopTheme';

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
  const { resolved, estimates, resolvedByFunction, event, loading, refresh } = useEventPlan(eventId);
  const [movingOn, setMovingOn] = useState(false);
  const [togglingItem, setTogglingItem] = useState(null);

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

  if (loading || !event) {
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
        Let's figure out what this event actually needs. Toggle off anything you don't want — you can always turn it back on later, and nothing here books or prices out a vendor yet.
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
                theme={theme}
                s={s}
              />
            ))}
          </View>
        ) : null
      ))}
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

function ScopeItemRow({ item, estimate, included, busy, onToggle, theme, s }) {
  const label = item.contextual_label || item.item_name;

  function priceHint() {
    if (!estimate || estimate.available === false) {
      return estimate?.quoteOnRequest ? 'Quote on request' : 'Price unavailable yet';
    }
    return `~ ₹${estimate.low.toLocaleString('en-IN')}–${estimate.high.toLocaleString('en-IN')}`;
  }

  return (
    <View style={[s.itemRow, !included && s.itemRowExcluded]}>
      <View style={{ flex: 1 }}>
        <Text style={[s.itemName, !included && s.itemNameExcluded]}>{label}</Text>
        <Text style={s.itemPriceHint}>{priceHint()}</Text>
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
    itemName: { fontSize: 14.5, fontWeight: '600', color: theme.text },
    itemNameExcluded: { textDecorationLine: 'line-through' },
    itemPriceHint: { fontSize: 12, color: theme.textTertiary, marginTop: 3 },

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
