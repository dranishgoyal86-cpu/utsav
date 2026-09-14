import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { getActivityCategories, getSuggestedActivities, GAME_ACTIVITY_TIPS } from '../lib/activityIdeas';

// Birthday Event Improvement plan, Piece 3. Collapsed by default — "sub
// events as suggestion to host in event planning only if host choose to
// look for added activities ideas" was Anish's own framing, so this never
// auto-expands or forces itself into the main checklist.
//
// `added` is the event's current event_extra_activities rows (activity_slug
// set) — used to render an already-added state instead of "+ Add" and to
// let onRemove/onToggleFeature target the right row. onAdd/onRemove/
// onToggleFeature are passed in from PlanView.js (which owns the actual
// Supabase insert/update/delete + refresh), same separation-of-concerns
// pattern as SlotField.js's onSave prop.
//
// The ⭐ toggle is Piece 4 (invite integration): starring an added activity
// sets its is_featured_on_invite flag, which is exactly what
// ToranInvites.js reads to build the invite's "What to expect" line — so
// this really is the deliberate curation step Anish asked for, not
// "everything the host added."
export default function ActivityIdeasLibrary({ event, added, onAdd, onRemove, onToggleFeature, theme, s: parentS, allocation }) {
  const [open, setOpen] = useState(false);
  const [openCategory, setOpenCategory] = useState(null);
  const s = makeStyles(theme);
  const categories = getActivityCategories(event.event_type_slug);
  if (categories.length === 0) return null;

  // "whatever money is left will be used for other activities" — this
  // deliberately does NOT price individual activity ideas (pot painting,
  // ball pits, caricature artists, etc.) with invented numbers. Utsav has
  // no real sourced pricing for most of these ~50 catalog items, and
  // guessing plausible-looking figures for each would be the same mistake
  // flagged earlier for dish-level pricing. What IS honest: showing the
  // real, already-trusted remaining-budget figure from allocateBudget()
  // (same number PlanView.js's own budget card shows) as guidance for
  // deciding how many extras to add — real math, no per-item guesswork.
  const showRemaining = allocation && allocation.allocated > 0;

  const addedSlugs = new Set((added || []).map(a => a.activity_slug));
  const suggested = getSuggestedActivities(event.event_type_slug, event.theme_slug);

  function renderItem(item) {
    const isAdded = addedSlugs.has(item.slug);
    const addedRow = (added || []).find(a => a.activity_slug === item.slug);
    return (
      <View key={item.slug} style={s.itemRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.itemName}>{item.name}</Text>
          <Text style={s.itemHint}>{item.ages}{item.note ? ` · ${item.note}` : ''}</Text>
        </View>
        {isAdded && (
          <TouchableOpacity style={s.starBtn} onPress={() => onToggleFeature(addedRow)}>
            <Text style={s.starBtnText}>{addedRow.is_featured_on_invite ? '⭐' : '☆'}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.addBtn, isAdded && s.addedBtn]}
          onPress={() => (isAdded ? onRemove(addedRow) : onAdd(item))}
        >
          <Text style={[s.addBtnText, isAdded && s.addedBtnText]}>{isAdded ? '✓ Added' : '+ Add'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!open) {
    return (
      <TouchableOpacity style={s.browseBtn} onPress={() => setOpen(true)}>
        <Text style={s.browseBtnText}>🎉 Browse activity ideas{addedSlugs.size > 0 ? ` (${addedSlugs.size} added)` : ''}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={s.container}>
      <TouchableOpacity onPress={() => setOpen(false)} style={s.headerRow}>
        <Text style={s.header}>Activity ideas</Text>
        <Text style={s.collapseText}>Hide ‹</Text>
      </TouchableOpacity>
      {showRemaining && (
        <Text style={[s.itemHint, { marginBottom: 10 }]}>
          Roughly ₹{allocation.remaining.toLocaleString('en-IN')} left in your overall budget after your other planned items — a rough guide for how much room you have for extras like these.
        </Text>
      )}
      {addedSlugs.size > 0 && (
        <Text style={[s.itemHint, { marginBottom: 10 }]}>Tap ☆ next to something you've added to feature it on your invite, so guests know what to expect.</Text>
      )}

      {suggested.length > 0 && (
        <View style={s.categoryBlock}>
          <Text style={s.categoryTitle}>✨ Suggested for your theme</Text>
          {suggested.map(renderItem)}
        </View>
      )}

      {categories.map(cat => (
        <View key={cat.slug} style={s.categoryBlock}>
          <TouchableOpacity onPress={() => setOpenCategory(openCategory === cat.slug ? null : cat.slug)} style={s.categoryHeaderRow}>
            <Text style={s.categoryTitle}>{cat.emoji} {cat.label}</Text>
            <Text style={s.collapseText}>{openCategory === cat.slug ? '−' : '+'}</Text>
          </TouchableOpacity>
          {openCategory === cat.slug && cat.items.map(renderItem)}
        </View>
      ))}

      <View style={s.categoryBlock}>
        <Text style={s.categoryTitle}>🎲 Game ideas for your Games Host</Text>
        <Text style={s.itemHint}>{GAME_ACTIVITY_TIPS.join(' · ')}</Text>
      </View>
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    browseBtn: { backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
    browseBtnText: { fontSize: 13.5, fontWeight: '700', color: theme.text },
    container: { marginTop: 14, backgroundColor: theme.cardBg, borderRadius: 16, borderWidth: 0.5, borderColor: theme.border, padding: 16 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    header: { fontSize: 15, fontWeight: '700', color: theme.text },
    collapseText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
    categoryBlock: { marginBottom: 14 },
    categoryHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
    categoryTitle: { fontSize: 13.5, fontWeight: '700', color: theme.text, marginBottom: 4 },
    itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: theme.border },
    itemName: { fontSize: 13.5, fontWeight: '600', color: theme.text },
    itemHint: { fontSize: 11.5, color: theme.textSecondary, marginTop: 2 },
    addBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: theme.btnPrimary },
    addBtnText: { fontSize: 12, fontWeight: '700', color: theme.btnPrimaryText },
    addedBtn: { backgroundColor: theme.bg, borderWidth: 0.5, borderColor: theme.border },
    addedBtnText: { color: theme.textSecondary },
    starBtn: { paddingHorizontal: 8, paddingVertical: 6 },
    starBtnText: { fontSize: 16 },
  });
}
