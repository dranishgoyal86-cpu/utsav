import { View, Text, TextInput, TouchableOpacity, Image, ActivityIndicator, StyleSheet } from 'react-native';
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
  const label = field.status === FIELD_STATUS.REQUIRED
    ? field.label
    : field.status === FIELD_STATUS.OPTIONAL
      ? `${field.label} (optional)`
      : field.label;

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
