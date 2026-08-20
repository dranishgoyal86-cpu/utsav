import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, ActivityIndicator, ScrollView, FlatList, Linking, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { notifyTodoCompleted } from '../../notifications';
import { showAlert, confirmDestructive, deleteEventCascade, toWhatsappNumber, googleCalendarUrl } from '../../helpers';
import { resolveParentCategory } from '../../serviceTemplates';
import { buildChecklistContext } from '../../lib/checklistContext';
import AppHeader from '../../components/AppHeader';
import { resolveTodoTemplates, evaluateAutoCheckCondition } from '../../lib/todoResolver';
import SwipeableRow from '../../components/SwipeableRow';
import { registerTourTarget } from '../../lib/tourTargets';
import { useTour } from '../../hooks/useTour';
import CoachMarkTour from '../../components/CoachMarkTour';

// 3 steps, not the full 3-concept list verbatim. Step 1's investigation
// found `possibly_outdated` is genuinely data-dependent — it only renders
// on an item that's actually been flagged since context changed, which is
// almost never true on a fresh event (nothing's had a chance to go stale
// yet). Spotlighting it directly would silently skip for nearly every real
// first-time viewer, a low-value step even though the engine would handle
// it gracefully. Folded into step 2's description instead, alongside the
// (reliably present) "auto" tag explanation, rather than given its own
// step. Sections default to expanded until an item's been done (see
// isSectionCollapsed()), so a fresh event's items are genuinely mounted
// and measurable on first load — confirmed before relying on it.
const EVENTTODO_TOUR_STEPS = [
  {
    key: 'progress',
    target: 'eventtodo-progress',
    title: 'Your event checklist',
    description: 'Everything for your event, organized and tracked in one place — tap any item to mark it done.',
  },
  {
    key: 'auto-item',
    target: 'eventtodo-item-guest_list',
    title: 'Some items check themselves',
    description: 'Items tagged "auto" complete on their own as you make progress elsewhere — e.g. once your guest list exists. If your plans change later, an item might show "context changed — may not be needed" — that just means it\'s worth a second look, not that something\'s broken.',
  },
  {
    key: 'add',
    target: 'eventtodo-add-btn',
    title: 'Add anything we missed',
    description: "Didn't see something you need? Add your own item here — it works just like the built-in ones.",
  },
];
import {
  ArrowLeft, Plus, X, Check, CalendarBlank, CurrencyInr, CaretDown, CaretUp, CaretRight, PencilSimple, PaperPlaneTilt
} from 'phosphor-react-native';

// Seeded once per event the first time its to-do list is opened — a fairly
// complete run of what a host actually has to get through for an event to
// come together, not just the handful of things this app itself tracks.
// "auto" items get marked done automatically from real signals elsewhere in
// the app (guest list, RSVPs, budget, invites sent, and now confirmed
// bookings per category — see refreshAutoTodos); everything else the host
// checks off themselves. `relevantIf` is checked against the linked plan's
// saved form_data at seed time (see loadTodos) — a task with no `relevantIf`
// is always seeded, one with it is skipped when the host never asked for
// that service. Only applied when a linked plan actually exists; with no
// plan to check against, everything is seeded (better to over-show than to
// hide something arbitrarily).
const DEFAULT_ITEMS = [
  // Guests — core to every event regardless of chosen services
  { section: 'guests', category: 'guest_list', title: 'Make guest list', item_type: 'auto', kind: 'task' },
  { section: 'guests', category: 'invites', title: 'Send guest invites', item_type: 'auto', kind: 'task' },
  { section: 'guests', category: 'rsvp', title: 'Track RSVPs', item_type: 'auto', kind: 'task' },
  { section: 'guests', category: 'rsvp_followup', title: 'Follow up with non-responders', item_type: 'manual', kind: 'task' },
  { section: 'guests', category: 'seating', title: 'Plan seating arrangement', item_type: 'manual', kind: 'task' },
  // Venue & logistics
  { section: 'venue', category: 'venue', title: 'Confirm venue', item_type: 'auto', kind: 'confirmation', relevantIf: f => f.location === 'venue' },
  { section: 'venue', category: 'venue_visit', title: 'Venue site visit', item_type: 'manual', kind: 'appointment', relevantIf: f => f.location === 'venue' },
  { section: 'venue', category: 'transport', title: 'Arrange parking & transport', item_type: 'auto', kind: 'task' },
  { section: 'venue', category: 'accommodation', title: 'Book guest accommodation', item_type: 'auto', kind: 'task' },
  // Vendors & services — gated on the matching "What do you need?" toggle from planning
  { section: 'vendors', category: 'vendor_chat', title: 'Chat with vendors', item_type: 'manual', kind: 'task' },
  { section: 'vendors', category: 'photography', title: 'Finalize photographer & videographer', item_type: 'auto', kind: 'confirmation', relevantIf: f => f.needsPhotography },
  { section: 'vendors', category: 'catering', title: 'Food tasting', item_type: 'manual', kind: 'appointment', relevantIf: f => f.needsCatering },
  { section: 'vendors', category: 'decor', title: 'Decor meeting', item_type: 'manual', kind: 'appointment', relevantIf: f => f.needsDecoration },
  { section: 'vendors', category: 'music', title: 'Book DJ & music', item_type: 'auto', kind: 'confirmation', relevantIf: f => f.needsMusic },
  { section: 'vendors', category: 'beauty', title: 'Book makeup & mehendi artist', item_type: 'auto', kind: 'confirmation', relevantIf: f => f.needsMakeup || f.needsMehendi },
  { section: 'vendors', category: 'contracts', title: 'Sign vendor contracts', item_type: 'auto', kind: 'confirmation' },
  // Budget & payments — every event has a budget, always relevant
  { section: 'finance', category: 'budget', title: 'Budget check', item_type: 'auto', kind: 'task' },
  { section: 'finance', category: 'advance_payment', title: 'Pay vendor advances', item_type: 'auto', kind: 'payment' },
  { section: 'finance', category: 'final_payment', title: 'Clear final vendor payments', item_type: 'auto', kind: 'payment' },
  // Day-of prep
  { section: 'dayof', category: 'headcount', title: 'Confirm final headcount with caterer', item_type: 'manual', kind: 'task', relevantIf: f => f.needsCatering },
  { section: 'dayof', category: 'rehearsal', title: 'Rehearsal / run-through', item_type: 'manual', kind: 'appointment' },
  { section: 'dayof', category: 'coordinator', title: 'Assign a day-of coordinator', item_type: 'manual', kind: 'task' },
  { section: 'dayof', category: 'emergency_kit', title: 'Prepare an emergency kit', item_type: 'manual', kind: 'task' },
  // Wrap-up
  { section: 'wrapup', category: 'thankyou', title: 'Send thank-you notes', item_type: 'manual', kind: 'task' },
  { section: 'wrapup', category: 'vendor_review', title: 'Review & rate vendors', item_type: 'auto', kind: 'task' },
  { section: 'wrapup', category: 'final_settlement', title: 'Settle any remaining payments', item_type: 'auto', kind: 'payment' },
];

