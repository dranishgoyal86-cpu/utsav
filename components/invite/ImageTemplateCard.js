import { View, Text, Image, StyleSheet } from 'react-native';

// Kids Birthday Theme-Aware Invite Designer — Image Template pilot.
//
// Renders ONE real illustrated invite image (from
// lib/kidsBirthdayImageIdeas.js) as the background, with the real event's
// text painted on top at the slot positions that registry describes — a
// solid rounded patch behind each slot covers that spot on the source
// artwork (where the reference image shows a placeholder word like "AGE"
// or "NAME") so only real, correct text is ever shown to a guest.
//
// Deliberately dumb, same discipline as StaticInviteCard: this component
// does not know about Supabase, schemas, or any other event type — it
// only turns `idea` (art + slot rects) and a few plain strings into pixels.
function formatEventDateLine(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

function buildFieldValue(field, { childName, turningAge, dateLine, timeStr, venueLine }) {
  switch (field) {
    case 'kicker':
      return childName ? `${childName}'s Birthday Mission` : "It's a Birthday Mission!";
    case 'age':
      return turningAge ? `Turning ${turningAge}` : 'AGE';
    case 'nameAge':
      if (childName && turningAge) return `${childName} Turns ${turningAge}`;
      if (childName) return childName;
      return 'You\'re Invited';
    case 'details':
      return [dateLine, timeStr, venueLine].filter(Boolean);
    default:
      return null;
  }
}

export default function ImageTemplateCard({ idea, values = {}, event, primaryVenue }) {
  if (!idea) return null;
  const childName = values.childName || event?.birthday_person_name || null;
  const turningAge = values.turningAge || null;
  const dateLine = formatEventDateLine(event?.event_date);
  const timeStr = event?.event_time || null;
  const venueLine = primaryVenue || null;

  return (
    <View style={[s.wrap, { aspectRatio: idea.aspectRatio || 1060 / 1484 }]}>
      <Image source={idea.image} style={s.image} resizeMode="cover" />
      {(idea.overlays || []).map((overlay, i) => {
        const value = buildFieldValue(overlay.field, { childName, turningAge, dateLine, timeStr, venueLine });
        if (!value || (Array.isArray(value) && value.length === 0)) return null;
        const lines = Array.isArray(value) ? value : [value];
        return (
          <View
            key={i}
            style={[
              s.overlayBox,
              {
                top: `${overlay.rect.top * 100}%`,
                left: `${overlay.rect.left * 100}%`,
                width: `${overlay.rect.width * 100}%`,
                height: `${overlay.rect.height * 100}%`,
                backgroundColor: overlay.bg || 'rgba(255,255,255,0.92)',
              },
            ]}
          >
            {lines.map((line, li) => (
              <Text
                key={li}
                numberOfLines={overlay.multiline ? 1 : 2}
                style={{
                  fontSize: overlay.fontSize || 14,
                  fontWeight: overlay.weight || '700',
                  color: overlay.color || '#222',
                  textAlign: overlay.align || 'center',
                }}
              >
                {line}
              </Text>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { width: '100%', borderRadius: 18, overflow: 'hidden', backgroundColor: '#eee' },
  image: { width: '100%', height: '100%', position: 'absolute' },
  overlayBox: {
    position: 'absolute', borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
  },
});
