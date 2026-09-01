import { View, Text, StyleSheet } from 'react-native';

// Host-selected content only — this scene renders exactly the
// invocationText the host wrote (or omits itself entirely, per
// lib/inviteSceneResolver.js's hasInvocationContent gate); it never
// generates or defaults a shloka/deity line.
export default function InvocationScene({ tokens, text }) {
  if (!text) return null;
  const c = tokens?.colors;
  return (
    <View style={s.wrap}>
      <Text style={[s.text, { color: c?.ink || '#1A1A1A', fontFamily: tokens?.fonts?.body }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingVertical: 24, paddingHorizontal: 32, alignItems: 'center' },
  text: { fontSize: 14, textAlign: 'center', lineHeight: 22, fontStyle: 'italic' },
});
