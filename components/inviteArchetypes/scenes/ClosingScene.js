import { View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';

// Final scene — mandatory attribution + the optional, centrally-controlled
// acquisition CTA (lib/inviteBrandingPolicy.js's resolveAcquisitionCta()).
// This component never decides whether the CTA is enabled — it only
// renders whatever the policy resolved, so a funeral-last-rites invite
// literally cannot show one (acquisition.enabled is forced false upstream).
export default function ClosingScene({ tokens, attributionLine, acquisition }) {
  const c = tokens?.colors;
  return (
    <View style={s.wrap}>
      {acquisition?.enabled ? (
        <TouchableOpacity onPress={() => Linking.openURL('https://theutsavapp.com')}>
          <Text style={[s.cta, { color: c?.accent || '#B8862F' }]}>{acquisition.label}</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={[s.attribution, { color: c?.dim || '#888' }]}>{attributionLine}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 24 },
  cta: { fontSize: 12.5, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  attribution: { fontSize: 10 },
});
