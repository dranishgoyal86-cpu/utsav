import { View, Text, Image, StyleSheet } from 'react-native';

export default function CoupleScene({ tokens, partner1Name, partner2Name, photoUrl, quote }) {
  if (!partner1Name && !partner2Name) return null;
  const c = tokens?.colors;
  return (
    <View style={s.wrap}>
      {photoUrl ? <Image source={{ uri: photoUrl }} style={s.photo} /> : null}
      <Text style={[s.names, { color: c?.ink || '#1A1A1A', fontFamily: tokens?.fonts?.headline }]}>
        {partner1Name}{partner2Name ? `  &  ${partner2Name}` : ''}
      </Text>
      {quote ? <Text style={[s.quote, { color: c?.dim || '#888' }]}>“{quote}”</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24 },
  photo: { width: 120, height: 120, borderRadius: 60, marginBottom: 16 },
  names: { fontSize: 24, textAlign: 'center' },
  quote: { fontSize: 12.5, fontStyle: 'italic', marginTop: 10, textAlign: 'center' },
});
