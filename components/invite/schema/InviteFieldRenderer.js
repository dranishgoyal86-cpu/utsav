import { View, Text, TextInput, TouchableOpacity, Image, ActivityIndicator, Switch, StyleSheet } from 'react-native';
import { Camera } from 'phosphor-react-native';
import { FIELD_KIND, FIELD_STATUS } from '../../../lib/inviteSchemas/types';

// Renders exactly one schema field. Deliberately dumb: `field.kind` in, the
// right input out — no design/template awareness, no event_type_slug
// branching (that's already resolved by the time a field def reaches
// here), no Supabase. `theme` is passed in as a prop rather than read via
// useTheme() internally, matching this project's "pass useTheme() as a
// prop" convention and — more concretely here — letting the exact same
// component render correctly under both the mobile ThemeContext theme
// object and the desktop shell's flat lib/desktopTheme.js palette (the
// caller adapts either into this same { text, textSecondary, textTertiary,
// accent, border, inputBg } shape; see InviteDesignerDesktop.js).
//
// Photo fields call back to the parent via onPickPhoto for the actual
// picker/upload (expo-image-picker + Cloudinary upload is screen-level
// plumbing, not renderer plumbing) — this component only reflects
// photoUploading/value state, same division of responsibility
// ToranInvites.js's own pickCouplePhoto() already had before this wave.
export default function InviteFieldRenderer({ theme, field, value, onChange, onPickPhoto, photoUploading }) {
  const s = makeStyles(theme);
  // invite-architecture wave, Part 3 — many of the ~110 new fields.js
  // labels already bake in their own "(optional)" (e.g. "Dress code
  // (optional)", written that way for readability wherever a field def is
  // read outside this renderer too, e.g. future documentation). Guarding
  // against the suffix already being present avoids a real, live-rendering-
  // caught bug: "Grandparents (optional) (optional)" — found via Playwright
  // while verifying naming-ceremony's conditional field, fixed here rather
  // than by hand-editing every affected label in fields.js.
  const alreadyHasOptionalSuffix = /\(optional\)\s*$/i.test(field.label || '');
  const label = field.status === FIELD_STATUS.REQUIRED
    ? field.label
    : field.status === FIELD_STATUS.OPTIONAL && !alreadyHasOptionalSuffix
      ? `${field.label} (optional)`
      : field.label;

  // invite-architecture wave, Part 3 — SECTIONS-kind fields (customSections,
  // interfaithCeremonies) intentionally render nothing yet: a repeating-
  // section editor is a real interaction/visual build, out of scope for
  // this architecture-only wave (see FIELD_KIND.SECTIONS in types.js).
  // The adapter still round-trips whatever's already stored, this renderer
  // just doesn't offer a way to edit it in-form today.
  if (field.kind === FIELD_KIND.SECTIONS) {
    return null;
  }

  if (field.kind === FIELD_KIND.BOOLEAN) {
    return (
      <View style={s.booleanRow}>
        <Text style={s.booleanLabel}>{label}</Text>
        <Switch
          value={value === true}
          onValueChange={onChange}
          trackColor={{ false: theme.border, true: theme.accent }}
          thumbColor="#fff"
        />
      </View>
    );
  }

  if (field.kind === FIELD_KIND.PHOTO) {
    return (
      <View style={s.fieldWrap}>
        <Text style={s.label}>{label}</Text>
        <TouchableOpacity style={s.photoPicker} onPress={onPickPhoto} disabled={photoUploading}>
          {photoUploading ? (
            <ActivityIndicator color={theme.accent} />
          ) : value ? (
            <Image source={{ uri: value }} style={s.photoPreview} />
          ) : (
            <>
              <Camera size={20} color={theme.textSecondary} />
              <Text style={s.photoPickerText}>Add a photo</Text>
            </>
          )}
        </TouchableOpacity>
        {value && !photoUploading ? (
          <TouchableOpacity onPress={onPickPhoto}>
            <Text style={s.photoReplaceText}>Replace photo</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return (
    <View style={s.fieldWrap}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={field.kind === FIELD_KIND.TEXTAREA ? [s.input, s.textarea] : s.input}
        value={value || ''}
        onChangeText={onChange}
        placeholder={field.placeholderHint || ''}
        placeholderTextColor={theme.textTertiary}
        multiline={field.kind === FIELD_KIND.TEXTAREA}
      />
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    fieldWrap: { marginBottom: 4 },
    booleanRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginTop: 10, paddingVertical: 4,
    },
    booleanLabel: { fontSize: 13, fontWeight: '600', color: theme.text, flex: 1, marginRight: 12 },
    label: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginBottom: 6, marginTop: 10 },
    input: { backgroundColor: theme.inputBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: theme.text },
    textarea: { minHeight: 70, textAlignVertical: 'top' },
    photoPicker: {
      width: 96, height: 96, borderRadius: 48, backgroundColor: theme.inputBg,
      alignItems: 'center', justifyContent: 'center', alignSelf: 'center', overflow: 'hidden',
      borderWidth: 1, borderColor: theme.border, borderStyle: 'dashed',
    },
    photoPreview: { width: 96, height: 96, borderRadius: 48 },
    photoPickerText: { fontSize: 10, color: theme.textSecondary, marginTop: 4 },
    photoReplaceText: { fontSize: 12, fontWeight: '600', color: theme.accent, textAlign: 'center', marginTop: 8 },
  });
}
