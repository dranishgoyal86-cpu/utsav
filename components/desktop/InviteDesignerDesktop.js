import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import ProductionInviteCard from '../invite/ProductionInviteCard';
import InviteSchemaForm from '../invite/schema/InviteSchemaForm';
import { buildArchetypeTemplateId } from '../../lib/inviteProductionDesign';
import { getArchetype, getVariant } from '../../lib/inviteDesignArchetypes';
import { getCatalogueEntry } from '../../lib/inviteDesignArchetypes/catalogue';
import { MAROON, MUTED, TEXT, CARD, LINE, EYEBROW, CREAM } from '../../lib/desktopTheme';

// Wave 13 — Task 2. New pattern: a document-editor shape, not a table —
// editable fields on the left, the real live invite preview on the right,
// updating as fields change.
//
// Production Integration Wave — the preview pane now renders through
// ProductionInviteCard, the same production rendering bridge
// ToranInvites.js's mobile preview uses (legacy ToranCoverCard/
// StillnessCard for a legacy selection, StaticInviteCard for a new
// archetype/variant selection) — no second, desktop-only card-selection
// ternary. designOptions/parsedDesign are computed once by the parent
// screen (getProductionDesignOptions()/parseProductionDesign(), see
// lib/inviteProductionDesign.js) and passed down, same as every other
// prop here — this component still owns no Supabase/registry calls of
// its own.
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
//
// Per-function design assignment is deliberately NOT here — that's a real
// screen already (GuestList.js's Functions modal, built Wave 9-11), not
// something this screen owns today.
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
  designOptions, parsedDesign,
  schema, values, onFieldChange, onPickPhoto, photoUploadingKey,
  saving, saveContent, contentSaved,
  event,
}) {
  const showArchetypeSection = celebratory && designOptions && (designOptions.recommended.length > 0 || designOptions.moreStyles.length > 0);
  const selectedArchetype = parsedDesign?.kind === 'archetype' ? getArchetype(parsedDesign.archetypeId) : null;

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

        {showArchetypeSection && (
          <View style={{ marginBottom: 14 }}>
            <Text style={s.label}>Or a new production design</Text>
            {[['Recommended', designOptions.recommended], ['More styles', designOptions.moreStyles]].map(([label, ids]) => ids.length > 0 && (
              <View key={label} style={{ marginBottom: 10 }}>
                <Text style={s.groupLabel}>{label.toUpperCase()}</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {ids.map((archetypeId) => {
                    const a = getArchetype(archetypeId);
                    const active = parsedDesign?.kind === 'archetype' && parsedDesign.archetypeId === archetypeId;
                    const descriptor = (getCatalogueEntry(archetypeId)?.tones || []).slice(0, 2).join(' · ');
                    return (
                      <TouchableOpacity key={archetypeId} style={[s.designChip, active && s.designChipActive]} onPress={() => setDesign(buildArchetypeTemplateId(archetypeId, a.variantIds[0]))}>
                        <Text style={[s.designChipText, active && s.designChipTextActive]}>{a.name}</Text>
                        {descriptor ? <Text style={[s.descriptor, active && s.descriptorActive]}>{descriptor}</Text> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
            {selectedArchetype && selectedArchetype.variantIds.length > 1 && (
              <View>
                <Text style={s.groupLabel}>VARIANT</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {selectedArchetype.variantIds.map((variantId) => {
                    const v = getVariant(variantId);
                    const active = variantId === parsedDesign.variantId;
                    return (
                      <TouchableOpacity key={variantId} style={[s.designChip, active && s.designChipActive]} onPress={() => setDesign(buildArchetypeTemplateId(parsedDesign.archetypeId, variantId))}>
                        <Text style={[s.designChipText, active && s.designChipTextActive]}>{v.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}

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
            <ProductionInviteCard templateId={design} eventTypeSlug={event?.event_type_slug} values={values} event={event} />
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
  groupLabel: { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.5, marginBottom: 6 },
  hint: { fontSize: 12, color: MUTED, marginTop: 4 },
  designChip: { borderWidth: 1.5, borderColor: LINE, backgroundColor: CREAM, borderRadius: 100, paddingVertical: 8, paddingHorizontal: 16 },
  designChipActive: { backgroundColor: MAROON, borderColor: MAROON },
  designChipText: { fontSize: 12.5, fontWeight: '700', color: MUTED },
  designChipTextActive: { color: '#fff' },
  descriptor: { fontSize: 9, color: MUTED, marginTop: 1 },
  descriptorActive: { fontSize: 9, color: '#fff', opacity: 0.85, marginTop: 1 },
  saveBtn: { backgroundColor: MAROON, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  previewPane: { width: 380, alignItems: 'center' },
  previewLabel: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: MUTED, fontWeight: '700', marginBottom: 14, alignSelf: 'flex-start' },
  previewCardWrap: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
});
