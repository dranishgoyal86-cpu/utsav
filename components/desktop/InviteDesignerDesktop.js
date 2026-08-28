import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView, ActivityIndicator, Image } from 'react-native';
import { Camera } from 'phosphor-react-native';
import ToranCoverCard from '../invite/ToranCoverCard';
import StillnessCard from '../invite/StillnessCard';
import { MAROON, GOLD, MUTED, TEXT, CARD, LINE, EYEBROW } from '../../lib/desktopTheme';

// Wave 13 — Task 2. New pattern: a document-editor shape, not a table —
// editable fields on the left, the real live invite preview on the right,
// updating as fields change. Reuses ToranCoverCard/StillnessCard exactly
// as the mobile designer's own preview already does (same components,
// same props) — this pane's whole point is that it's the REAL card, not a
// second approximation of one.
//
// Per-function design assignment is deliberately NOT here — that's a real
// screen already (GuestList.js's Functions modal, built Wave 9-11), not
// something this screen owns today. Duplicating it here would be a second,
// competing place to do the same thing; flagged in the wave's report
// rather than silently built.
function Field({ label, children }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      {children}
    </View>
  );
}

export default function InviteDesignerDesktop({
  design, setDesign, allowedDesigns, celebratory, designLabels,
  partner1, setPartner1, partner2, setPartner2, hostedBy, setHostedBy,
  couplePhotoUrl, pickCouplePhoto, uploadingPhoto,
  coupleQuote, setCoupleQuote,
  subjectNameLine1, setSubjectNameLine1, subjectNameLine2, setSubjectNameLine2, subjectYears, setSubjectYears,
  detailLine1, setDetailLine1, detailLine2, setDetailLine2,
  kickerText, setKickerText, headlineText, setHeadlineText,
  saving, saveContent, contentSaved,
  eventName, eventDate, venue,
}) {
  const isStillness = design === 'stillness';
  const isIvory = design === 'ivory';
  const isDiya = design === 'diya';

  return (
    <View style={s.wrap}>
      <ScrollView style={s.formPane} contentContainerStyle={{ padding: 28 }}>
        <Text style={s.eyebrow}>Invite designer</Text>
        <Text style={s.h1}>Design your invite</Text>

        <Field label="Design">
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {allowedDesigns.map(key => (
              <TouchableOpacity key={key} style={[s.designChip, design === key && s.designChipActive]} onPress={() => setDesign(key)}>
                <Text style={[s.designChipText, design === key && s.designChipTextActive]}>{designLabels[key]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {!celebratory && <Text style={s.hint}>Restricted to Stillness for this event type</Text>}
        </Field>

        {!design ? (
          <Text style={s.hint}>Choose a design above to continue.</Text>
        ) : isStillness ? (
          <>
            <Field label="Name — line 1"><TextInput style={s.input} value={subjectNameLine1} onChangeText={setSubjectNameLine1} placeholder="e.g. Shri Ramesh" placeholderTextColor={MUTED} /></Field>
            <Field label="Name — line 2 (optional)"><TextInput style={s.input} value={subjectNameLine2} onChangeText={setSubjectNameLine2} placeholder="e.g. Chandra Goyal" placeholderTextColor={MUTED} /></Field>
            <Field label="Years (optional)"><TextInput style={s.input} value={subjectYears} onChangeText={setSubjectYears} placeholder="e.g. 1947 — 2026" placeholderTextColor={MUTED} /></Field>
            <Field label="Details — line 1"><TextInput style={s.input} value={detailLine1} onChangeText={setDetailLine1} placeholder="e.g. Prayer meeting · 18 August, 4 PM" placeholderTextColor={MUTED} /></Field>
            <Field label="Details — line 2 (optional)"><TextInput style={s.input} value={detailLine2} onChangeText={setDetailLine2} placeholder="e.g. Venue / address" placeholderTextColor={MUTED} /></Field>
          </>
        ) : isDiya ? (
          <>
            <Field label="Kicker text (optional)"><TextInput style={s.input} value={kickerText} onChangeText={setKickerText} placeholder={`Defaults to "${(eventName || '').toUpperCase()}"`} placeholderTextColor={MUTED} /></Field>
            <Field label="Headline text (optional)"><TextInput style={s.input} value={headlineText} onChangeText={setHeadlineText} placeholder={`Defaults to "${eventName || ''}"`} placeholderTextColor={MUTED} /></Field>
            <Field label="Hosted by (optional)"><TextInput style={s.input} value={hostedBy} onChangeText={setHostedBy} placeholder="e.g. The Sharma family" placeholderTextColor={MUTED} /></Field>
          </>
        ) : (
          <>
            {isIvory && (
              <Field label="Kicker text (optional)"><TextInput style={s.input} value={kickerText} onChangeText={setKickerText} placeholder="e.g. YOU'RE INVITED" placeholderTextColor={MUTED} /></Field>
            )}
            <Field label="Couple photo (optional)">
              <TouchableOpacity style={s.photoPicker} onPress={pickCouplePhoto} disabled={uploadingPhoto}>
                {uploadingPhoto ? <ActivityIndicator color={MAROON} /> : couplePhotoUrl ? (
                  <Image source={{ uri: couplePhotoUrl }} style={{ width: '100%', height: '100%', borderRadius: 12 }} />
                ) : (
                  <><Camera size={20} color={MUTED} /><Text style={s.photoPickerText}>Add a photo</Text></>
                )}
              </TouchableOpacity>
            </Field>
            <Field label="A line in your own words (optional)"><TextInput style={s.input} value={coupleQuote} onChangeText={setCoupleQuote} placeholder="e.g. Two families, one celebration" placeholderTextColor={MUTED} /></Field>
            <Field label="Partner 1 name"><TextInput style={s.input} value={partner1} onChangeText={setPartner1} placeholder="e.g. Aarav" placeholderTextColor={MUTED} /></Field>
            <Field label="Partner 2 name (optional)"><TextInput style={s.input} value={partner2} onChangeText={setPartner2} placeholder="e.g. Meera" placeholderTextColor={MUTED} /></Field>
            <Field label="Hosted by (optional)"><TextInput style={s.input} value={hostedBy} onChangeText={setHostedBy} placeholder="e.g. The Sharma and Verma families" placeholderTextColor={MUTED} /></Field>
          </>
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
              <StillnessCard nameLine1={subjectNameLine1} nameLine2={subjectNameLine2} years={subjectYears} detailLine1={detailLine1} detailLine2={detailLine2} />
            ) : (
              <ToranCoverCard
                design={design}
                eventName={eventName}
                eventDate={eventDate}
                venue={venue}
                partner1Name={partner1}
                partner2Name={partner2}
                hostedBy={hostedBy}
                kickerText={kickerText}
                headlineText={headlineText}
              />
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
  input: {
    backgroundColor: '#FBF6EC', borderWidth: 1.5, borderColor: LINE, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 13.5, color: TEXT,
  },
  designChip: { borderWidth: 1.5, borderColor: LINE, backgroundColor: '#FBF6EC', borderRadius: 100, paddingVertical: 8, paddingHorizontal: 16 },
  designChipActive: { backgroundColor: MAROON, borderColor: MAROON },
  designChipText: { fontSize: 12.5, fontWeight: '700', color: MUTED },
  designChipTextActive: { color: '#fff' },
  photoPicker: {
    width: 120, height: 120, borderRadius: 14, borderWidth: 1.5, borderColor: LINE, borderStyle: 'dashed',
    backgroundColor: '#FBF6EC', alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden',
  },
  photoPickerText: { fontSize: 11, color: MUTED, fontWeight: '600' },
  saveBtn: { backgroundColor: MAROON, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  previewPane: { width: 380, alignItems: 'center' },
  previewLabel: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: MUTED, fontWeight: '700', marginBottom: 14, alignSelf: 'flex-start' },
  previewCardWrap: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
});