const CATEGORY_ICONS = {
  guest_list: '👥', invites: '🎨', rsvp: '📋', rsvp_followup: '📨', seating: '🪑',
  venue: '📍', venue_visit: '🚶', transport: '🚗', accommodation: '🏨',
  vendor_chat: '💬', photography: '📸', catering: '🍽️', decor: '🎊', music: '🎵', beauty: '💄', beauty_mehendi: '🌿', beauty_makeup: '💄', contracts: '📄',
  budget: '💰', advance_payment: '💵', final_payment: '💵',
  headcount: '🔢', rehearsal: '🎬', coordinator: '🧑‍💼', emergency_kit: '🧰',
  thankyou: '💌', vendor_review: '⭐', final_settlement: '🧾',
  custom: '📌',
};

// Broad phases of planning an event — the top-level hierarchy. Each item
// still carries its own task/appointment/payment/confirmation "kind" (shown
// as a badge once you open it), but grouping by phase is what actually keeps
// a ~25-item checklist navigable instead of one long flat list.
const SECTION_META = {
  guests: { label: 'Guest Management', color: '#5B8DEF' },
  venue: { label: 'Venue & Logistics', color: '#9C6ADE' },
  vendors: { label: 'Vendors & Services', color: '#E8A020' },
  finance: { label: 'Budget & Payments', color: '#2E7D32' },
  dayof: { label: 'Day-of Prep', color: '#F44336' },
  wrapup: { label: 'Wrap-up', color: '#607D8B' },
  custom: { label: 'Custom', color: '#9E9E9E' },
};
const SECTION_ORDER = ['guests', 'venue', 'vendors', 'finance', 'dayof', 'wrapup', 'custom'];

const KIND_META = {
  task: { label: 'Task', color: '#5B8DEF', bg: '#5B8DEF18' },
  appointment: { label: 'Appointment', color: '#9C6ADE', bg: '#9C6ADE18' },
  payment: { label: 'Payment', color: '#2E7D32', bg: '#2E7D3218' },
  confirmation: { label: 'Confirmation', color: '#E8A020', bg: '#E8A02018' },
};
const KIND_OPTIONS = ['task', 'appointment', 'payment', 'confirmation'];

// Categories that map onto a real screen elsewhere in the app — tapping
// these navigates straight there instead of expanding in place, so "visit
// the task" means what it says. Every handler gets (navigation, event, plan)
// — `plan` is the saved_plans row already fetched once in loadTodos (see
// linkedPlan state), not re-fetched per tap. Categories with no dedicated
// screen (seating, emergency_kit, appointments) fall back to the inline
// expand — but "leave a note" via the edit-details action is a real
// provision too, not every task needs its own screen.
const CATEGORY_SCREENS = {
  guest_list: (navigation, event) => navigation.navigate('GuestList', { event }),
  rsvp: (navigation, event) => navigation.navigate('GuestList', { event }),
  rsvp_followup: (navigation, event) => navigation.navigate('GuestList', { event }),
  invites: (navigation, event) => navigation.navigate('GuestList', { event, openDesigner: true }),
  headcount: (navigation, event) => navigation.navigate('GuestList', { event }),
  seating: (navigation, event) => navigation.navigate('SeatingChart', { eventId: event.id }),
  vendor_chat: (navigation, event) => navigation.navigate('PersonalVendors', { eventTitle: event.name }),
  // A day-of coordinator is usually someone the host already knows (family,
  // friend, planner) rather than a marketplace find — PersonalVendors' "add
  // anyone doing a job for planning sake" flow (see the Discover vendor-merge
  // work) fits this better than a category browse.
  coordinator: (navigation, event) => navigation.navigate('PersonalVendors', { eventTitle: event.name }),
  budget: (navigation, event, plan) => {
    if (plan) navigation.navigate('EventPlanner', { savedPlan: plan });
    else showAlert('No saved plan linked', 'Create a plan from the Plan tab for this event to track budget here.');
  },
  // Vendor-category tasks: browse Discover pre-filtered to the matching
  // top-level category, so "finalize a photographer" means what it says
  // instead of just expanding a checkbox with no way to act on it.
  venue: (navigation, event, plan) => navigation.navigate('CustomerTabs', { screen: 'Discover', params: { presetCategory: 'Venues', savedPlanId: plan?.id, eventTitle: event.name } }),
  transport: (navigation, event, plan) => navigation.navigate('CustomerTabs', { screen: 'Discover', params: { presetCategory: 'Logistics & Transport', savedPlanId: plan?.id, eventTitle: event.name } }),
  accommodation: (navigation, event, plan) => navigation.navigate('CustomerTabs', { screen: 'Discover', params: { presetCategory: 'Accommodation', savedPlanId: plan?.id, eventTitle: event.name } }),
  photography: (navigation, event, plan) => navigation.navigate('CustomerTabs', { screen: 'Discover', params: { presetCategory: 'Photography & Videography', savedPlanId: plan?.id, eventTitle: event.name } }),
  music: (navigation, event, plan) => navigation.navigate('CustomerTabs', { screen: 'Discover', params: { presetCategory: 'Entertainment', savedPlanId: plan?.id, eventTitle: event.name } }),
  beauty: (navigation, event, plan) => navigation.navigate('CustomerTabs', { screen: 'Discover', params: { presetCategory: 'Wedding Services', savedPlanId: plan?.id, eventTitle: event.name } }),
  beauty_mehendi: (navigation, event, plan) => navigation.navigate('CustomerTabs', { screen: 'Discover', params: { presetCategory: 'Wedding Services', savedPlanId: plan?.id, eventTitle: event.name } }),
  beauty_makeup: (navigation, event, plan) => navigation.navigate('CustomerTabs', { screen: 'Discover', params: { presetCategory: 'Wedding Services', savedPlanId: plan?.id, eventTitle: event.name } }),
  // Payment/contract/review tasks: this app's "contract" is the confirmed
  // booking record itself, and payment is charged in full at booking time
  // (no separate advance/final split in the actual flow) — Bookings is the
  // one real place these are ever actually tracked.
  contracts: (navigation, event, plan) => navigation.navigate('CustomerTabs', { screen: 'Bookings', params: { savedPlanId: plan?.id, planTitle: event.name } }),
  advance_payment: (navigation, event, plan) => navigation.navigate('CustomerTabs', { screen: 'Bookings', params: { savedPlanId: plan?.id, planTitle: event.name } }),
  final_payment: (navigation, event, plan) => navigation.navigate('CustomerTabs', { screen: 'Bookings', params: { savedPlanId: plan?.id, planTitle: event.name } }),
  final_settlement: (navigation, event, plan) => navigation.navigate('CustomerTabs', { screen: 'Bookings', params: { savedPlanId: plan?.id, planTitle: event.name } }),
  vendor_review: (navigation, event, plan) => navigation.navigate('CustomerTabs', { screen: 'Bookings', params: { savedPlanId: plan?.id, planTitle: event.name, initialTab: 'past' } }),
};

