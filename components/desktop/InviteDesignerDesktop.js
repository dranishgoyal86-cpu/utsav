import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import ToranCoverCard from '../invite/ToranCoverCard';
import StillnessCard from '../invite/StillnessCard';
import InviteSchemaForm from '../invite/schema/InviteSchemaForm';
import { mapToToranCoverCardProps, mapToStillnessCardProps } from '../../lib/inviteContentAdapter';
import { MAROON, MUTED, TEXT, CARD, LINE, EYEBROW, CREAM } from '../../lib/desktopTheme';

// Wave 13 — Task 2. New pattern: a document-editor shape, not a table —
// editable fields on the left, the real live invite preview on the right,
// updating as fields change. Reuses ToranCoverCard/StillnessCard exactly
// as the mobile designer's own preview already does (same components,
// same props, now both built via lib/inviteContentAdapter.js's mapping
// functions instead of each screen hand-assembling them) — this pane's
// whole point is that it's the REAL card, not a second approximation of
// one.
//
// invite-architecture wave — the hand-written per-design TextInput blocks
// this file used to carry (one copy of ToranInvites.js's own field JSX,
// maintained separately) are gone. Field rendering is now InviteSchemaForm
// — the exact same component ToranInvites.js (mobile) uses, fed the same
// schema/values/onFieldChange props from the parent screen. `fieldTheme`
// below is the one bit of glue this still needs: InviteFieldRenderer
// expects a theme-shaped object ({ text, textSecondary, textTertiary,
// accent, border, inputBg }), and this desktop shell has never used that
// shape — it uses lib/desktopTheme.js's flat exported constants instead.
// Mapping those onto the same shape here (once) lets the shared renderer
// stay completely theme-system-agnostic rather than special-casing
// desktop internally.
//
// Known, accepted visual delta from this consolidation: input border-
// radius/padding and the couple-photo picker's size/shape now match
// mobile's exactly (a smaller circle) instead of this screen's previous
// bespoke 120x120 rounded-square picker. Flagged in the implementation
// report as a follow-up polish candidate, not silently changed.
//
// Per-function design assignment is deliberately NOT here — that's a real
// screen already (GuestList.js's Functions modal, built Wave 9-11), not
// something this screen owns today. Duplicating it here would be a second,
// competing place to do the same thing; flagged in the wave's report
// rather than silently built.
const fieldTheme = {
  text: TEXT,
  textSecondary: MUTED,
  textTertiary: MUTED,
  accent: MAROON,
  border: LINE,
  inputBg: CREAM,
};

export default function InviteDesignerDesktop({
  design, setDesign, allowedDesigns, celebratory, designLabels,
  schema, values, onFieldChange, onPickPhoto, photoUploadingKey,
  saving, saveContent, contentSaved,
  event,
}) {
  const isStillness = design === 'stillness';

  return (
    <View style={s.wrap}>
      <ScrollView style={s.formPane} contentContainerStyle={{ padding: 28 }}>
        <Text style={s.eyebrow}>Invite designer</Text>
        <Text style={s.h1}>Design your invite</Text>

        <View style={{ marginBottom: 14 }}>
          <Text style={s.label}>Design</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {allowedDesigns.map(key => (
              <TouchableOpacity key={key} style={[s.designChip, design === key && s.designChipActive]} onPress={() => setDesign(key)}>
                <Text style={[s.designChipText, design === key && s.designChipTextActive]}>{designLabels[key]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {!celebratory && <Text style={s.hint}>Restricted to Stillness for this event type</Text>}
        </View>

        {!design ? (
          <Text style={s.hint}>Choose a design above to continue.</Text>
        ) : (
          <InviteSchemaForm
            theme={fieldTheme}
            schema={schema}
            values={values}
            onFieldChange={onFieldChange}
            onPickPhoto={onPickPhoto}
            photoUploadingKey={photoUploadingKey}
          />
        )}

        {!!design && (
          <TouchableOpacity style={s.saveBtn} onPress={saveContent} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>{contentSaved ? 'Update details' : 'Save details'}</Text>}
          </TouchableOpacity>
        )}
      </ScrollView>

      <View style={s.previewPane}>
        <Text style={s.previewLabel}>Live preview</Text>
        {design ? (
          <View style={s.previewCardWrap}>
            {isStillness ? (
              <StillnessCard {...mapToStillnessCardProps(values)} />
            ) : (
              <ToranCoverCard {...mapToToranCoverCardProps(design, values, event)} />
            )}
          </View>
        ) : (
          <Text style={s.hint}>Pick a design to see the real card here.</Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 32, minHeight: 500 },
  formPane: { flex: 1, backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 20, maxHeight: 720 },
  eyebrow: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: EYEBROW, fontWeight: '700', marginBottom: 4 },
  h1: { fontFamily: 'Fraunces-SemiBold', fontSize: 24, color: MAROON, marginBottom: 20 },
  label: { fontSize: 12, fontWeight: '700', color: TEXT, marginBottom: 6 },
  hint: { fontSize: 12, color: MUTED, marginTop: 4 },
  designChip: { borderWidth: 1.5, borderColor: LINE, backgroundColor: CREAM, borderRadius: 100, paddingVertical: 8, paddingHorizontal: 16 },
  designChipActive: { backgroundColor: MAROON, borderColor: MAROON },
  designChipText: { fontSize: 12.5, fontWeight: '700', color: MUTED },
  designChipTextActive: { color: '#fff' },
  saveBtn: { backgroundColor: MAROON, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  previewPane: { width: 380, alignItems: 'center' },
  previewLabel: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: MUTED, fontWeight: '700', marginBottom: 14, alignSelf: 'flex-start' },
  previewCardWrap: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
});
