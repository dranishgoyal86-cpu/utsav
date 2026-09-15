import { View, Text, Image, ImageBackground, StyleSheet } from 'react-native';

// Read-only render of the Single Page Invite card — the exact same layout
// GuestList.js's editor renders live and captures with ViewShot when a host
// shares an invite, extracted here so InviteDetails.js (the guest's own
// "view my invite" screen) can show the SAME picture the guest received,
// not a re-typed summary of it. Deliberately has no capture ref, no edit
// controls, and no ViewShot wrapper — this is display-only, used on a
// screen the guest can't edit anything from.
//
// `page` is one entry from event_invite_designs.pages (title, hostName,
// message, date, time, venue, imageUri, imagePlacement) — the exact shape
// GuestList.js persists. `colors` is a resolved { bg, accent, text, motif }
// — get it via GuestList.js's own exported resolveInviteDesignColors(
// templateId, variant), the same helper PlanView.js already reuses for
// palette-matching, so this file doesn't need its own copy of the template
// catalog.
export default function InviteCardPreview({ page, colors }) {
  if (!page || !colors) return null;

  const hasImage = !!page.imageUri;
  const placement = page.imagePlacement || 'top';
  const isBackground = hasImage && placement === 'background';
  const isReplace = hasImage && placement === 'replace';
  const textColor = isBackground ? '#FFFFFF' : colors.text;
  const accentColor = isBackground ? '#FFFFFF' : colors.accent;
  const photo = hasImage ? <Image source={{ uri: page.imageUri }} style={s.invitePhoto} /> : null;

  const body = (
    <>
      <Text style={[s.inviteMotif, { color: accentColor }]}>
        {(colors.motif || ['✦', '✧', '✦']).join(' ')}
      </Text>
      {hasImage && placement === 'top' ? photo : null}
      <Text style={[s.inviteTitle, { color: textColor }]}>{page.title}</Text>
      {page.hostName ? (
        <Text style={[s.inviteHost, { color: accentColor }]}>by {page.hostName}</Text>
      ) : null}
      {hasImage && placement === 'middle' ? photo : null}
      <Text style={[s.inviteMessage, { color: textColor }]}>{page.message}</Text>

      <View style={[s.inviteDivider, { backgroundColor: accentColor }]} />

      {page.date ? <Text style={[s.inviteDetail, { color: textColor }]}>📅  {page.date}</Text> : null}
      {page.time ? <Text style={[s.inviteDetail, { color: textColor }]}>🕐  {page.time}</Text> : null}
      {page.venue ? <Text style={[s.inviteDetail, { color: textColor }]}>📍  {page.venue}</Text> : null}

      <View style={[s.inviteFooter, { borderTopColor: accentColor + '44' }]}>
        <Text style={[s.inviteFooterText, { color: accentColor }]}>Make every Celebration AN UTSAV</Text>
      </View>
    </>
  );

  return (
    <View style={[s.inviteCard, { backgroundColor: colors.bg }]}>
      {isReplace ? (
        <Image source={{ uri: page.imageUri }} style={s.inviteFullImage} resizeMode="cover" />
      ) : isBackground ? (
        <ImageBackground
          source={{ uri: page.imageUri }}
          style={[s.inviteBorder, { borderColor: accentColor }]}
          imageStyle={{ borderRadius: 14 }}
        >
          <View style={s.inviteScrim} />
          {body}
        </ImageBackground>
      ) : (
        <View style={[s.inviteBorder, { borderColor: colors.accent }]}>
          {body}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  inviteCard: { borderRadius: 20, padding: 14 },
  inviteBorder: { borderWidth: 1.5, borderRadius: 14, padding: 24, alignItems: 'center', gap: 10 },
  inviteScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 14 },
  inviteFullImage: { width: '100%', aspectRatio: 4 / 5, borderRadius: 14 },
  inviteMotif: { fontSize: 34, letterSpacing: 6, marginBottom: 4, textAlign: 'center' },
  invitePhoto: { width: '100%', height: 160, borderRadius: 14, marginTop: 4, marginBottom: 4 },
  inviteTitle: { fontSize: 26, fontWeight: '800', textAlign: 'center', letterSpacing: 0.5 },
  inviteHost: { fontSize: 13, fontWeight: '600', fontStyle: 'italic' },
  inviteMessage: { fontSize: 13.5, textAlign: 'center', lineHeight: 21, opacity: 0.92, marginTop: 4 },
  inviteDivider: { width: 48, height: 2, borderRadius: 1, marginVertical: 8 },
  inviteDetail: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  inviteFooter: { borderTopWidth: 0.5, marginTop: 16, paddingTop: 12, width: '100%', alignItems: 'center' },
  inviteFooterText: { fontSize: 10.5, fontWeight: '600', letterSpacing: 0.3 },
});
