import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Modal, TextInput, Linking, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PencilSimple } from 'phosphor-react-native';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { showAlert, renameEvent, googleCalendarUrl } from '../../helpers';
import { useEventPlan } from '../../hooks/useEventPlan';
import { eventTypeName, isCelebratory } from '../../lib/eventTypeNames';
import { isHomeVenueType, buildContext } from '../../lib/eventContext';
import { useEventCapabilities } from '../../hooks/useEventCapabilities';
import SlotField, { slotApplies, slotFilled, slotDisplayValue, SLOT_LABELS } from '../../components/SlotField';
import AppHeader from '../../components/AppHeader';
import { resolveInviteDesignColors } from './GuestList';

// Warmer, celebration-framed language in place of the old raw P1-P5 labels —
// display text only. The 'P1'-'P5' keys themselves stay unchanged: they're
// the real event_requirements.priority DB values, threaded through
// resolved/estimates/allocateBudget()/computeProgress() everywhere else in
// this app (lib/priceEngine.js, lib/eventResolver.js, scripts/
// verifyPlanEngine.js) — renaming the keys would be a logic change, not a
// presentation one. Confirmed via a full-codebase search that the literal
// strings "P1"-"P5" are never rendered as user-facing text anywhere today
// (PRIORITY_META.label was already the only display text) — nothing to
// collide with.
const PRIORITY_META = {
  P1: { label: 'The Essentials', defaultOpen: true },
  P2: { label: 'Important to lock in', defaultOpen: false },
  P3: { label: 'Worth arranging', defaultOpen: false },
  P4: { label: 'Nice touches', defaultOpen: false },
};

// Venue_type/location/guest_count/theme/dietary_restrictions/budget_total
// are soft prompts — fillable at the host's own pace, shown inline here
// rather than a forced full-screen flow (only sub_type_slug/event_date/city
// block, in SlotPrompt.js).
const SOFT_SLOTS = ['event_time', 'venue_type', 'location', 'guest_count', 'theme', 'dietary_restrictions', 'budget_total'];

// Every field the host can ever set, blocking or soft — used by the "Event
// details" section below so nothing is edit-once. Unlike SOFT_SLOTS above,
// this isn't filtered by fill state: a field that's already set still shows
// here, pre-filled, so it can be changed. This is the direct fix for "no
// option of modifying the details" — every one of these used to disappear
// from the UI forever the moment it was first set.
const EDITABLE_SLOTS = ['sub_type_slug', 'event_date', 'event_time', 'city', 'venue_type', 'location', 'guest_count', 'theme', 'dietary_restrictions', 'budget_total'];

