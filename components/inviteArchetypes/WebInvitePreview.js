import { ScrollView, View, StyleSheet } from 'react-native';
import OpeningScene from './scenes/OpeningScene';
import InvocationScene from './scenes/InvocationScene';
import CoupleScene from './scenes/CoupleScene';
import FamilyScene from './scenes/FamilyScene';
import GalleryScene from './scenes/GalleryScene';
import WishingWallScene from './scenes/WishingWallScene';
import GuestAccessScene from './scenes/GuestAccessScene';
import ClosingScene from './scenes/ClosingScene';
import FunctionCard from './utility/FunctionCard';
import MapCard from './utility/MapCard';
import RSVPCard from './utility/RSVPCard';
import TravelCard from './utility/TravelCard';
import StayCard from './utility/StayCard';
import UtilityNavBar from './UtilityNavBar';

// Top-level web/mobile invite preview — composes reusable scenes in the
// exact order `scenes` (lib/inviteSceneResolver.js's resolveScenes()
// output) declares, mobile-first (a single vertical ScrollView, no
// desktop-specific branch this wave — matches "mobile-first" from the
// brief, a fuller desktop layout is future polish). This component itself
// resolves NOTHING — scenes, navItems, and every value inside `content`
// are all pre-resolved by the caller (the pilot screen), keeping this a
// pure composition/rendering layer exactly like ToranCoverCard.js already
// is for the legacy cards.
//
// content shape: { kicker, headline, subline, invocationText,
//   partner1Name, partner2Name, couplePhotoUrl, coupleQuote, hostedBy,
//   grandparentsNote, familySurname, functions, venue, travelNote,
//   stayNote, guestAccessNote, galleryPhotoCount, wishes, rsvpStatus,
//   onRsvpPress, attributionLine, acquisition }
export default function WebInvitePreview({ tokens, scenes = [], navItems = [], content = {}, onNavSelect }) {
  const c = tokens?.colors;
  return (
    <View style={[s.wrap, { backgroundColor: c?.bg || '#FAF6EC' }]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {scenes.map((sceneId) => {
          switch (sceneId) {
            case 'opening':
              return <OpeningScene key={sceneId} tokens={tokens} kicker={content.kicker} headline={content.headline} subline={content.subline} />;
            case 'invocation':
              return <InvocationScene key={sceneId} tokens={tokens} text={content.invocationText} />;
            case 'couple':
              return <CoupleScene key={sceneId} tokens={tokens} partner1Name={content.partner1Name} partner2Name={content.partner2Name} photoUrl={content.couplePhotoUrl} quote={content.coupleQuote} />;
            case 'family':
              return <FamilyScene key={sceneId} tokens={tokens} hostedBy={content.hostedBy} grandparentsNote={content.grandparentsNote} familySurname={content.familySurname} />;
            case 'functions':
              return <FunctionCard key={sceneId} tokens={tokens} functions={content.functions} />;
            case 'venue':
              return <MapCard key={sceneId} tokens={tokens} venue={content.venue} />;
            case 'travel':
              return <TravelCard key={sceneId} tokens={tokens} travelNote={content.travelNote} />;
            case 'stay':
              return <StayCard key={sceneId} tokens={tokens} stayNote={content.stayNote} />;
            case 'guest-access':
              return <GuestAccessScene key={sceneId} tokens={tokens} guestAccessNote={content.guestAccessNote} />;
            case 'rsvp':
              return <RSVPCard key={sceneId} tokens={tokens} rsvpStatus={content.rsvpStatus} onPress={content.onRsvpPress} />;
            case 'gallery':
              return <GalleryScene key={sceneId} tokens={tokens} photoCount={content.galleryPhotoCount} />;
            case 'wishing-wall':
              return <WishingWallScene key={sceneId} tokens={tokens} wishes={content.wishes} />;
            case 'closing':
              return <ClosingScene key={sceneId} tokens={tokens} attributionLine={content.attributionLine} acquisition={content.acquisition} />;
            default:
              return null;
          }
        })}
      </ScrollView>
      <UtilityNavBar tokens={tokens} items={navItems} activeItem="invite" onSelect={onNavSelect} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1 },
  scroll: { paddingBottom: 12 },
});