// Booking-status signals that let auto-complete "verify if the task was
// done by the vendor" instead of taking the host's word for it — a provider
// accepting a booking (status leaves payment_pending) is the vendor's own
// confirmation, which is exactly what "Finalize photographer", "Book DJ" etc.
// are really asking to check off.
const CONFIRMED_STATUSES = ['confirmed', 'completed', 'reviewed'];
const SETTLED_STATUSES = ['completed', 'reviewed', 'declined', 'cancelled'];
// Same top-level categories as CATEGORY_SCREENS above, restricted to the
// ones where "a confirmed booking exists in this category" is an honest
// completion signal (catering/decor are appointment tasks about a tasting
// or meeting, not about the booking existing, so they're deliberately absent).
const BOOKING_TOP_CATEGORY = {
  venue: 'Venues',
  transport: 'Logistics & Transport',
  accommodation: 'Accommodation',
  photography: 'Photography & Videography',
  music: 'Entertainment',
};
// 'Wedding Services' (beauty's browse target) also covers pandits, planners
// etc., which would false-positive a "makeup & mehendi" checkbox — matched
// against the exact subcategory instead of the whole parent category.
// Split to match event_todo_templates' beauty_mehendi/beauty_makeup rows
// (see supabase/migrations/event_todo_templates.sql) — the old combined
// `beauty` category/check stays below too, for events still running on the
// pre-migration DEFAULT_ITEMS seed.
const MEHENDI_SUBCATEGORIES = ['Mehendi Artists'];
const MAKEUP_SUBCATEGORIES = ['Bridal Makeup Artists', 'Makeup Artists'];
const BEAUTY_SUBCATEGORIES = [...MEHENDI_SUBCATEGORIES, ...MAKEUP_SUBCATEGORIES];