export default function PlanView({ route, navigation }) {
  const { eventId } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { resolved, estimates, progress, allocation, event, venue, resolvedByFunction, itemHandledByName, loading, error, refresh } = useEventPlan(eventId);
  const capabilities = useEventCapabilities(eventId);
  const entryControl = capabilities.entryControl;

  // Palette reuse from the host's own saved invite design (Step 2) — most
  // recent design for this event, if any. Falls back to the neutral
  // theme.accent everywhere below when none exists; never requires one.
  const [inviteDesign, setInviteDesign] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('event_invite_designs')
          .select('template_id, variant')
          .eq('event_id', eventId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!cancelled) setInviteDesign(data || null);
      } catch (err) {
        console.log('Invite design fetch error:', err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [eventId]);
  const paletteAccent = inviteDesign ? resolveInviteDesignColors(inviteDesign.template_id, inviteDesign.variant)?.accent : null;
  const isCelebratoryEvent = isCelebratory(event?.event_type_slug);
  // Non-celebratory events (Funeral/Last-Rites) never inherit the host's
  // saved invite-design color or the app's amber accent — muted gray
  // (theme.textSecondary, already a neutral token in both light/dark themes)
  // instead, applied everywhere accentColor is used (progress bar fill
  // included, not just the two gated blocks below).
  const accentColor = isCelebratoryEvent ? (paletteAccent || theme.accent) : theme.textSecondary;

  const [openSections, setOpenSections] = useState({ P1: true, P2: false, P3: false, P4: false, P5: false });
  // Keyed by event_functions.id — collapsed by default, same "closed until
  // opened" default as P2-P5 above (P1 is the only section that starts open).
  const [openFunctionSections, setOpenFunctionSections] = useState({});
  const [renameModal, setRenameModal] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [saving, setSaving] = useState(false);
  // undefined = no manual choice yet, defaults to "editing" whenever
  // something's still missing (same undefined-until-touched pattern as
  // openSections.details below) — once the host taps Modify or Save it's
  // their call from then on.
  const [detailsEditingOverride, setDetailsEditingOverride] = useState(undefined);

  // One-time celebratory note when the Essentials tier transitions into
  // fully-booked DURING this visit — a ref tracks the previous handled
  // count so the very first render (which might already be fully booked
  // from a past visit) never spuriously fires it; only a real transition
  // does. Session-only by design (Step 5 asked for "small, one-time", not
  // a persisted flag needing a new column — that'd be a schema change,
  // out of scope for a presentation-layer task).
  const prevP1HandledRef = useRef(undefined);
  const [justCompletedP1, setJustCompletedP1] = useState(false);
  useEffect(() => {
    const prev = prevP1HandledRef.current;
    const fullyBooked = progress.p1Total > 0 && progress.p1Handled === progress.p1Total;
    if (prev !== undefined && prev.total === progress.p1Total && prev.handled < progress.p1Total && fullyBooked) {
      setJustCompletedP1(true);
    }
    prevP1HandledRef.current = { handled: progress.p1Handled, total: progress.p1Total };
  }, [progress.p1Handled, progress.p1Total]);

  async function saveField(patch) {
    setSaving(true);
    try {
      const { error: err } = await supabase.from('events').update(patch).eq('id', eventId);
      if (err) throw err;

      // saved_plans.event_date/total_budget are what PlanScreen.js's "YOUR
      // PLANS" cards and sort options actually read — they don't live-join
      // the events row, so without this mirror a new-flow plan permanently
      // shows "No date set"/no budget badge even after both are filled in.
      const planMirror = {};
      if ('event_date' in patch) planMirror.event_date = patch.event_date;
      if ('budget_total' in patch) planMirror.total_budget = patch.budget_total;
      if (Object.keys(planMirror).length > 0) {
        await supabase.from('saved_plans').update(planMirror).eq('event_id', eventId);
      }

      await refresh();
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  // Ported from the old EventPlanner.js flow, which had no new-flow
  // equivalent at all — same googleCalendarUrl() helper, adapted to this
  // flow's field names (event_date/venue/venue_type/city instead of
  // formData.eventDate/homeAddress/venueType/city).
  function addToGoogleCalendar() {
    const location = isHomeVenueType(event.venue_type)
      ? event.venue
      : (venue?.name || event.venue || event.city);
    const details = [
      'Planned on Utsav',
      event.guest_count != null ? `${event.guest_count} guests` : null,
      event.budget_total != null ? `₹${event.budget_total.toLocaleString('en-IN')} budget` : null,
    ].filter(Boolean).join(' — ');
    const url = googleCalendarUrl({
      title: event.working_title || eventTypeName(event.event_type_slug),
      date: event.event_date,
      details,
      location,
    });
    Linking.openURL(url);
  }

  async function saveRename() {
    const trimmed = renameInput.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await renameEvent(eventId, trimmed);
      const { error: err } = await supabase.from('events').update({ working_title: trimmed }).eq('id', eventId);
      if (err) throw err;
      setRenameModal(false);
      await refresh();
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleSection(priority) {
    setOpenSections(prev => ({ ...prev, [priority]: !prev[priority] }));
  }

  function toggleFunctionSection(functionId) {
    setOpenFunctionSections(prev => ({ ...prev, [functionId]: !prev[functionId] }));
  }

  if (loading && !event) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centerBox}>
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={refresh}>
            <Text style={s.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centerBox}>
          <Text style={s.errorText}>This event couldn't be found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Reuses buildContext() (lib/eventContext.js) rather than re-deriving the
  // date math locally — daysUntil itself isn't exported on its own (only
  // buildContext is), and buildContext is a cheap pure function, so this is
  // simpler than adding a second export for one field.
  const eventContext = buildContext(event, venue);
  const daysUntil = eventContext?.daysUntil ?? null;

  const pendingSoftSlots = SOFT_SLOTS.filter(slot => slotApplies(slot, event) && !slotFilled(slot, event));
  const applicableEditableSlots = EDITABLE_SLOTS.filter(slot => slotApplies(slot, event));
  // Opens by default whenever something's still missing; once the host has
  // touched it manually, their choice wins from then on.
  const detailsOpen = openSections.details !== undefined ? openSections.details : pendingSoftSlots.length > 0;
  const detailsEditing = detailsEditingOverride !== undefined ? detailsEditingOverride : pendingSoftSlots.length > 0;

  return (
    <SafeAreaView style={s.container}>
      {/* AppHeader sits outside the padded ScrollView on purpose — it has
          its own horizontal padding, and s.scroll already applies padding:20
          to everything below it (the title/meta/venue block, unchanged). */}
      <AppHeader
        theme={theme}
        navigation={navigation}
        onBack={() => navigation.goBack()}
        eventId={event.id}
        rightActions={[
          <TouchableOpacity key="guests" onPress={() => navigation.navigate('GuestList', { event })} style={s.calendarBtn}>
            <Text style={s.calendarBtnText}>👥</Text>
          </TouchableOpacity>,
          ...(event.event_date ? [
            <TouchableOpacity key="calendar" onPress={addToGoogleCalendar} style={s.calendarBtn}>
              <Text style={s.calendarBtnText}>📅</Text>
            </TouchableOpacity>,
          ] : []),
        ]}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── Countdown hero (Step 4) — the emotional anchor the screen
            currently lacks. Only shown for a real, future date; a past event
            (isPast) or one with no date set yet has nothing to count down to,
            so it's silently omitted rather than showing something wrong. ── */}
        {daysUntil != null && !eventContext.isPast && isCelebratoryEvent && (
          <View style={[s.countdownHero, { backgroundColor: accentColor + '1A' }]}>
            <Text style={[s.countdownText, { color: accentColor }]}>
              {daysUntil === 0
                ? `🎉 Today's the day — ${event.working_title || eventTypeName(event.event_type_slug)}!`
                : `${daysUntil} day${daysUntil === 1 ? '' : 's'} until ${event.working_title || eventTypeName(event.event_type_slug)}`}
            </Text>
          </View>
        )}

        {/* ── Title / meta / venue — PlanView's own richer header block,
            unchanged, deliberately not absorbed into AppHeader yet (see
            AppHeader.js's own comment on scope). ── */}
        <View style={s.header}>
          <TouchableOpacity
            style={s.titleRow}
            onPress={() => { setRenameInput(event.working_title || ''); setRenameModal(true); }}
          >
            <Text style={s.titleWarm}>{event.working_title || eventTypeName(event.event_type_slug)}</Text>
            <PencilSimple size={15} color={theme.textTertiary} />
          </TouchableOpacity>
          <Text style={s.metaLine}>
            {eventTypeName(event.event_type_slug)}
            {event.event_date ? ` · ${new Date(event.event_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
            {event.guest_count != null ? ` · ${event.guest_count} guests` : ''}
          </Text>
          {(event.venue || venue?.name) ? <Text style={s.metaLine}>{venue?.name || event.venue}</Text> : null}
        </View>

        {/* ── Event details — every field the host can set, always here, not
             just while empty. This is the direct fix for "no option of
             modifying the details". Opens automatically when something's
             still missing, straight into edit mode; otherwise opens as a
             clean read-only summary with a Modify button, and a Save
             button to close back out of edit mode once done — the
             underlying fields still autosave individually on change either
             way, this toggle is purely about what's shown. */}
        <View style={s.section}>
          <TouchableOpacity style={s.sectionHeader} onPress={() => setOpenSections(prev => ({ ...prev, details: !detailsOpen }))}>
            <Text style={s.sectionTitle}>
              Event details{pendingSoftSlots.length > 0 ? ` · ${pendingSoftSlots.length} to fill in` : ''}
            </Text>
            <Text style={s.sectionCaret}>{detailsOpen ? '▾' : '▸'}</Text>
          </TouchableOpacity>
          {detailsOpen && (
            <View style={s.detailsBody}>
              {saving && <ActivityIndicator color={theme.accent} style={{ marginBottom: 10 }} />}
              {detailsEditing ? (
                <>
                  {applicableEditableSlots.map(slot => (
                    <View key={slot} style={{ marginBottom: 18 }}>
                      <SlotField slotKey={slot} event={event} onSave={saveField} navigation={navigation} />
                    </View>
                  ))}
                  <TouchableOpacity style={s.detailsSaveBtn} onPress={() => setDetailsEditingOverride(false)}>
                    <Text style={s.detailsSaveBtnText}>Save</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {applicableEditableSlots.map(slot => {
                    const value = slotDisplayValue(slot, event, venue);
                    if (!value) return null;
                    return (
                      <View key={slot} style={s.detailsRow}>
                        <Text style={s.detailsRowLabel}>{SLOT_LABELS[slot]}</Text>
                        <Text style={s.detailsRowValue}>{value}</Text>
                      </View>
                    );
                  })}
                  <TouchableOpacity style={s.detailsModifyBtn} onPress={() => setDetailsEditingOverride(true)}>
                    <PencilSimple size={14} color={theme.text} />
                    <Text style={s.detailsModifyBtnText}>Modify</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>

        {/* ── Gate pass — surfaced only when entryControl actually resolves
             to something the host needs to act on, never guessed from
             venue_type directly. */}
        {entryControl && entryControl.capability_key !== 'no_entry_control' && (
          <TouchableOpacity style={s.linkCard} onPress={() => navigation.navigate('GatePass', { eventId })}>
            <Text style={s.linkCardIcon}>🎫</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.linkCardTitle}>{entryControl.label}</Text>
              <Text style={s.linkCardSub}>Issue and scan gate passes for this event</Text>
            </View>
            <Text style={s.linkCardArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* ── Progress (Step 5) — milestone-framed copy matching the
            "Essentials" rename above; exclamation only once it's actually
            complete, not presumptuously while still in progress. ── */}
        <View style={s.progressCard}>
          <Text style={s.progressLabel}>
            {progress.p1Total > 0 && progress.p1Handled === progress.p1Total
              ? `${progress.p1Handled} of ${progress.p1Total} essential${progress.p1Total === 1 ? '' : 's'} booked!`
              : `${progress.p1Handled} of ${progress.p1Total} essential${progress.p1Total === 1 ? '' : 's'} booked`}
          </Text>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${progress.percentComplete}%`, backgroundColor: accentColor }]} />
          </View>
          {justCompletedP1 && isCelebratoryEvent && (
            <Text style={[s.celebrateText, { color: accentColor }]}>
              🎉 All essentials are booked — you're on track!
            </Text>
          )}
        </View>

        {/* ── P1-P4 sections ── */}
        {['P1', 'P2', 'P3', 'P4'].map(priority => {
          const items = resolved[priority] || [];
          if (items.length === 0) return null;
          const meta = PRIORITY_META[priority];
          const isOpen = openSections[priority];
          return (
            <View key={priority} style={s.section}>
              <TouchableOpacity style={s.sectionHeader} onPress={() => toggleSection(priority)}>
                <Text style={s.sectionTitle}>{meta.label} ({items.length})</Text>
                <Text style={s.sectionCaret}>{isOpen ? '▾' : '▸'}</Text>
              </TouchableOpacity>
              {isOpen && items.map(item => (
                <ItemRow
                  key={item.item_name}
                  item={item}
                  estimate={estimates[item.item_name]}
                  handled={!!itemHandledByName?.[item.item_name]}
                  accentColor={accentColor}
                  event={event}
                  navigation={navigation}
                  theme={theme}
                  s={s}
                />
              ))}
            </View>
          );
        })}

        {/* ── Per-function extras — items that apply specifically to one of
            this event's functions (Haldi/Sangeet/Reception/...), beyond
            what's already in the P1-P4 ladder above. Diffed against the
            baseline event-level resolution (hooks/useEventPlan.js), so
            nothing here duplicates what's already shown — a section only
            appears if that function actually adds or overrides something.
            Progress is real per-function progress now (bookings scoped by
            sub_event_id); the budget card only appears when the host has
            actually set a budget for that specific function — most
            functions on most events won't have one, and that's expected,
            not an empty/error state. ── */}
        {resolvedByFunction.map(fn => (
          <View key={fn.functionId} style={s.section}>
            <TouchableOpacity style={s.sectionHeader} onPress={() => toggleFunctionSection(fn.functionId)}>
              <Text style={s.sectionTitle}>For {fn.functionName} ({fn.items.length})</Text>
              <Text style={s.sectionCaret}>{openFunctionSections[fn.functionId] ? '▾' : '▸'}</Text>
            </TouchableOpacity>
            {openFunctionSections[fn.functionId] && (
              <>
                <View style={s.progressCard}>
                  <Text style={s.progressLabel}>
                    {fn.progress.p1Handled} of {fn.progress.p1Total} must-book item{fn.progress.p1Total === 1 ? '' : 's'} handled for {fn.functionName}
                  </Text>
                  <View style={s.progressTrack}>
                    <View style={[s.progressFill, { width: `${fn.progress.percentComplete}%` }]} />
                  </View>
                </View>

                {fn.allocation && (
                  <View style={s.budgetCard}>
                    <Text style={s.sectionTitle}>{fn.functionName} budget</Text>
                    <View style={s.budgetRow}>
                      <Text style={s.budgetLabel}>Function budget</Text>
                      <Text style={s.budgetValue}>₹{fn.budgetTotal.toLocaleString('en-IN')}</Text>
                    </View>
                    <View style={s.budgetRow}>
                      <Text style={s.budgetLabel}>Allocated</Text>
                      <Text style={s.budgetValue}>₹{fn.allocation.allocated.toLocaleString('en-IN')}</Text>
                    </View>
                    <View style={s.budgetRow}>
                      <View>
                        <Text style={s.budgetLabel}>{fn.allocation.contingencyLabel}</Text>
                        <Text style={s.budgetSubtext}>{fn.allocation.contingencySubtitle}</Text>
                      </View>
                      <Text style={s.budgetValue}>₹{fn.allocation.contingency.toLocaleString('en-IN')}</Text>
                    </View>
                    {fn.allocation.overBudget && (
                      <Text style={s.overBudgetNote}>Some items for {fn.functionName} don't fully fit this function's budget yet.</Text>
                    )}
                  </View>
                )}

                {fn.items.map(item => (
                  <ItemRow
                    key={item.item_name}
                    item={item}
                    estimate={estimates[item.item_name]}
                    event={event}
                    navigation={navigation}
                    theme={theme}
                    s={s}
                  />
                ))}
              </>
            )}
          </View>
        ))}

        {/* ── Budget summary ── */}
        {event.budget_total != null && (
          <View style={s.budgetCard}>
            <Text style={s.sectionTitle}>Budget</Text>
            <View style={s.budgetRow}>
              <Text style={s.budgetLabel}>Total budget</Text>
              <Text style={s.budgetValue}>₹{event.budget_total.toLocaleString('en-IN')}</Text>
            </View>
            <View style={s.budgetRow}>
              <Text style={s.budgetLabel}>Allocated</Text>
              <Text style={s.budgetValue}>₹{allocation.allocated.toLocaleString('en-IN')}</Text>
            </View>
            <View style={s.budgetRow}>
              <View>
                <Text style={s.budgetLabel}>{allocation.contingencyLabel}</Text>
                <Text style={s.budgetSubtext}>{allocation.contingencySubtitle}</Text>
              </View>
              <Text style={s.budgetValue}>₹{allocation.contingency.toLocaleString('en-IN')}</Text>
            </View>
            {allocation.overBudget && (
              <Text style={s.overBudgetNote}>Some must-book and recommended items don't fully fit this budget yet.</Text>
            )}
          </View>
        )}

        {/* ── P5 — off-ladder, visually distinct ── */}
        {(resolved.P5 || []).length > 0 && (
          <View style={[s.section, s.p5Section]}>
            <TouchableOpacity style={s.sectionHeader} onPress={() => toggleSection('P5')}>
              <Text style={s.p5Title}>You may also love... ({resolved.P5.length})</Text>
              <Text style={s.sectionCaret}>{openSections.P5 ? '▾' : '▸'}</Text>
            </TouchableOpacity>
            {openSections.P5 && resolved.P5.map(item => (
              <ItemRow
                key={item.item_name}
                item={item}
                estimate={estimates[item.item_name]}
                event={event}
                navigation={navigation}
                theme={theme}
                s={s}
              />
            ))}
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      <Modal visible={renameModal} transparent animationType="fade" onRequestClose={() => setRenameModal(false)}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Rename event</Text>
            <TextInput
              style={s.modalInput}
              value={renameInput}
              onChangeText={setRenameInput}
              placeholder="Event name"
              placeholderTextColor={theme.textTertiary}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setRenameModal(false)}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalSaveBtn} onPress={saveRename} disabled={saving}>
                {saving ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.modalSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// Step 7 scoped down from the full "icon + item name + cost + soft CTA"
// vendor card: a real per-category_slug icon set doesn't exist anywhere in
// this codebase today (getCategoryIcon()/VENDOR_TAXONOMY in
// vendorTaxonomy.js key off a different, informal category-name vocabulary
// — 'Decorators', 'Caterers' — not event_requirements.category_slug values
// like 'decor'/'catering'; passing category_slug straight in returns the
// generic 📌 fallback for nearly everything, a real mismatch, not a display
// nuance). Building a category_slug→icon map is new mapping work, not a
// presentation-only change, so it's left out here per this task's own
// explicit permission to scope down rather than force it through — see the
// report. What's still delivered: a status icon (done/pending), a warm
// tinted+bordered card once booked (Step 6), and a softer CTA on unbooked
// items — none of which touch the tap/navigation behavior below at all.
function ItemRow({ item, estimate, handled, accentColor, event, navigation, theme, s }) {
  const label = item.contextual_label || item.item_name;

  function priceText() {
    if (!estimate || estimate.available === false) {
      return estimate?.quoteOnRequest ? 'Quote on request' : 'Price unavailable yet';
    }
    return `₹${estimate.low.toLocaleString('en-IN')}–${estimate.high.toLocaleString('en-IN')}`;
  }

  return (
    <TouchableOpacity
      style={[
        s.itemRow,
        handled && { backgroundColor: accentColor + '14', borderLeftWidth: 3, borderLeftColor: accentColor },
      ]}
      onPress={() => navigation.navigate('ItemDetail', {
        eventId: event.id,
        itemName: item.item_name,
        categorySlug: item.category_slug,
        contextualLabel: item.contextual_label,
        basis: estimate?.basis,
        priceLow: estimate?.available ? estimate.low : null,
        priceHigh: estimate?.available ? estimate.high : null,
        quoteOnRequest: !!estimate?.quoteOnRequest,
      })}
    >
      <Text style={[s.itemStatusIcon, handled && { color: accentColor }]}>{handled ? '✓' : '○'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.itemName}>{label}</Text>
        <Text style={s.itemBasis}>{priceText()}{estimate?.basis ? ` · ${estimate.basis}` : ''}</Text>
      </View>
      {handled ? (
        <Text style={[s.itemBookedTag, { color: accentColor }]}>Booked</Text>
      ) : (
        <Text style={s.itemArrow}>›</Text>
      )}
    </TouchableOpacity>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    scroll: { padding: 20 },
    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    errorText: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', marginBottom: 14 },
    retryBtn: { backgroundColor: theme.btnPrimary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 11 },
    retryBtnText: { color: theme.btnPrimaryText, fontSize: 13, fontWeight: '700' },

    header: { marginBottom: 18 },
    headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    headerRightRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    backBtn: {},
    backIcon: { fontSize: 20, color: theme.text },
    calendarBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    calendarBtnText: { fontSize: 15 },
    // Step 4 — countdown hero. accentColor is either the host's own saved
    // invite design's accent (Step 2) or theme.accent — both are plain hex,
    // so '1A'/no-suffix alpha suffixes work identically either way.
    countdownHero: { borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 14 },
    countdownText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },

    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
    title: { fontSize: 22, fontWeight: '700', color: theme.text },
    // Step 8 — warm display font for the event title only, system-font
    // variants already present on every platform (no new asset/dependency):
    // Georgia ships with iOS, 'serif' resolves to a bundled serif family on
    // Android, and the web build can just name the same font-family stack.
    // Body/list text (itemName, section titles, etc.) stays on the default
    // sans-serif — this is the one deliberate contrast point, not a
    // wholesale font swap.
    titleWarm: {
      fontSize: 23, fontWeight: '700', color: theme.text,
      fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' }),
    },
    metaLine: { fontSize: 13, color: theme.textSecondary, marginBottom: 2 },

    detailsBody: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, borderTopWidth: 0.5, borderTopColor: theme.border },
    detailsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    detailsRowLabel: { fontSize: 13, color: theme.textSecondary },
    detailsRowValue: { fontSize: 13.5, fontWeight: '600', color: theme.text, flexShrink: 1, textAlign: 'right', marginLeft: 12 },
    detailsModifyBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
      marginTop: 14, marginBottom: 6, paddingVertical: 12, borderRadius: 12,
      borderWidth: 0.5, borderColor: theme.border,
    },
    detailsModifyBtnText: { fontSize: 13.5, fontWeight: '700', color: theme.text },
    detailsSaveBtn: { marginTop: 4, marginBottom: 6, paddingVertical: 13, borderRadius: 12, backgroundColor: theme.btnPrimary, alignItems: 'center' },
    detailsSaveBtnText: { fontSize: 13.5, fontWeight: '700', color: theme.btnPrimaryText },

    linkCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: theme.cardBg, borderRadius: 16, borderWidth: 0.5, borderColor: theme.border,
      paddingHorizontal: 16, paddingVertical: 14, marginBottom: 14,
    },
    linkCardIcon: { fontSize: 20 },
    linkCardTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
    linkCardSub: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
    linkCardArrow: { fontSize: 18, color: theme.textTertiary },

    progressCard: { marginBottom: 20 },
    progressLabel: { fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: 8 },
    progressTrack: { height: 8, borderRadius: 4, backgroundColor: theme.bgTertiary, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: theme.accent, borderRadius: 4 },
    // Step 5 — one-time celebratory line, deliberately just colored text, no
    // modal/animation/badge that would interrupt the host's flow.
    celebrateText: { fontSize: 12.5, fontWeight: '600', marginTop: 8 },

    section: { marginBottom: 14, backgroundColor: theme.cardBg, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border, overflow: 'hidden' },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
    sectionCaret: { fontSize: 14, color: theme.textTertiary },

    itemRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: theme.border },
    // Step 6/7 — status icon + booked tag, additive to the existing row.
    itemStatusIcon: { fontSize: 15, color: theme.textTertiary, marginRight: 10 },
    itemBookedTag: { fontSize: 11.5, fontWeight: '700', marginLeft: 8 },
    itemName: { fontSize: 13.5, fontWeight: '600', color: theme.text, marginBottom: 2 },
    itemBasis: { fontSize: 11.5, color: theme.textSecondary },
    itemArrow: { fontSize: 18, color: theme.textTertiary, marginLeft: 8 },

    budgetCard: { backgroundColor: theme.cardBg, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border, padding: 16, marginBottom: 20 },
    budgetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
    budgetLabel: { fontSize: 13, color: theme.textSecondary },
    budgetSubtext: { fontSize: 11, color: theme.textTertiary, marginTop: 2 },
    budgetValue: { fontSize: 14, fontWeight: '700', color: theme.text },
    overBudgetNote: { fontSize: 12, color: theme.accent, marginTop: 8, fontWeight: '600' },

    p5Section: { borderStyle: 'dashed', borderWidth: 1, borderColor: theme.textTertiary, backgroundColor: 'transparent' },
    p5Title: { fontSize: 13, fontWeight: '700', color: theme.textSecondary },

    overlay: { flex: 1, backgroundColor: '#00000088', alignItems: 'center', justifyContent: 'center', padding: 20 },
    modal: { backgroundColor: theme.cardBg, borderRadius: 20, padding: 22, width: '100%', maxWidth: 420 },
    modalTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 14 },
    modalInput: { backgroundColor: theme.bg, borderRadius: 12, borderWidth: 0.5, borderColor: theme.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: theme.text },
    modalCancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 0.5, borderColor: theme.border, alignItems: 'center' },
    modalCancelText: { fontSize: 13, fontWeight: '700', color: theme.text },
    modalSaveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: theme.btnPrimary, alignItems: 'center' },
    modalSaveText: { fontSize: 13, fontWeight: '700', color: theme.btnPrimaryText },
  });
}
