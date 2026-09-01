import { View, Text, StyleSheet } from 'react-native';

// A plain narrative/teaser paragraph — SCENE.STORY existed in the working
// enum and was already listed in several kids-birthday archetypes'
// scenePreset arrays since Production Batch 1, but had no rendering
// component and no case in WebInvitePreview.js's switch (a real,
// previously-undetected gap: the scene could resolve but would render
// nothing). Reused here for kids-birthday's own narrative copy plus
// Batch 2's baby-shower "programme note"/product-launch teaser text —
// one generic paragraph block, not a new component per event type.
export default function StoryScene({ tokens, text }) {
  if (!text) return null;
  const c = tokens?.colors;
  return (
    <View style={s.wrap}>
      <Text style={[s.text, { color: c?.ink || '#1A1A1A' }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingVertical: 20, paddingHorizontal: 24 },
  text: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