export default function EventTodo({ route, navigation }) {
  const { event: routeEvent, todoId, forceTour } = route.params || {};
  const { theme } = useTheme();
  const s = styles(theme);

  const eventTodoTour = useTour('eventtodo_intro');
  useEffect(() => {
    if (forceTour === 'eventtodo_intro') {
      eventTodoTour.forceRestart();
    } else if (eventTodoTour.checked) {
      eventTodoTour.startTour();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventTodoTour.checked, forceTour]);
  const progressCardRef = useRef(null);
  const addBtnRef = useRef(null);
  const guestListItemRef = useRef(null);
  useEffect(() => {
    registerTourTarget('eventtodo-progress', progressCardRef);
    registerTourTarget('eventtodo-add-btn', addBtnRef);
    registerTourTarget('eventtodo-item-guest_list', guestListItemRef);
  }, []);

  // Reached with a specific event — use it directly. Reached standalone from
  // Tools — pick which event's checklist to open first.
  const [pickedEvent, setPickedEvent] = useState(null);
  const baseEvent = routeEvent || pickedEvent;

  // baseEvent can be a stale snapshot cached by whatever screen navigated
  // here before an intervening rename (EventPlanner's rename-on-blur,
  // GuestList's rename modal) — re-fetch the name directly rather than
  // trusting it, same fix as GuestList.js's displayName. Overlaying it onto
  // a fresh object (not a separate display string) means every downstream
  // use of event.name — the header, notifications, the thank-you message,
  // and the eventTitle/planTitle forwarded to other screens via
  // CATEGORY_SCREENS below — all get corrected for free.
  const [freshEventName, setFreshEventName] = useState(null);
  useEffect(() => {
    setFreshEventName(null);
    if (!baseEvent?.id) return;
    supabase.from('events').select('name').eq('id', baseEvent.id).maybeSingle()
      .then(({ data }) => { if (data?.name) setFreshEventName(data.name); });
  }, [baseEvent?.id]);
  const event = baseEvent && freshEventName ? { ...baseEvent, name: freshEventName } : baseEvent;

  const [eventsList, setEventsList] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(!routeEvent);
  const [userId, setUserId] = useState(null);

  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  // The saved_plans row linked to this event, if any — drives both which
  // default items were relevant enough to seed (loadTodos) and which
  // savedPlanId/plan gets handed to CATEGORY_SCREENS handlers.
  const [linkedPlan, setLinkedPlan] = useState(null);

  const [itemModal, setItemModal] = useState(false);
  const [itemForm, setItemForm] = useState({ title: '', kind: 'task', scheduledAt: '', amount: '', notes: '' });
  const [editingItemId, setEditingItemId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Hierarchy: sections collapse/expand (undefined = default to "collapsed if
  // everything in it is already done"), and at most one item is expanded in
  // place at a time — keeps the list quiet until you actually need something.
  const [collapsedSections, setCollapsedSections] = useState({});
  const [expandedItemId, setExpandedItemId] = useState(null);

  // ── Thank-you notes tool (wrapup/thankyou) ──
  const [thankYouModal, setThankYouModal] = useState(false);
  const [thankYouMessage, setThankYouMessage] = useState('');
  const [thankYouGuests, setThankYouGuests] = useState([]);
  const [thankYouGuestsLoading, setThankYouGuestsLoading] = useState(false);
  const [thankYouSentIds, setThankYouSentIds] = useState(new Set());

  // Same picker->list-via-local-state situation as GuestList — without this,
  // back navigation from a picked event would skip the picker entirely.
  // Must check action.type === 'GO_BACK' specifically — 'beforeRemove' also
  // fires when a CATEGORY_SCREENS handler navigates to a tab (Discover,
  // Bookings) that's already lower in the stack, since that pops back to it
  // and removes EventTodo too. Without this check, every such handler
  // silently got cancelled and bounced back to the picker instead — found
  // via a real tap on "Sign vendor contracts" landing back on the picker
  // instead of Bookings.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (pickedEvent && e.data.action.type === 'GO_BACK') {
        e.preventDefault();
        setPickedEvent(null);
      }
    });
    return unsubscribe;
  }, [navigation, pickedEvent]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return;
      setUserId(data.user.id);
      if (routeEvent) {
        loadTodos(data.user.id, routeEvent);
      } else {
        setLoading(false);
        fetchMyEvents(data.user.id);
      }
    });
  }, []);

  async function fetchMyEvents(uid) {
    try {
      const { data, error } = await supabase
        .from('events').select('*').eq('host_id', uid).order('created_at', { ascending: false });
      if (error) throw error;
      setEventsList(data || []);
    } catch (err) {
      console.log('fetchMyEvents error:', err.message);
    } finally {
      setEventsLoading(false);
    }
  }

  function choosePickedEvent(chosen) {
    setPickedEvent(chosen);
    setLoading(true);
    loadTodos(userId, chosen);
  }

  // Same bundle as GuestList.js's "Delete guest list": this event's guest
  // list, invites, and checklist all share its name and only make sense tied
  // to it, so deleting any one of them from its own picker takes the whole
  // bundle with it — the photo album is the one exception, always kept.
  function deleteChecklist(forEvent) {
    confirmDestructive(
      'Delete this checklist?',
      `This permanently deletes "${forEvent.name}"'s checklist, guest list, and invites. Its photo album is kept. This cannot be undone.`,
      'Delete',
      async () => {
        try {
          await deleteEventCascade(forEvent.id);
          setEventsList(prev => prev.filter(e => e.id !== forEvent.id));
        } catch (err) {
          showAlert('Error', err.message);
        }
      }
    );
  }

  async function loadTodos(uid, forEvent) {
    try {
      const [{ data, error }, { data: plans }] = await Promise.all([
        supabase.from('event_todos').select('*').eq('event_id', forEvent.id).order('created_at', { ascending: true }),
        supabase.from('saved_plans').select('*').eq('event_id', forEvent.id).limit(1),
      ]);
      if (error) throw error;
      const plan = plans?.[0] || null;
      setLinkedPlan(plan);

      let list = data || [];
      const formData = plan?.form_data || null;

      // Context-aware re-sync (event_todo_templates + template_id/
      // possibly_outdated on event_todos — see supabase/migrations/
      // event_todo_templates.sql, printed, not applied automatically).
      // Everything in this block is wrapped defensively: if that migration
      // hasn't landed yet, it throws early (event_todo_templates doesn't
      // exist) and falls through to the original one-time DEFAULT_ITEMS
      // seed below, unchanged — existing hosts keep working exactly as
      // before until it's pasted.
      let templates = [];
      let checklistContext = null;
      let syncedViaTemplates = false;
      try {
        const { data: templateRows, error: templatesError } = await supabase.from('event_todo_templates').select('*');
        if (templatesError) throw templatesError;
        templates = templateRows || [];

        const [{ data: functionsRows }, { data: invitees }] = await Promise.all([
          supabase.from('event_functions').select('id, source_sub_event_id').eq('event_id', forEvent.id),
          supabase.from('event_invitees').select('is_outstation').eq('event_id', forEvent.id),
        ]);

        const sourceSubEventIds = [...new Set((functionsRows || []).map(f => f.source_sub_event_id).filter(Boolean))];
        let subEventSlugById = {};
        if (sourceSubEventIds.length > 0) {
          const { data: subEventRows } = await supabase.from('sub_events').select('id, slug').in('id', sourceSubEventIds);
          (subEventRows || []).forEach(se => { subEventSlugById[se.id] = se.slug; });
        }
        const eventFunctionSlugs = (functionsRows || []).map(f => subEventSlugById[f.source_sub_event_id]).filter(Boolean);

        let venueRow = null;
        if (forEvent.venue_id) {
          const { data: v } = await supabase.from('venues').select('*').eq('id', forEvent.venue_id).maybeSingle();
          venueRow = v || null;
        }
        checklistContext = buildChecklistContext(forEvent, venueRow, invitees || [], formData);

        // Backward-compat backfill: an event already seeded by the OLD
        // one-time DEFAULT_ITEMS path has rows with template_id null. Link
        // them to their matching template by category (identical strings
        // for every item except `beauty`, split below) so the diff
        // recognizes them as already covering that template instead of
        // inserting a duplicate. `beauty` has no 1:1 match post-split — that
        // one old row is deliberately left unlinked (becomes a de facto
        // custom item); the two new split templates still resolve fresh
        // alongside it. Known one-time transition artifact, not fixable
        // without deleting a host's existing task, which the re-sync
        // contract explicitly forbids.
        const templatesByCategory = {};
        templates.filter(t => t.sub_event_slug == null).forEach(t => { templatesByCategory[t.category] = t; });
        const toBackfill = list.filter(t => !t.template_id && templatesByCategory[t.category]);
        if (toBackfill.length > 0) {
          await Promise.all(toBackfill.map(t =>
            supabase.from('event_todos').update({ template_id: templatesByCategory[t.category].id }).eq('id', t.id)
          ));
          const backfillMap = {};
          toBackfill.forEach(t => { backfillMap[t.id] = templatesByCategory[t.category].id; });
          list = list.map(t => backfillMap[t.id] ? { ...t, template_id: backfillMap[t.id] } : t);
        }

        const resolved = resolveTodoTemplates(templates, checklistContext, eventFunctionSlugs, formData);
        const resolvedIds = new Set(resolved.map(t => t.id));
        const existingTemplateIds = new Set(list.filter(t => t.template_id).map(t => t.template_id));

        const toInsert = resolved
          .filter(t => !existingTemplateIds.has(t.id))
          .map(t => ({
            event_id: forEvent.id, host_id: uid, template_id: t.id,
            section: t.section, category: t.category, title: t.title,
            item_type: t.item_type, kind: t.kind,
            status: evaluateAutoCheckCondition(t.auto_check_condition, checklistContext) ? 'done' : 'pending',
          }));
        if (toInsert.length > 0) {
          const { data: inserted, error: insertError } = await supabase.from('event_todos').insert(toInsert).select();
          if (insertError) throw insertError;
          list = [...list, ...(inserted || [])];
        }

        // possibly_outdated tracks CURRENT relevance, not history — it
        // clears itself the moment a template resolves again on a later
        // sync, same as it sets itself the moment one stops resolving.
        // Applies to every template-backed row regardless of status (done
        // or pending) — the flag is informational either way. Never touches
        // rows with no template_id (a host's own custom todos), never
        // deletes anything.
        const toFlag = [];
        const toClear = [];
        list.forEach(t => {
          if (!t.template_id) return;
          const stillResolves = resolvedIds.has(t.template_id);
          if (!stillResolves && !t.possibly_outdated) toFlag.push(t.id);
          if (stillResolves && t.possibly_outdated) toClear.push(t.id);
        });
        if (toFlag.length > 0) {
          await supabase.from('event_todos').update({ possibly_outdated: true }).in('id', toFlag);
          list = list.map(t => toFlag.includes(t.id) ? { ...t, possibly_outdated: true } : t);
        }
        if (toClear.length > 0) {
          await supabase.from('event_todos').update({ possibly_outdated: false }).in('id', toClear);
          list = list.map(t => toClear.includes(t.id) ? { ...t, possibly_outdated: false } : t);
        }
        syncedViaTemplates = true;
      } catch (templateErr) {
        console.log('event_todo_templates sync skipped (migration likely not applied yet):', templateErr.message);
      }

      // Original one-time DEFAULT_ITEMS seed — only runs when the new
      // template system isn't available yet AND this event has zero rows,
      // exactly the prior behavior, unchanged.
      if (!syncedViaTemplates && list.length === 0) {
        const seeded = DEFAULT_ITEMS
          .filter(d => !formData || !d.relevantIf || d.relevantIf(formData))
          .map(({ relevantIf, ...d }) => ({ ...d, event_id: forEvent.id, host_id: uid, status: 'pending' }));
        const { data: inserted, error: seedError } = await supabase.from('event_todos').insert(seeded).select();
        if (seedError) throw seedError;
        list = inserted || [];
      }
      setTodos(list);
      refreshAutoTodos(forEvent, list, plan, templates, checklistContext);

      // Reached from a "reminder" notification for one specific item — jump
      // straight to acting on it instead of leaving the host to find it in
      // the list themselves.
      if (todoId) {
        const target = list.find(t => t.id === todoId);
        if (target) handleRowPress(target, plan);
      }
    } catch (err) {
      console.log('loadTodos error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  // Checks real signals from other parts of the app and auto-completes
  // matching pending items — this is what makes it track activity instead of
  // being just another static checklist. Doesn't run for items already done.
  async function refreshAutoTodos(forEvent, list, plan, templates = [], checklistContext = null) {
    try {
      const toComplete = [];

      const guestListItem = list.find(t => t.category === 'guest_list' && t.status === 'pending');
      const rsvpItem = list.find(t => t.category === 'rsvp' && t.status === 'pending');
      if (guestListItem || rsvpItem) {
        const { data: guests } = await supabase
          .from('event_invitees').select('rsvp_status').eq('event_id', forEvent.id);
        if (guestListItem && (guests?.length || 0) > 0) toComplete.push(guestListItem.id);
        if (rsvpItem && (guests || []).some(g => g.rsvp_status !== 'pending')) toComplete.push(rsvpItem.id);
      }

      // Real gap found in the earlier inventory: `invites` was tagged
      // item_type:'auto' but had NO live-signal check at all. events.
      // invites_sent_at is the existing, already-reliable signal (stamped
      // once by GuestList.js the first time the host actually shares an
      // invite — see markInvitesSent()/the invites_sent_at update there,
      // also what the rsvp-reminders cron already reads) — simpler and more
      // established than checking every guest row's own invite_sent_at.
      const invitesItem = list.find(t => t.category === 'invites' && t.status === 'pending');
      if (invitesItem && forEvent.invites_sent_at) toComplete.push(invitesItem.id);

      // New in this pass: any pending row whose template carries a live-
      // context auto_check_condition (lib/todoResolver.js's registry — e.g.
      // 'is_home_venue' for venue/venue_visit) gets evaluated here, on top
      // of the category-specific signal checks below. Generic by design so
      // a future template with a new auto_check_condition doesn't need a
      // new bespoke block here, just a registry entry in todoResolver.js.
      if (checklistContext && templates.length > 0) {
        const templatesById = {};
        templates.forEach(t => { templatesById[t.id] = t; });
        list.forEach(t => {
          if (t.status !== 'pending' || !t.template_id) return;
          const tmpl = templatesById[t.template_id];
          if (tmpl?.auto_check_condition && evaluateAutoCheckCondition(tmpl.auto_check_condition, checklistContext)) {
            toComplete.push(t.id);
          }
        });
      }

      const budgetItem = list.find(t => t.category === 'budget' && t.status === 'pending');
      if (budgetItem) {
        const { data: plans } = await supabase
          .from('saved_plans').select('total_budget').eq('event_id', forEvent.id).not('total_budget', 'is', null);
        if ((plans?.length || 0) > 0) toComplete.push(budgetItem.id);
      }

      // Verify-if-done-by-vendor: a real booking's own status (the provider
      // accepting it, or later completing/being reviewed) is a stronger
      // signal than the host just checking a box — every category below
      // only auto-completes off a booking that's actually reached that state.
      if (plan) {
        const { data: planBookings } = await supabase
          .from('bookings').select('id, provider_id, service_id, status').eq('saved_plan_id', plan.id);

        if ((planBookings?.length || 0) > 0) {
          const confirmedBookings = planBookings.filter(b => CONFIRMED_STATUSES.includes(b.status));
          if (confirmedBookings.length > 0) {
            const providerIds = [...new Set(confirmedBookings.map(b => b.provider_id))];
            const { data: bookedProviders } = await supabase
              .from('providers').select('id, category').in('id', providerIds);

            // The actual booked SERVICE's subcategory (services.category is
            // always subcategory-level) — not the provider's own category,
            // which now stores the parent and can't tell "Mehendi Artists"
            // apart from any other subcategory under the same parent.
            const serviceIds = [...new Set(confirmedBookings.map(b => b.service_id).filter(Boolean))];
            const { data: bookedServices } = serviceIds.length
              ? await supabase.from('services').select('id, category').in('id', serviceIds)
              : { data: [] };

            const confirmedTopCats = new Set();
            const confirmedSubCats = new Set();
            (bookedProviders || []).forEach(p => {
              // resolveParentCategory: p.category may be the new parent-level
              // value or an old subcategory-level one (no bulk migration).
              const top = resolveParentCategory(p.category);
              if (top) confirmedTopCats.add(top);
            });
            (bookedServices || []).forEach(sv => { if (sv.category) confirmedSubCats.add(sv.category); });

            Object.entries(BOOKING_TOP_CATEGORY).forEach(([cat, topCat]) => {
              const item = list.find(t => t.category === cat && t.status === 'pending');
              if (item && confirmedTopCats.has(topCat)) toComplete.push(item.id);
            });

            // Old combined category — still checked for events running on
            // the pre-migration DEFAULT_ITEMS seed (template system unavailable
            // or this row predates the split's backfill).
            const beautyItem = list.find(t => t.category === 'beauty' && t.status === 'pending');
            if (beautyItem && BEAUTY_SUBCATEGORIES.some(sc => confirmedSubCats.has(sc))) toComplete.push(beautyItem.id);

            // New split categories (event_todo_templates' beauty_mehendi/
            // beauty_makeup) — each checks only its own subcategory set,
            // unlike the combined check above.
            const beautyMehendiItem = list.find(t => t.category === 'beauty_mehendi' && t.status === 'pending');
            if (beautyMehendiItem && MEHENDI_SUBCATEGORIES.some(sc => confirmedSubCats.has(sc))) toComplete.push(beautyMehendiItem.id);
            const beautyMakeupItem = list.find(t => t.category === 'beauty_makeup' && t.status === 'pending');
            if (beautyMakeupItem && MAKEUP_SUBCATEGORIES.some(sc => confirmedSubCats.has(sc))) toComplete.push(beautyMakeupItem.id);

            const contractsItem = list.find(t => t.category === 'contracts' && t.status === 'pending');
            if (contractsItem) toComplete.push(contractsItem.id);

            const advanceItem = list.find(t => t.category === 'advance_payment' && t.status === 'pending');
            if (advanceItem) toComplete.push(advanceItem.id);
          }

          const allSettled = planBookings.every(b => SETTLED_STATUSES.includes(b.status));
          if (allSettled) {
            const finalPaymentItem = list.find(t => t.category === 'final_payment' && t.status === 'pending');
            if (finalPaymentItem) toComplete.push(finalPaymentItem.id);
            const finalSettlementItem = list.find(t => t.category === 'final_settlement' && t.status === 'pending');
            if (finalSettlementItem) toComplete.push(finalSettlementItem.id);
          }

          const completedBookings = planBookings.filter(b => b.status === 'completed' || b.status === 'reviewed');
          const allReviewed = completedBookings.length > 0 && completedBookings.every(b => b.status === 'reviewed');
          if (allReviewed) {
            const reviewItem = list.find(t => t.category === 'vendor_review' && t.status === 'pending');
            if (reviewItem) toComplete.push(reviewItem.id);
          }
        }
      }

      if (toComplete.length > 0) {
        await supabase.from('event_todos')
          .update({ status: 'done', updated_at: new Date().toISOString() }).in('id', toComplete);
        setTodos(prev => prev.map(t => toComplete.includes(t.id) ? { ...t, status: 'done' } : t));
        toComplete.forEach(id => {
          const completedItem = list.find(t => t.id === id);
          if (completedItem) notifyTodoCompleted(completedItem.host_id, forEvent.name, completedItem.title, forEvent.id);
        });
      }
    } catch (err) {
      console.log('refreshAutoTodos error:', err.message);
    }
  }

  async function toggleTodo(item) {
    const next = item.status === 'done' ? 'pending' : 'done';
    setTodos(prev => prev.map(t => t.id === item.id ? { ...t, status: next } : t));
    await supabase.from('event_todos').update({ status: next, updated_at: new Date().toISOString() }).eq('id', item.id);
    if (next === 'done') notifyTodoCompleted(item.host_id, event.name, item.title, event.id);
  }

  // Row tap: navigate straight to the relevant screen when the category maps
  // to one, open the thank-you tool in place for that one special case,
  // otherwise expand the row in place to reveal its details — either way
  // this is "visit and act on the incomplete task," not just check a box.
  function handleRowPress(item, planOverride) {
    const screenHandler = CATEGORY_SCREENS[item.category];
    if (screenHandler) {
      screenHandler(navigation, event, planOverride !== undefined ? planOverride : linkedPlan);
      return;
    }
    if (item.category === 'thankyou') {
      openThankYouModal();
      return;
    }
    setExpandedItemId(prev => prev === item.id ? null : item.id);
  }

  function toggleSection(section) {
    setCollapsedSections(prev => ({ ...prev, [section]: !isSectionCollapsed(section) }));
  }

  function isSectionCollapsed(section) {
    if (collapsedSections[section] !== undefined) return collapsedSections[section];
    const items = todos.filter(t => t.section === section);
    return items.length > 0 && items.every(t => t.status === 'done');
  }

  function deleteTodo(item) {
    confirmDestructive('Remove this item?', item.title, 'Remove', async () => {
      setTodos(prev => prev.filter(t => t.id !== item.id));
      await supabase.from('event_todos').delete().eq('id', item.id);
    });
  }

  function openAddItem() {
    setEditingItemId(null);
    setItemForm({ title: '', kind: 'task', scheduledAt: '', amount: '', notes: '' });
    setItemModal(true);
  }

  // The generic provision for tasks with no dedicated screen (seating,
  // coordinator, emergency kit, appointment scheduling) — recording what's
  // actually planned/confirmed is a legitimate way to "perform" an
  // administrative task, not every category needs its own new tool.
  function openEditItem(item) {
    setEditingItemId(item.id);
    setItemForm({
      title: item.title,
      kind: item.kind || 'task',
      scheduledAt: item.scheduled_at || '',
      amount: item.amount ? String(item.amount) : '',
      notes: item.notes || '',
    });
    setItemModal(true);
  }

  async function saveItem() {
    if (!itemForm.title.trim()) {
      showAlert('Required', 'Enter a title.');
      return;
    }
    setSaving(true);
    try {
      const shared = {
        title: itemForm.title.trim(),
        kind: itemForm.kind,
        scheduled_at: itemForm.scheduledAt.trim() || null,
        amount: itemForm.kind === 'payment' && itemForm.amount ? parseFloat(itemForm.amount) : null,
        notes: itemForm.notes.trim() || null,
      };

      if (editingItemId) {
        const { data, error } = await supabase
          .from('event_todos').update(shared).eq('id', editingItemId).select().single();
        if (error) throw error;
        setTodos(prev => prev.map(t => t.id === editingItemId ? data : t));
      } else {
        const payload = {
          ...shared,
          event_id: event.id,
          host_id: userId,
          category: 'custom',
          section: 'custom',
          item_type: 'manual',
          status: 'pending',
        };
        const { data, error } = await supabase.from('event_todos').insert(payload).select().single();
        if (error) throw error;
        setTodos(prev => [...prev, data]);
      }
      setItemModal(false);
      setEditingItemId(null);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Thank-you notes — the concrete gap that started this whole pass:
  // "Send thank-you notes" had a checkbox but no way to actually do it.
  // Mirrors GuestList's WhatsApp queue modal (wa.me per guest, one at a
  // time — WhatsApp only lets one chat open at once) rather than inventing
  // a new send mechanism, targeted at guests who RSVP'd yes (the closest
  // signal this app has to "attended").
  async function openThankYouModal() {
    setThankYouMessage(`Hi {name}! 🙏\n\nThank you so much for being part of ${event.name} — it truly meant a lot to have you there. Hope you had a wonderful time!`);
    setThankYouSentIds(new Set());
    setThankYouModal(true);
    setThankYouGuestsLoading(true);
    try {
      const { data } = await supabase
        .from('event_invitees').select('*').eq('event_id', event.id).eq('rsvp_status', 'yes');
      setThankYouGuests(data || []);
    } catch (err) {
      console.log('openThankYouModal error:', err.message);
    } finally {
      setThankYouGuestsLoading(false);
    }
  }

  function sendThankYouTo(guest) {
    const number = toWhatsappNumber(guest.phone);
    if (!number) {
      showAlert('No phone number', `${guest.name} doesn't have a valid phone number saved.`);
      return;
    }
    const personalized = thankYouMessage.replace('{name}', guest.name);
    const url = `https://wa.me/${number}?text=${encodeURIComponent(personalized)}`;
    Linking.openURL(url).catch(() => {
      showAlert('Could not open WhatsApp', 'Make sure WhatsApp is installed.');
    });
    setThankYouSentIds(prev => new Set(prev).add(guest.id));
  }

  function markThankYouDone() {
    setThankYouModal(false);
    const item = todos.find(t => t.category === 'thankyou' && t.status === 'pending');
    if (item) toggleTodo(item);
  }

  // Appointment-kind items (venue visit, food tasting, decor meeting,
  // rehearsal) don't map onto a marketplace screen — putting the date on
  // the host's own calendar is the real, useful action for these. scheduled_at
  // is free text ("12 Aug, 4:00 PM" per the field's own placeholder hint),
  // not a guaranteed-parseable date, so this can't assume it always works.
  function addAppointmentToCalendar(item) {
    const parsed = new Date(item.scheduled_at);
    if (isNaN(parsed.getTime())) {
      showAlert('Can\'t read that date', `"${item.scheduled_at}" isn't in a format a calendar understands — try something like "12 Aug, 4:00 PM".`);
      return;
    }
    Linking.openURL(googleCalendarUrl({
      title: `${item.title} — ${event.name}`,
      date: parsed,
      details: item.notes || '',
      location: '',
    }));
  }

  const doneCount = todos.filter(t => t.status === 'done').length;
  const progress = todos.length > 0 ? doneCount / todos.length : 0;

  // Reached standalone — pick which event's checklist to view.
  if (!event) {
    return (
      <SafeAreaView style={s.container}>
        <AppHeader title="Checklists" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

        {eventsLoading ? (
          <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
        ) : eventsList.length === 0 ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 40 }}>✅</Text>
            <Text style={s.emptyTitle}>No events yet</Text>
            <Text style={s.emptySubtitle}>Create a guest list or album first, then its checklist will show up here</Text>
          </View>
        ) : (
          <FlatList
            data={eventsList}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            renderItem={({ item }) => (
              <SwipeableRow
                style={s.eventPickerCardWrap}
                onPress={() => choosePickedEvent(item)}
                onDelete={() => deleteChecklist(item)}
              >
                <View style={s.eventPickerCard}>
                  <View style={s.eventPickerIcon}><Text style={{ fontSize: 20 }}>✅</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.eventPickerName}>{item.name}</Text>
                    {item.event_date ? (
                      <Text style={s.eventPickerDate}>
                        {new Date(item.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </SwipeableRow>
            )}
          />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader
        title={`${event.name} · Checklist`}
        onBack={() => navigation.goBack()}
        theme={theme}
        navigation={navigation}
        eventId={event?.id}
        rightActions={[
          <TouchableOpacity key="add" ref={addBtnRef} style={s.addBtn} onPress={openAddItem}>
            <Plus size={20} color={theme.bg} />
          </TouchableOpacity>,
        ]}
      />

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      ) : (
        <>
          <View ref={progressCardRef} style={s.progressCard}>
            <View style={s.progressHeaderRow}>
              <Text style={s.progressLabel}>{doneCount} of {todos.length} done</Text>
              <Text style={s.progressPct}>{Math.round(progress * 100)}%</Text>
            </View>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${progress * 100}%` }]} />
            </View>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {SECTION_ORDER.map(section => {
              const items = todos.filter(t => (t.section || 'custom') === section);
              if (items.length === 0) return null;
              const sm = SECTION_META[section];
              const sectionDone = items.filter(t => t.status === 'done').length;
              const collapsed = isSectionCollapsed(section);

              return (
                <View key={section} style={{ marginBottom: 12 }}>
                  <TouchableOpacity style={s.sectionHeader} onPress={() => toggleSection(section)}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={[s.kindDot, { backgroundColor: sm.color }]} />
                      <Text style={s.sectionHeaderText}>{sm.label}</Text>
                      <Text style={s.sectionHeaderCount}>{sectionDone}/{items.length}</Text>
                    </View>
                    {collapsed ? <CaretDown size={16} color={theme.textSecondary} /> : <CaretUp size={16} color={theme.textSecondary} />}
                  </TouchableOpacity>

                  {!collapsed && (
                    <View style={{ gap: 8, marginTop: 8 }}>
                      {items.map(item => {
                        const isDone = item.status === 'done';
                        const isExpanded = expandedItemId === item.id;
                        const isLinked = !!CATEGORY_SCREENS[item.category] || item.category === 'thankyou';
                        return (
                          <SwipeableRow
                            key={item.id}
                            style={s.todoCardWrap}
                            onPress={() => handleRowPress(item)}
                            onDelete={() => deleteTodo(item)}
                          >
                            <View
                              style={s.todoCard}
                              ref={item.category === 'guest_list' ? guestListItemRef : null}
                            >
                              <View style={s.todoRow}>
                                <TouchableOpacity
                                  onPress={() => toggleTodo(item)}
                                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                >
                                  <View style={[s.checkCircle, isDone && s.checkCircleDone]}>
                                    {isDone ? <Check size={13} color="#fff" /> : null}
                                  </View>
                                </TouchableOpacity>
                                <Text style={[s.todoTitle, isDone && s.todoTitleDone]} numberOfLines={1}>
                                  {CATEGORY_ICONS[item.category] || CATEGORY_ICONS.custom} {item.title}
                                </Text>
                                {item.item_type === 'auto' ? <Text style={s.autoTag}>auto</Text> : null}
                                {isLinked ? (
                                  <CaretRight size={15} color={theme.textSecondary} />
                                ) : (
                                  isExpanded ? <CaretUp size={15} color={theme.textSecondary} /> : <CaretDown size={15} color={theme.textSecondary} />
                                )}
                              </View>

                              {/* Only ever shown on a still-pending item — once
                                  done, whether the original trigger still
                                  applies is moot. Calm by design (italic
                                  caption, textTertiary), same visual weight as
                                  GuestList.js's "logged by host"/"via host"
                                  captions — this is context, not an error. */}
                              {!isDone && item.possibly_outdated ? (
                                <Text style={s.todoOutdatedCaption}>context changed — may not be needed</Text>
                              ) : null}

                              {isExpanded && !isLinked && (
                                <View style={s.todoDetail}>
                                  <View style={[s.kindBadge, { backgroundColor: (KIND_META[item.kind] || KIND_META.task).bg, alignSelf: 'flex-start' }]}>
                                    <Text style={[s.kindBadgeText, { color: (KIND_META[item.kind] || KIND_META.task).color }]}>
                                      {(KIND_META[item.kind] || KIND_META.task).label}
                                    </Text>
                                  </View>
                                  {item.scheduled_at ? (
                                    <View style={s.todoMetaItem}>
                                      <CalendarBlank size={13} color={theme.textSecondary} />
                                      <Text style={s.todoMetaText}>{item.scheduled_at}</Text>
                                    </View>
                                  ) : null}
                                  {item.amount ? (
                                    <View style={s.todoMetaItem}>
                                      <CurrencyInr size={13} color={theme.textSecondary} />
                                      <Text style={s.todoMetaText}>{Number(item.amount).toLocaleString('en-IN')}</Text>
                                    </View>
                                  ) : null}
                                  {item.notes ? <Text style={s.todoNotes}>{item.notes}</Text> : null}
                                  <View style={s.todoActionRow}>
                                    <TouchableOpacity style={s.todoActionBtn} onPress={() => openEditItem(item)}>
                                      <PencilSimple size={13} color={theme.textSecondary} />
                                      <Text style={s.todoActionBtnText}>{item.notes || item.scheduled_at || item.amount ? 'Edit details' : 'Add details'}</Text>
                                    </TouchableOpacity>
                                    {item.kind === 'appointment' && !!item.scheduled_at && (
                                      <TouchableOpacity style={s.todoActionBtn} onPress={() => addAppointmentToCalendar(item)}>
                                        <CalendarBlank size={13} color={theme.textSecondary} />
                                        <Text style={s.todoActionBtnText}>Add to calendar</Text>
                                      </TouchableOpacity>
                                    )}
                                  </View>
                                </View>
                              )}
                            </View>
                          </SwipeableRow>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </>
      )}

      {/* ── Add / edit item modal ── */}
      <Modal visible={itemModal} transparent animationType="fade" onRequestClose={() => setItemModal(false)}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editingItemId ? 'Edit checklist item' : 'New checklist item'}</Text>
              <TouchableOpacity onPress={() => setItemModal(false)}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={s.input}
              placeholder="e.g. Visit venue, Pay decorator advance"
              placeholderTextColor={theme.textSecondary}
              value={itemForm.title}
              onChangeText={v => setItemForm(p => ({ ...p, title: v }))}
              autoFocus
            />

            <Text style={s.fieldLabel}>Type</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {KIND_OPTIONS.map(k => {
                const km = KIND_META[k];
                const active = itemForm.kind === k;
                return (
                  <TouchableOpacity
                    key={k}
                    style={[s.kindChip, active && { backgroundColor: km.color, borderColor: km.color }]}
                    onPress={() => setItemForm(p => ({ ...p, kind: k }))}
                  >
                    <Text style={[s.kindChipText, active && { color: '#fff' }]}>{km.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              style={s.input}
              placeholder="Date & time (optional) — e.g. 12 Aug, 4:00 PM"
              placeholderTextColor={theme.textSecondary}
              value={itemForm.scheduledAt}
              onChangeText={v => setItemForm(p => ({ ...p, scheduledAt: v }))}
            />

            {itemForm.kind === 'payment' ? (
              <TextInput
                style={s.input}
                placeholder="Amount (₹, optional)"
                placeholderTextColor={theme.textSecondary}
                value={itemForm.amount}
                onChangeText={v => setItemForm(p => ({ ...p, amount: v }))}
                keyboardType="numeric"
              />
            ) : null}

            <TextInput
              style={[s.input, { minHeight: 60, textAlignVertical: 'top', paddingTop: 12 }]}
              placeholder="Notes (optional)"
              placeholderTextColor={theme.textSecondary}
              value={itemForm.notes}
              onChangeText={v => setItemForm(p => ({ ...p, notes: v }))}
              multiline
            />

            <TouchableOpacity style={s.saveBtn} onPress={saveItem} disabled={saving}>
              {saving ? <ActivityIndicator color={theme.bg} /> : <Text style={s.saveBtnText}>{editingItemId ? 'Save changes' : 'Add item'}</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Thank-you notes — send to guests who RSVP'd yes, one WhatsApp chat at a time ── */}
      <Modal visible={thankYouModal} transparent animationType="slide" onRequestClose={() => setThankYouModal(false)}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[s.modal, { maxHeight: '85%', paddingBottom: 0 }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>💌 Send thank-you notes</Text>
              <TouchableOpacity onPress={() => setThankYouModal(false)}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            <Text style={s.fieldLabel}>Message — {'{name}'} is replaced per guest</Text>
            <TextInput
              style={[s.input, { minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }]}
              value={thankYouMessage}
              onChangeText={setThankYouMessage}
              multiline
            />

            {thankYouGuestsLoading ? (
              <ActivityIndicator color={theme.accent} style={{ marginVertical: 20 }} />
            ) : (
              <FlatList
                data={thankYouGuests.filter(g => g.phone)}
                keyExtractor={item => item.id}
                style={{ maxHeight: 300, marginTop: 8 }}
                contentContainerStyle={{ gap: 10, paddingBottom: 16 }}
                ListEmptyComponent={
                  <Text style={s.emptySubtitle}>
                    No guests marked "Coming" with a phone number yet — check RSVPs in the guest list first.
                  </Text>
                }
                renderItem={({ item }) => {
                  const sent = thankYouSentIds.has(item.id);
                  return (
                    <View style={s.waRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.waName}>{item.name}</Text>
                        <Text style={s.waPhone}>{item.phone}</Text>
                      </View>
                      <TouchableOpacity
                        style={[s.waSendBtn, sent && { backgroundColor: theme.bgSecondary }]}
                        onPress={() => sendThankYouTo(item)}
                      >
                        <PaperPlaneTilt size={13} color={sent ? theme.textSecondary : theme.btnPrimaryText} />
                        <Text style={[s.waSendBtnText, sent && { color: theme.textSecondary }]}>
                          {sent ? 'Sent' : 'Send'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                }}
              />
            )}

            {thankYouSentIds.size > 0 && (
              <TouchableOpacity style={[s.saveBtn, { marginBottom: 16 }]} onPress={markThankYouDone}>
                <Text style={s.saveBtnText}>✓ Mark checklist item done</Text>
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <CoachMarkTour
        visible={eventTodoTour.isTourActive}
        steps={EVENTTODO_TOUR_STEPS}
        onComplete={eventTodoTour.markComplete}
        onSkip={eventTodoTour.markComplete}
      />
    </SafeAreaView>
  );
}

const styles = theme => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
    borderBottomWidth: 0.5, borderBottomColor: theme.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: theme.text, flex: 1, textAlign: 'center', paddingHorizontal: 8 },
  backBtn: { width: 36 },
  addBtn: {
    backgroundColor: theme.accent, borderRadius: 20,
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
  },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginTop: 8 },
  emptySubtitle: { fontSize: 13, color: theme.textSecondary, textAlign: 'center' },

  eventPickerCardWrap: { borderRadius: 16 },
  eventPickerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.cardBg, borderRadius: 16, borderWidth: 0.5, borderColor: theme.border, padding: 14,
  },
  eventPickerIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: theme.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  eventPickerName: { fontSize: 14.5, fontWeight: '700', color: theme.text },
  eventPickerDate: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },

  progressCard: {
    marginHorizontal: 16, marginTop: 14, backgroundColor: theme.cardBg,
    borderRadius: 16, borderWidth: 0.5, borderColor: theme.border, padding: 14, gap: 8,
  },
  progressHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { fontSize: 13, fontWeight: '600', color: theme.text },
  progressPct: { fontSize: 13, fontWeight: '700', color: theme.accent },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: theme.border, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: theme.accent, borderRadius: 3 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6,
  },
  sectionHeaderText: { fontSize: 13, fontWeight: '700', color: theme.text },
  sectionHeaderCount: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  kindDot: { width: 8, height: 8, borderRadius: 4 },
  kindBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  kindBadgeText: { fontSize: 10.5, fontWeight: '700' },

  todoCardWrap: { borderRadius: 16 },
  todoCard: {
    backgroundColor: theme.cardBg, borderRadius: 16, borderWidth: 0.5, borderColor: theme.border,
    paddingHorizontal: 14, paddingVertical: 12, overflow: 'hidden',
  },
  todoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkCircle: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: theme.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkCircleDone: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  todoTitle: { flex: 1, fontSize: 14.5, fontWeight: '600', color: theme.text },
  todoTitleDone: { textDecorationLine: 'line-through', color: theme.textSecondary },
  autoTag: { fontSize: 10, fontWeight: '700', color: theme.accent, letterSpacing: 0.3 },
  // Same shape as GuestList.js's sourceCaption ("logged by host") — small
  // italic caption under the row it qualifies, never a competing UI element.
  todoOutdatedCaption: { fontSize: 10.5, color: theme.textTertiary, fontStyle: 'italic', marginTop: 2, marginLeft: 32 },

  todoDetail: {
    marginTop: 10, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: theme.border,
    gap: 6,
  },
  todoMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  todoMetaText: { fontSize: 12.5, color: theme.textSecondary },
  todoNotes: { fontSize: 12.5, color: theme.textSecondary, lineHeight: 18 },
  todoActionRow: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  todoActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
    backgroundColor: theme.bg, borderWidth: 0.5, borderColor: theme.border,
  },
  todoActionBtnText: { fontSize: 11.5, fontWeight: '600', color: theme.textSecondary },

  waRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: theme.bg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  waName: { fontSize: 14, fontWeight: '700', color: theme.text },
  waPhone: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  waSendBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: theme.accent, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
  },
  waSendBtnText: { fontSize: 12.5, fontWeight: '700', color: theme.btnPrimaryText },

  overlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: theme.cardBg, borderRadius: 20, padding: 24, gap: 12 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
  fieldLabel: { fontSize: 12.5, fontWeight: '600', color: theme.textSecondary, marginTop: -4 },
  input: {
    borderWidth: 1, borderColor: theme.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text,
  },
  kindChip: {
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 16,
    backgroundColor: theme.bg, borderWidth: 0.5, borderColor: theme.border,
  },
  kindChipText: { fontSize: 12.5, fontWeight: '600', color: theme.textSecondary },
  saveBtn: {
    backgroundColor: theme.accent, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginTop: 4,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: theme.bg },
});
