import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Switch, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { showAlert } from '../../helpers';
import { useEventPlan } from '../../hooks/useEventPlan';
import { eventTypeName } from '../../lib/eventTypeNames';
import AppHeader from '../../components/AppHeader';
import EventTabStrip from '../../components/EventTabStrip';
import ActivityIdeasLibrary from '../../components/ActivityIdeasLibrary';
import DesktopEventShell from '../../components/desktop/DesktopEventShell';
import { MAROON, CARD, LINE, TEXT, MUTED } from '../../lib/desktopTheme';
import { ITEM_DESCRIPTIONS } from '../../lib/itemDescriptions';
import { getCategoryIcon } from '../../vendorTaxonomy';

const DESKTOP_BREAKPOINT = 768;

// "first thing is planning like what all we want to include in an event of
// ours... and then comes actual execution where host can actual see
// pricing per feature and vendors" — this is the new first stage. Same
// resolved P1-P5 checklist PlanView.js (the Execution stage) already
// computes via useEventPlan — nothing about that engine changes here, this
// screen just presents it differently: a plain include/skip toggle per
// item, a rough price shown only as a light hint (not tappable, no vendor
// browsing at all), and a "Save" action at the bottom. See the project doc
// "planning-vs-execution-split.md" for the full design this implements.
//
// Sept 16 hierarchy update — this is now one of three peer, always-
// reachable tabs (see components/EventTabStrip.js), not a forced one-way
// step into PlanView. Saving no longer auto-navigates anywhere; the host
// stays right here (tabs still visible) and switches to "Execute & book"
// themselves whenever they're ready.
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
  const { resolved, resolvedByFunction, event, allocation, extraActivities, loading, refresh } = useEventPlan(eventId);
  const [movingOn, setMovingOn] = useState(false);
  const [startingSelection, setStartingSelection] = useState(true);
  const initedRef = useRef(false);
  // "saving plan moves to main event planning screen with a prompt to
  // click execute and book" (Anish, Sept 16) — host picked "stay on this
  // screen, show a banner" over building a brand-new hub screen. True the
  // moment savePlanning() below succeeds; cleared again the moment they
  // touch another toggle, since a saved banner pointing at stale choices
  // would be misleading.
  const [justSaved, setJustSaved] = useState(false);

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

  // "when clicking any toggle its updating everytime which is frustrating —
  // it should update once when hosts select - done planning" (Anish, Sept
  // 16). Every toggle tap below is now purely local state — a plain JS Set,
  // seeded once from event.excluded_items the moment startingSelection's
  // own one-time init (above) has settled — no Supabase write per tap, no
  // network round trip, no lag. The ONE write to the database happens in
  // save() below, when the host is actually done: it writes the whole
  // localExcluded set back to events.excluded_items in a single call.
  const [localExcluded, setLocalExcluded] = useState(new Set());
  const localExcludedInitedRef = useRef(false);
  useEffect(() => {
    if (localExcludedInitedRef.current || loading || !event || startingSelection) return;
    localExcludedInitedRef.current = true;
    setLocalExcluded(new Set(event.excluded_items || []));
  }, [loading, event, startingSelection]);

  function toggleItem(itemName) {
    setJustSaved(false);
    setLocalExcluded(prev => {
      const next = new Set(prev);
      if (next.has(itemName)) next.delete(itemName);
      else next.add(itemName);
      return next;
    });
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

  // Sept 16 hierarchy update — this used to force-navigate straight into
  // PlanView the moment the host tapped this. Now it just saves (both the
  // item choices and planning_stage, so SlotPrompt.js's one-time "where do
  // we land first" check still works for a brand-new event) and stays put
  // — the host is still on the "Plan the event" tab, tabs visible, and
  // moves to "Execute & book" on their own whenever they're ready. Matches
  // exactly what Anish described: "Once we save it, it goes again back to
  // the event planning where we see all the tabs... Now we click on book
  // the event to book whatever vendors we want to."
  async function savePlanning() {
    setMovingOn(true);
    try {
      const { error } = await supabase
        .from('events')
        .update({ excluded_items: [...localExcluded], planning_stage: 'executing' })
        .eq('id', eventId);
      if (error) throw error;
      // No refresh() here on purpose — this screen is about to be replaced
      // by PlanView.js below, which mounts fresh and calls useEventPlan()
      // itself, refetching everything from scratch anyway. Refreshing
      // THIS screen's own state first was dead weight left over from
      // before the Sept 18 change below made saving always navigate away
      // immediately (it used to matter back when saving could leave the
      // host sitting on this same screen with a "Saved!" banner) — for a
      // wedding with several functions, useEventPlan's fetch is a
      // dozen-plus sequential queries, so paying for it twice back-to-back
      // made this button feel like it had done nothing for several
      // seconds on a real phone's network before finally moving on.
      // Sept 18: "when we click save planning, it should automatically
      // move to execute and book" (Anish) — reverses the Sept 16 change
      // that made this stop and wait for a second tap on a "Saved!"
      // banner. navigation.replace (not .navigate), same lateral-move
      // convention EventTabStrip/EventDetailsScreen's own tab-forward taps
      // use, so the back button still behaves the same regardless of how
      // this screen was reached.
      navigation.replace('PlanView', { eventId });
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setMovingOn(false);
    }
  }

  if (loading || !event || startingSelection || !localExcluded) {
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
              included={!localExcluded.has(item.item_name)}
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
                included={!localExcluded.has(item.item_name)}
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

  // "add menu tab, guest list tab, invites tab on the right top corner - as
  // they are also part of planning only" (Anish, Sept 16) — same shortcuts,
  // same icons, same navigate({ event }) shape PlanView.js's own header
  // already uses for these three, just without its 4th "add to calendar"
  // button (not asked for here).
  const shortcutButtons = [
    { key: 'guests', icon: '👥', screen: 'GuestList' },
    { key: 'menu', icon: '🍽️', screen: 'MenuPlanner' },
    { key: 'invites', icon: '🎨', screen: 'InviteHub' },
  ];

  const savedBanner = justSaved ? (
    <TouchableOpacity
      style={s.savedBanner}
      onPress={() => { setJustSaved(false); navigation.replace('PlanView', { eventId }); }}
    >
      <Text style={s.savedBannerText}>✓ Saved! Ready to book vendors?</Text>
      <Text style={s.savedBannerLink}>Execute & book →</Text>
    </TouchableOpacity>
  ) : null;

  const ctaEl = (
    <TouchableOpacity style={s.ctaBtn} onPress={savePlanning} disabled={movingOn}>
      {movingOn ? <ActivityIndicator color="#FFF" /> : <Text style={s.ctaBtnText}>Save planning ✓</Text>}
    </TouchableOpacity>
  );

  if (isDesktopWeb) {
    return (
      <DesktopEventShell activeItem="plan" event={event} guestCount={0} currentUserName="" navigation={navigation}>
        <Text style={ds.title}>{event.working_title || eventTypeName(event.event_type_slug)}</Text>
        <Text style={ds.subtitle}>Planning</Text>
        <View style={ds.quickActions}>
          {shortcutButtons.map(btn => (
            <TouchableOpacity key={btn.key} style={ds.quickBtn} onPress={() => navigation.navigate(btn.screen, { event })}>
              <Text style={ds.quickBtnText}>{btn.icon} {btn.key === 'guests' ? 'Guests' : btn.key === 'menu' ? 'Menu' : 'Invites'}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={ds.body}>{body}</View>
        <View style={ds.ctaRow}>
          {savedBanner}
          {ctaEl}
        </View>
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
        rightActions={shortcutButtons.map(btn => (
          <TouchableOpacity key={btn.key} onPress={() => navigation.navigate(btn.screen, { event })} style={s.calendarBtn}>
            <Text style={s.calendarBtnText}>{btn.icon}</Text>
          </TouchableOpacity>
        ))}
      />
      <EventTabStrip active="plan" eventId={eventId} navigation={navigation} theme={theme} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
        {body}
      </ScrollView>
      <View style={s.bottomBar}>
        {savedBanner}
        {ctaEl}
      </View>
    </SafeAreaView>
  );
}

// "remove pricing from this screen" (Anish, Sept 16) — Planning is now a
// pure include/skip decision; the price hint (estimate/priceHint) is no
// longer shown here at all. Pricing still lives on Execute & book
// (PlanView.js), which is the only place it belongs.
//
// "add icon library and give icons to all the features" (Anish, Sept 16) —
// reuses vendorTaxonomy.js's existing Category -> icon map (getCategoryIcon,
// with its own safe '📌' fallback) instead of a new icon library or
// per-item phosphor-react-native names — PlanView.js's ItemRow already has
// a comment flagging that path as unsafe (a mistyped icon name can't be
// verified without running the app, and would crash the whole screen).
function ScopeItemRow({ item, included, onToggle, description, theme, s }) {
  const label = item.contextual_label || item.item_name;
  const parentCategory = item.category_slug && item.category_slug.includes(' > ')
    ? item.category_slug.split(' > ')[0]
    : item.category_slug;
  const icon = getCategoryIcon(parentCategory);
  // "add description also below features which are not self explanatory —
  // with more details tab" (Anish, Sept 16) — only items with a real entry
  // in lib/itemDescriptions.js show this at all, so obvious items (a plain
  // "Photographer", say) stay exactly as compact as they are today.
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <View style={[s.itemRow, !included && s.itemRowExcluded]}>
      <View style={{ flex: 1 }}>
        <View style={s.itemNameRow}>
          <Text style={s.itemIcon}>{icon}</Text>
          <Text style={s.itemName}>{label}</Text>
          {description ? (
            <TouchableOpacity onPress={() => setDetailsOpen(o => !o)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Text style={s.moreDetailsLink}>{detailsOpen ? 'Less details ▾' : 'More details ▸'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {description && detailsOpen ? <Text style={s.itemDescription}>{description}</Text> : null}
      </View>
      <Switch value={included} onValueChange={onToggle} />
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    scroll: { padding: 20, paddingBottom: 110 },
    // "change the font color- its not readable - make it dark" (Anish,
    // Sept 16) — this screen's body text used theme.textSecondary/
    // textTertiary (medium/light gray), which read as too washed out.
    // Bumped to theme.text (the same near-black/white token every clearly
    // legible label on this screen already used) wherever it's real
    // content the host needs to read, not a decorative accent.
    // "font size should be editable from profile" was flagged by Anish as
    // a separate, later request — intentionally not built here.
    intro: { fontSize: 13.5, color: theme.text, lineHeight: 20, marginBottom: 18 },

    section: { marginBottom: 18 },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },

    itemRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border,
      paddingHorizontal: 16, paddingVertical: 14, marginBottom: 8,
    },
    // "there should not be a cut line across the feature — that makes it
    // difficult to read" (Anish, Sept 16) — excluded items are now shown
    // only with reduced opacity, no strikethrough text.
    itemRowExcluded: { opacity: 0.55 },
    itemNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    itemIcon: { fontSize: 16, marginRight: 2 },
    itemName: { fontSize: 14.5, fontWeight: '600', color: theme.text },
    moreDetailsLink: { fontSize: 11.5, fontWeight: '700', color: theme.accent },
    itemDescription: { fontSize: 12.5, color: theme.text, lineHeight: 18, marginTop: 8 },

    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: theme.bg, borderTopWidth: 0.5, borderTopColor: theme.border },
    ctaBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
    ctaBtnText: { fontSize: 15, fontWeight: '700', color: theme.btnPrimaryText },
    savedBanner: {
      backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border,
      padding: 14, marginBottom: 10, alignItems: 'center',
    },
    savedBannerText: { fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: 4 },
    savedBannerLink: { fontSize: 13.5, fontWeight: '700', color: theme.accent },
    calendarBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    calendarBtnText: { fontSize: 15 },
  });
}

const ds = StyleSheet.create({
  title: { fontFamily: 'Fraunces-SemiBold', fontSize: 24, color: TEXT, marginTop: 2 },
  subtitle: { fontSize: 13, fontWeight: '700', color: MAROON, marginTop: 4, marginBottom: 20, textTransform: 'uppercase', letterSpacing: 0.5 },
  body: { maxWidth: 640 },
  ctaRow: { maxWidth: 640, marginTop: 10 },
  quickActions: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  quickBtn: { backgroundColor: CARD, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: LINE },
  quickBtnText: { fontSize: 13, fontWeight: '600', color: TEXT },
});
