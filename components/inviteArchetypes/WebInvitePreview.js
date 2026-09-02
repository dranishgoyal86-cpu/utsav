import { ScrollView, View, StyleSheet } from 'react-native';
import OpeningScene from './scenes/OpeningScene';
import InvocationScene from './scenes/InvocationScene';
import CoupleScene from './scenes/CoupleScene';
import HonoureeScene from './scenes/HonoureeScene';
import FamilyScene from './scenes/FamilyScene';
import GalleryScene from './scenes/GalleryScene';
import StoryScene from './scenes/StoryScene';
import SpeakersScene from './scenes/SpeakersScene';
import WishingWallScene from './scenes/WishingWallScene';
import GuestAccessScene from './scenes/GuestAccessScene';
import ClosingScene from './scenes/ClosingScene';
import FunctionCard from './utility/FunctionCard';
import MapCard from './utility/MapCard';
import RSVPCard from './utility/RSVPCard';
import TravelCard from './utility/TravelCard';
import StayCard from './utility/StayCard';
import GatePassCard from './utility/GatePassCard';
import DressCodeCard from './utility/DressCodeCard';
import WishingWallCard from './utility/WishingWallCard';
import RegistrationCard from './utility/RegistrationCard';
import TransportCard from './utility/TransportCard';
import ContactCard from './utility/ContactCard';
import TicketCard from './utility/TicketCard';
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
//   stayNote, guestAccessNote, gatePassCode, onGatePassPress,
//   galleryPhotoCount, wishes, onLeaveWishPress, rsvpStatus, onRsvpPress,
//   attributionLine, acquisition, honoureeName, honoureeAgeLine,
//   honoureePhotoUrl, dressCode, isNonFestive }
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
            case 'honouree':
              return <HonoureeScene key={sceneId} tokens={tokens} name={content.honoureeName} ageLine={content.honoureeAgeLine} photoUrl={content.honoureePhotoUrl} />;
            case 'family':
              return <FamilyScene key={sceneId} tokens={tokens} hostedBy={content.hostedBy} parentsNote={content.parentsNote} grandparentsNote={content.grandparentsNote} familySurname={content.familySurname} fatherToBeNote={content.fatherToBeNote} family1Note={content.family1Note} family2Note={content.family2Note} kickerLabel={content.familyKickerLabel} />;
            case 'dress-code':
              return <DressCodeCard key={sceneId} tokens={tokens} dressCode={content.dressCode} />;
            case 'functions':
              return <FunctionCard key={sceneId} tokens={tokens} functions={content.functions} title={content.functionsTitle} />;
            case 'story':
              return <StoryScene key={sceneId} tokens={tokens} text={content.storyText} />;
            case 'speakers':
              return <SpeakersScene key={sceneId} tokens={tokens} speakers={content.speakers} />;
            case 'registration':
              return <RegistrationCard key={sceneId} tokens={tokens} registrationNote={content.registrationNote} registrationUrl={content.registrationUrl} deadline={content.registrationDeadline} onPress={content.onRegisterPress} />;
            case 'tickets':
              return <TicketCard key={sceneId} tokens={tokens} entryNote={content.entryNote} tierNote={content.tierNote} ticketUrl={content.ticketUrl} onPress={content.onTicketPress} />;
            case 'venue':
              return <MapCard key={sceneId} tokens={tokens} venue={content.venue} addressDetail={content.addressDetail} />;
            case 'travel':
              return <TravelCard key={sceneId} tokens={tokens} travelNote={content.travelNote} />;
            case 'stay':
              return <StayCard key={sceneId} tokens={tokens} stayNote={content.stayNote} />;
            case 'transport':
              return <TransportCard key={sceneId} tokens={tokens} meetingPoint={content.meetingPoint} departureTime={content.departureTime} returnTime={content.returnTime} />;
            case 'contact':
              return <ContactCard key={sceneId} tokens={tokens} contactInfo={content.contactInfo} />;
            case 'guest-access':
              // A real bound gate pass takes precedence (GatePassCard is a
              // themed CTA into the real GatePass/PassScanner system); when
              // no pass exists yet, fall back to the plain arrival note.
              return content.gatePassCode
                ? <GatePassCard key={sceneId} tokens={tokens} passCode={content.gatePassCode} note={content.gatePassNote} onPress={content.onGatePassPress} />
                : <GuestAccessScene key={sceneId} tokens={tokens} guestAccessNote={content.guestAccessNote} />;
            case 'rsvp':
              return <RSVPCard key={sceneId} tokens={tokens} rsvpStatus={content.rsvpStatus} onPress={content.onRsvpPress} />;
            case 'gallery':
              return <GalleryScene key={sceneId} tokens={tokens} photoCount={content.galleryPhotoCount} />;
            case 'wishing-wall':
              // WishingWallCard adds the "leave a wish" CTA (and its own
              // isNonFestive guard) when the caller wires one up; otherwise
              // fall back to the read-only wishes display.
              return content.onLeaveWishPress
                ? <WishingWallCard key={sceneId} tokens={tokens} wishes={content.wishes} isNonFestive={content.isNonFestive} onPress={content.onLeaveWishPress} />
                : <WishingWallScene key={sceneId} tokens={tokens} wishes={content.wishes} />;
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
