import { View, Text, StyleSheet } from 'react-native';
import InviteFieldRenderer from './InviteFieldRenderer';

// Renders one schema section: an optional heading (SECTION_DEFS' label —
// most of this wave's sections have none, matching today's un-headed
// field list) plus each of its fields via InviteFieldRenderer. No
// section-level logic beyond that — grouping/ordering is entirely the
// schema's, this just walks it.
export default function InviteSectionRenderer({ theme, section, values, onFieldChange, onPickPhoto, photoUploadingKey }) {
  const s = makeStyles(theme);
  return (
    <View style={s.section}>
      {section.label ? <Text style={s.sectionLabel}>{section.label}</Text> : null}
      {section.fields.map((field) => (
        <InviteFieldRenderer
          key={field.key}
          theme={theme}
          field={field}
          value={values ? values[field.key] : ''}
          onChange={(v) => onFieldChange(field.key, v)}
          onPickPhoto={field.kind === 'photo' ? () => onPickPhoto(field.key) : undefined}
          photoUploading={photoUploadingKey === field.key}
        />
      ))}
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    section: { marginBottom: 6 },
    sectionLabel: { fontSize: 11, fontWeight: '700', color: theme.textTertiary, letterSpacing: 0.6, marginTop: 14, marginBottom: 4, textTransform: 'uppercase' },
  });
}
